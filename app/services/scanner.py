"""
Tarama (Scanner) servisi
BIST hisseleri için EMA tarama ve hacim tarayıcı.
Doğrudan Yahoo Finance Chart API + kısa süreli önbellek.
"""
import time
import requests
import urllib3
from typing import Optional
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# SSL bypass session (yfinance SSL hatası veriyor, doğrudan API kullanıyoruz)
_session = requests.Session()
_session.verify = False
_session.headers.update({"User-Agent": "Mozilla/5.0"})

# Yedek BIST 30 listesi (bigpara API erişilemezse kullanılır)
_BIST_FALLBACK = [
    "THYAO", "AKBNK", "GARAN", "ISCTR", "KCHOL", "SAHOL", "EREGL", "KOZAA", "KOZAL",
    "SISE", "TUPRS", "PETKM", "TCELL", "ENKAI", "ASELS", "TOASO", "BIMAS", "VAKBN",
    "SASA", "KONTR", "DOAS", "MGROS", "TKFEN", "PGSUS", "EKGYO", "YKBNK", "ENKA",
    "ODAS", "TSKB", "ARCLK",
]

# Önbellek
_cache: dict = {}
_CACHE_TTL_SEC = 30 * 60  # 30 dakika

# Dinamik BIST hisse listesi cache'i
_bist_list_cache: dict = {"symbols": None, "ts": 0}
_BIST_LIST_TTL_SEC = 6 * 60 * 60  # 6 saat


def _fetch_all_bist_symbols() -> list[str]:
    """Bigpara API'den tüm BIST hisselerinin listesini çeker (cache: 6 saat)."""
    now = time.time()
    if _bist_list_cache["symbols"] and (now - _bist_list_cache["ts"]) < _BIST_LIST_TTL_SEC:
        return _bist_list_cache["symbols"]

    try:
        resp = _session.get("https://bigpara.hurriyet.com.tr/api/v1/hisse/list", timeout=10)
        if resp.status_code == 200:
            data = resp.json().get("data", [])
            symbols = sorted([item["kod"] for item in data if item.get("tip") == "Hisse" and item.get("kod")])
            if symbols:
                _bist_list_cache["symbols"] = symbols
                _bist_list_cache["ts"] = now
                return symbols
    except Exception:
        pass

    # Fallback
    if _bist_list_cache["symbols"]:
        return _bist_list_cache["symbols"]
    return _BIST_FALLBACK


# EMA tarama için eski isim korunuyor (endpoint uyumluluğu)
BIST_SYMBOLS_DEFAULT = _BIST_FALLBACK


def _cache_key(symbols: list[str], fields: str = "close") -> str:
    return f"{fields}|{len(symbols)}"  # sembol sayısı yeterli (tümü taranıyor)


def _fetch_yahoo_chart(symbol: str, days: int = 365) -> Optional[dict]:
    """
    Tek sembol için Yahoo Finance Chart API'den veri çeker.
    Dönen: { "close": [...], "volume": [...] } veya None
    """
    yf_symbol = f"{symbol}.IS"
    start_dt = datetime.now() - timedelta(days=days)
    period1 = int(start_dt.timestamp())
    period2 = int(datetime.now().timestamp())

    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{yf_symbol}"
        f"?period1={period1}&period2={period2}&interval=1d"
    )
    try:
        resp = _session.get(url, timeout=15)
        if resp.status_code != 200:
            return None
        data = resp.json()
        result = data.get("chart", {}).get("result")
        if not result:
            return None

        chart = result[0]
        timestamps = chart.get("timestamp", [])
        quotes = chart.get("indicators", {}).get("quote", [{}])[0]

        if not timestamps:
            return None

        closes = quotes.get("close", [])
        volumes = quotes.get("volume", [])

        # None değerleri filtrele (piyasa kapanmamışsa son gün None olabilir)
        filtered_close = []
        filtered_volume = []
        for i in range(len(timestamps)):
            c = closes[i] if i < len(closes) else None
            v = volumes[i] if i < len(volumes) else None
            if c is not None and v is not None:
                filtered_close.append(float(c))
                filtered_volume.append(float(v))

        if not filtered_close:
            return None

        return {"close": filtered_close, "volume": filtered_volume}
    except Exception:
        return None


