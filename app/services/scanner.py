"""
Tarama (Scanner) servisi
BIST hisseleri için EMA 20/50/100 üstü vb. teknik tarama kriterleri.
Toplu veri çekimi (yfinance batch) + kısa süreli önbellek ile maliyet ve yük azaltılır.
"""
import time
from typing import Optional
from datetime import datetime

import yfinance as yf

# Sadece BIST 30 (30 hisse) — tüm BIST yerine sınırlı liste = daha az istek, daha hızlı tarama
BIST_SYMBOLS_DEFAULT = [
    "THYAO", "AKBNK", "GARAN", "ISCTR", "KCHOL", "SAHOL", "EREGL", "KOZAA", "KOZAL",
    "SISE", "TUPRS", "PETKM", "TCELL", "ENKAI", "ASELS", "TOASO", "BIMAS", "VAKBN",
    "SASA", "KONTR", "DOAS", "MGROS", "TKFEN", "PGSUS", "EKGYO", "YKBNK", "ENKA",
    "ODAS", "TSKB", "ARCLK",
]

# Önbellek: son çekilen ham veri (symbols_key -> { "data": { sym: [closes] }, "ts": ... })
_cache: dict = {}
_CACHE_TTL_SEC = 30 * 60  # 30 dakika


def _cache_key(symbols: list[str]) -> str:
    return "|".join(sorted(symbols))


def _fetch_bist_historical_batch_safe(symbols: list[str]) -> dict[str, list[float]]:
    """
    Tüm sembollerin günlük kapanış serisini tek toplu istekle çeker (yfinance).
    Sonuç 30 dakika önbellekte tutulur.
    """
    ckey = _cache_key(symbols)
    now = time.time()
    if ckey in _cache and (now - _cache[ckey]["ts"]) < _CACHE_TTL_SEC:
        return _cache[ckey]["data"]

    tickers = [f"{s}.IS" for s in symbols]
    result: dict[str, list[float]] = {}
    try:
        df = yf.download(
            tickers,
            period="1y",
            interval="1d",
            group_by="ticker",
            auto_adjust=True,
            progress=False,
            threads=True,
        )
        if df.empty or df.size == 0:
            _cache[ckey] = {"data": result, "ts": now}
            return result

        # Çoklu sembol: MultiIndex columns — (Ticker, Price) örn. ('THYAO.IS', 'Close')
        if hasattr(df.columns, "levels") or (df.columns.__len__() > 0 and isinstance(df.columns[0], tuple)):
            for col in df.columns:
                if not isinstance(col, tuple) or len(col) < 2:
                    continue
                a, b = str(col[0]), str(col[1])
                if "Close" not in a and "Close" not in b:
                    continue
                ticker = a if ".IS" in a else b
                sym = ticker.replace(".IS", "").strip()
                if sym not in symbols:
                    continue
                ser = df[col].dropna()
                if len(ser) >= 100:
                    result[sym] = [float(x) for x in ser.tolist()]
        else:
            # Tek sembol: df.columns = ['Open', 'High', 'Low', 'Close', 'Adj Close', 'Volume']
            if "Close" in df.columns:
                ser = df["Close"].dropna()
            else:
                ser = df.iloc[:, 3].dropna() if len(df.columns) >= 4 else None
            if ser is not None and len(ser) >= 100 and symbols:
                result[symbols[0]] = [float(x) for x in ser.tolist()]
    except Exception as e:
        print(f"Scanner batch hatası: {e}")

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
    Veriyi toplu çeker ve 30 dakika önbellekler.
    """
    symbols = symbols or BIST_SYMBOLS_DEFAULT
    # Maksimum 50 sembol — çok büyük listeler hem Yahoo hem süre açısından maliyetli
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
