"""
Döviz kuru servisi
USD/TRY, EUR/TRY gibi kurları çeker
"""
import os
import time
import yfinance as yf
import requests
from typing import Optional, Dict
from datetime import datetime, timedelta
import urllib3
import ssl
from curl_cffi.requests import Session as CffiSession

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
ssl._create_default_https_context = ssl._create_unverified_context
os.environ["PYTHONHTTPSVERIFY"] = "0"
os.environ["CURL_CA_BUNDLE"] = ""
os.environ["REQUESTS_CA_BUNDLE"] = ""

_cffi_session = CffiSession(verify=False)


class FXService:
    """Döviz kuru çekme servisi"""
    _cache = {}
    _cache_ttl = 300  # 5 minutes

    # Yahoo Finance'de döviz çiftleri
    FX_PAIRS = {
        "USDTRY": "USDTRY=X",
        "EURTRY": "EURTRY=X",
        "GBPTRY": "GBPTRY=X",
        "JPYTRY": "JPYTRY=X",
        "CHFTRY": "CHFTRY=X",
    }
    
    @staticmethod
    def _fetch_from_tcmb(currency: str) -> Optional[float]:
        """
        TCMB (Türkiye Cumhuriyet Merkez Bankası) API'sinden kur çeker
        
        Args:
            currency: Para birimi (USD, EUR, GBP)
        
        Returns:
            float: Kur değeri veya None
        """
        # Para birimi mapping'i try dışında tanımla
        currency_map = {
            "USD": "USD",
            "EUR": "EUR",
            "GBP": "GBP",
            "JPY": "JPY",
            "CHF": "CHF"
        }
        
        tcmb_code = currency_map.get(currency.upper())
        if not tcmb_code:
            return None
        
        try:
            import xml.etree.ElementTree as ET

            for day_offset in range(7):
                d = datetime.now() - timedelta(days=day_offset)
                url = f"https://www.tcmb.gov.tr/kurlar/{d.strftime('%Y%m')}/{d.strftime('%d%m%Y')}.xml"
                try:
                    response = requests.get(url, verify=False, timeout=5)
                except Exception:
                    continue
                if response.status_code != 200:
                    continue
                root = ET.fromstring(response.content)
                for currency_elem in root.findall('Currency'):
                    code = currency_elem.get('CurrencyCode') or currency_elem.get('Kod')
                    if code == tcmb_code:
                        forex_selling = currency_elem.find('ForexSelling')
                        if forex_selling is not None and forex_selling.text:
                            return float(forex_selling.text)
                        banknote_selling = currency_elem.find('BanknoteSelling')
                        if banknote_selling is not None and banknote_selling.text:
                            return float(banknote_selling.text)

        except Exception as e:
            print(f"TCMB kur çekme hatası ({currency}): {e}")
        
        return None
    
    @staticmethod
    def get_rate(from_currency: str, to_currency: str = "TRY") -> Optional[float]:
        """
        İki para birimi arasındaki kuru çeker
        
        Args:
            from_currency: Kaynak para birimi (USD, EUR, vb.)
            to_currency: Hedef para birimi (varsayılan: TRY)
        
        Returns:
            float: Kur değeri veya None
        """
        # Aynı para birimiyse 1 döndür
        if from_currency.upper() == to_currency.upper():
            return 1.0

        cache_key = f"{from_currency.upper()}_{to_currency.upper()}"
        now = time.time()
        if cache_key in FXService._cache:
            cached_rate, cached_time = FXService._cache[cache_key]
            if now - cached_time < FXService._cache_ttl:
                return cached_rate

        # TRY'den başka bir para birimine çeviriyorsak, ters işlem yap
        if from_currency.upper() == "TRY":
            rate = FXService.get_rate(to_currency, "TRY")
            result = (1.0 / rate) if rate else None
            if result is not None:
                FXService._cache[cache_key] = (result, time.time())
            return result
        
        # TRY'ye çeviriyorsak önce TCMB'yi dene (Türkiye için en güncel)
        if to_currency.upper() == "TRY":
            tcmb_rate = FXService._fetch_from_tcmb(from_currency)
            if tcmb_rate and tcmb_rate > 0:
                print(f"TCMB'den kur alındı: {from_currency}/TRY = {tcmb_rate}")
                FXService._cache[cache_key] = (tcmb_rate, time.time())
                return tcmb_rate
        
        # Yahoo Finance sembolünü oluştur
        pair_key = f"{from_currency.upper()}{to_currency.upper()}"
        yahoo_symbol = FXService.FX_PAIRS.get(pair_key)
        
        if not yahoo_symbol:
            # Eğer tanımlı değilse, genel format dene
            yahoo_symbol = f"{pair_key}=X"
        
        try:
            ticker = yf.Ticker(yahoo_symbol, session=_cffi_session)
            
            # Yöntem 1: history (en güvenilir)
            try:
                hist = ticker.history(period="5d")
                if not hist.empty:
                    rate = float(hist['Close'].iloc[-1])
                    if rate and rate > 0:
                        FXService._cache[cache_key] = (rate, time.time())
                        return rate
            except Exception as e:
                print(f"FX history hatası ({pair_key}): {e}")
            
            # Yöntem 2: fast_info
            try:
                if hasattr(ticker, 'fast_info'):
                    rate = ticker.fast_info.get('lastPrice')
                    if rate and rate > 0:
                        rate = float(rate)
                        FXService._cache[cache_key] = (rate, time.time())
                        return rate
            except Exception as e:
                print(f"FX fast_info hatası ({pair_key}): {e}")
            
            # Yöntem 3: info (en yavaş)
            try:
                info = ticker.info
                rate = info.get('regularMarketPrice') or info.get('currentPrice') or info.get('previousClose')
                if rate and rate > 0:
                    rate = float(rate)
                    FXService._cache[cache_key] = (rate, time.time())
                    return rate
            except Exception as e:
                print(f"FX info hatası ({pair_key}): {e}")
                
        except Exception as e:
            print(f"FX rate çekme hatası ({pair_key}): {e}")
        
        return None
    
    @staticmethod
    def get_all_rates() -> Dict[str, Optional[float]]:
        """
        Tüm tanımlı döviz kurlarını çeker
        
        Returns:
            dict: {"USDTRY": 34.50, "EURTRY": 37.20, ...}
        """
        rates = {}
        
        for pair_key in FXService.FX_PAIRS.keys():
            from_currency = pair_key[:3]
            to_currency = pair_key[3:]
            rate = FXService.get_rate(from_currency, to_currency)
            rates[pair_key] = rate
        
        return rates
    
    @staticmethod
    def convert(amount: float, from_currency: str, to_currency: str = "TRY") -> Optional[float]:
        """
        Miktar çevirisi yapar
        
        Args:
            amount: Çevrilecek miktar
            from_currency: Kaynak para birimi
            to_currency: Hedef para birimi (varsayılan: TRY)
        
        Returns:
            float: Çevrilmiş miktar veya None
        """
        rate = FXService.get_rate(from_currency, to_currency)
        if rate is None:
            return None
        
        return amount * rate


# Kolaylık fonksiyonları
def get_usd_try_rate() -> Optional[float]:
    """USD/TRY kurunu döndürür"""
    return FXService.get_rate("USD", "TRY")


def get_eur_try_rate() -> Optional[float]:
    """EUR/TRY kurunu döndürür"""
    return FXService.get_rate("EUR", "TRY")


def convert_to_try(amount: float, currency: str) -> Optional[float]:
    """Herhangi bir para biriminden TRY'ye çevirir"""
    return FXService.convert(amount, currency, "TRY")