def _fetch_batch_parallel(symbols: list[str], days: int = 365, max_workers: int = 10) -> dict[str, dict]:
    """Sembolleri paralel çeker."""
    result = {}
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_map = {executor.submit(_fetch_yahoo_chart, sym, days): sym for sym in symbols}
        for future in as_completed(future_map):
            sym = future_map[future]
            try:
                data = future.result()
                if data:
                    result[sym] = data
            except Exception:
                pass
    return result


def _fetch_bist_historical_batch_safe(symbols: list[str]) -> dict[str, list[float]]:
    """
    Tüm sembollerin günlük kapanış serisini çeker.
    Sonuç 30 dakika önbellekte tutulur.
    """
    ckey = _cache_key(symbols)
    now = time.time()
    if ckey in _cache and (now - _cache[ckey]["ts"]) < _CACHE_TTL_SEC:
        return _cache[ckey]["data"]

    raw = _fetch_batch_parallel(symbols, days=365)
    result = {sym: data["close"] for sym, data in raw.items() if len(data["close"]) >= 100}

    _cache[ckey] = {"data": result, "ts": now}
    return result


def _fetch_bist_ohlcv_batch(symbols: list[str]) -> dict[str, dict]:
    """
    Close + Volume serisini çeker. Hacim tarayıcı için.
    Dönen: { sym: { "close": [...], "volume": [...] } }
    """
    ckey = _cache_key(symbols, "ohlcv")
    now = time.time()
    if ckey in _cache and (now - _cache[ckey]["ts"]) < _CACHE_TTL_SEC:
        return _cache[ckey]["data"]

    raw = _fetch_batch_parallel(symbols, days=60, max_workers=15)
    result = {sym: data for sym, data in raw.items() if len(data["close"]) >= 21}

    _cache[ckey] = {"data": result, "ts": now}
    return result


def _calc_ema(closes: list[float], period: int) -> Optional[float]:
    """Son N günlük close fiyatlarından EMA(period) hesaplar."""
    if not closes or len(closes) < period:
        return None
    k = 2 / (period + 1)
    ema = sum(closes[:period]) / period
    for i in range(period, len(closes)):
        ema = closes[i] * k + ema * (1 - k)
    return round(ema, 4)


def scan_bist_above_ema(
    symbols: Optional[list[str]] = None,
    ema_periods: list[int] = (20, 50, 100),
) -> list[dict]:
    """
    BIST hisselerinde fiyatın tüm verilen EMA'ların üstünde olduğu hisseleri tarar.
    """
    symbols = symbols or BIST_SYMBOLS_DEFAULT
    symbols = symbols[:50]

    series_map = _fetch_bist_historical_batch_safe(symbols)
    results = []
    for sym in symbols:
        closes = series_map.get(sym)
        if not closes or len(closes) < 100:
            continue
        current_close = closes[-1]
        emas = {}
        for p in ema_periods:
            ema_val = _calc_ema(closes, p)
            if ema_val is None:
                break
            emas[f"ema_{p}"] = ema_val
        if len(emas) != len(ema_periods):
            continue
        if not all(current_close > emas[f"ema_{p}"] for p in ema_periods):
            continue
        results.append({
            "symbol": sym,
            "close": round(current_close, 2),
            **emas,
        })
    return results


def _classify_volume_signal(spike_day_change: float, change_5d: float) -> str:
    """
    Hacim spike'ını fiyat hareketiyle birlikte yorumla.
    spike_day_change: spike günündeki fiyat değişimi (%)
    change_5d: son 5 günlük fiyat değişimi (%)
    """
    if spike_day_change > 1.0 and change_5d > 2.0:
        return "strong_buy"     # Güçlü Alım: spike günü yukarı + 5g trend yukarı
    if spike_day_change > 0.5:
        return "buy"            # Alım: spike günü yukarı
    if spike_day_change < -3.0:
        return "panic_sell"     # Panik Satış: spike günü sert düşüş
    if spike_day_change < -0.5:
        return "sell_pressure"  # Satış Baskısı: spike günü aşağı
    return "accumulation"       # El Değiştirme / Birikim: fiyat yatay, hacim yüksek


def scan_bist_volume(
    symbols: Optional[list[str]] = None,
    min_ratio: float = 1.5,
    lookback_days: int = 5,
) -> list[dict]:
    """
    BIST hisselerinde hacim artışı taraması.
    Son `lookback_days` gün içinde herhangi bir günde
    Hacim Oranı (= O günün hacmi / 20 günlük ort.) >= min_ratio olan hisseleri döner.
    En yüksek spike günü raporlanır.
    """
    symbols = symbols or _fetch_all_bist_symbols()
    lookback_days = max(1, min(lookback_days, 20))

    ohlcv = _fetch_bist_ohlcv_batch(symbols)
    results = []
    for sym in symbols:
        data = ohlcv.get(sym)
        if not data:
            continue
        closes = data["close"]
        volumes = data["volume"]
        if len(closes) < 25 or len(volumes) < 25:
            continue

        # Son lookback_days gün içinde en yüksek ratio'yu bul
        best_ratio = 0.0
        best_vol = 0
        best_avg = 0
        best_offset = 0  # 0 = bugün, 1 = dün, ...

        for offset in range(lookback_days):
            idx = len(volumes) - 1 - offset
            if idx < 21:
                break
            day_vol = volumes[idx]
            # O günden önceki 20 günün ortalaması
            avg_20 = sum(volumes[idx - 20:idx]) / 20
            if avg_20 <= 0:
                continue
            r = day_vol / avg_20
            if r > best_ratio:
                best_ratio = r
                best_vol = day_vol
                best_avg = avg_20
                best_offset = offset

        if best_ratio < min_ratio:
            continue

        # Fiyat değişimleri (en son kapanış bazlı)
        close_now = closes[-1]
        change_1d = ((closes[-1] / closes[-2]) - 1) * 100 if len(closes) >= 2 and closes[-2] != 0 else 0
        change_5d = ((closes[-1] / closes[-6]) - 1) * 100 if len(closes) >= 6 and closes[-6] != 0 else 0

        # Spike günündeki fiyat değişimi (o günün kapanış vs bir önceki gün)
        spike_idx = len(closes) - 1 - best_offset
        spike_change = 0.0
        if spike_idx >= 1 and closes[spike_idx - 1] != 0:
            spike_change = ((closes[spike_idx] / closes[spike_idx - 1]) - 1) * 100

        # Sinyal etiketi: hacim + fiyat birlikte yorumla
        signal = _classify_volume_signal(spike_change, change_5d)

        results.append({
            "symbol": sym,
            "volume_ratio": round(best_ratio, 2),
            "volume": int(best_vol),
            "avg_volume": int(best_avg),
            "close": round(close_now, 2),
            "change_1d": round(change_1d, 2),
            "change_5d": round(change_5d, 2),
            "days_ago": best_offset,
            "signal": signal,
        })

    results.sort(key=lambda x: x["volume_ratio"], reverse=True)
    return results


def get_bist_historical_for_symbol(symbol: str) -> Optional[dict]:
    """Tek sembol için son fiyat + EMA 20/50/100. Önbellek kullanır."""
    series_map = _fetch_bist_historical_batch_safe([symbol])
    closes = series_map.get(symbol)
    if not closes or len(closes) < 100:
        return None
    current = closes[-1]
    return {
        "symbol": symbol,
        "close": round(current, 2),
        "ema_20": _calc_ema(closes, 20),
        "ema_50": _calc_ema(closes, 50),
        "ema_100": _calc_ema(closes, 100),
        "history": [{"date": "", "close": c} for c in closes[-30:]],
    }
