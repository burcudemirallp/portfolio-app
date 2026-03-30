"""
Fiyat çekme servisleri
Farklı kaynaklardan (BIST, NYSE, NASDAQ, altın, TEFAS fonları, Binance kripto vb.) fiyat çeker
"""
import os
import yfinance as yf
import requests
from datetime import datetime, timedelta
from typing import Optional
import json
import re
import urllib3
import ssl
from curl_cffi.requests import Session as CffiSession

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
ssl._create_default_https_context = ssl._create_unverified_context
os.environ.setdefault("PYTHONHTTPSVERIFY", "0")
os.environ.setdefault("CURL_CA_BUNDLE", "")
os.environ.setdefault("REQUESTS_CA_BUNDLE", "")

_cffi_session = CffiSession(verify=False)

# Yahoo Finance için HTTP headers
YAHOO_FINANCE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
}



class PriceFetcher:
    """Farklı kaynaklardan fiyat çeken ana sınıf"""
    
    @staticmethod
    def fetch_price(symbol: str, market: str, asset_type: str) -> Optional[dict]:
        """
        Enstrüman bilgilerine göre fiyat çeker
        
        Args:
            symbol: Enstrüman sembolü (örn: THYAO, AAPL, GC=F, AAK, BTCUSDT)
            market: Piyasa (BIST, NYSE, NASDAQ, COMMODITY, TEFAS, BEFAS, Binance, Kripto)
            asset_type: Varlık tipi (stock, fund, gold, silver, Fon, Kripto)
        
        Returns:
            dict: {"price": float, "currency": str, "source": str} veya None
        """
        
        # Kripto (Binance)
        if market.lower() in ["binance", "kripto", "crypto"] or asset_type.lower() in ["kripto", "crypto", "cryptocurrency"]:
            return PriceFetcher._fetch_binance_price(symbol)
        
        # TEFAS/BEFAS fonları
        elif market in ["TEFAS", "BEFAS"] or asset_type.lower() in ["fon", "fund"]:
            # Yöntem 1: TEFAS API
            result = PriceFetcher._fetch_tefas_fund_price(symbol)
            if result:
                return result
            
            # Yöntem 2: Alternatif TEFAS API
            result = PriceFetcher._fetch_alternative_tefas_price(symbol)
            if result:
                return result
            
            # Yöntem 3: Web Scraping
            result = PriceFetcher._fetch_tefas_price_by_scraping(symbol)
            if result:
                return result
            
            # Yöntem 4: Yahoo Finance (bazı büyük fonlar orada olabilir)
            return PriceFetcher._fetch_yahoo_price(symbol)
        
        elif market == "BIST":
            return PriceFetcher._fetch_bist_price(symbol)
        elif market in ["NYSE", "NASDAQ"]:
            return PriceFetcher._fetch_us_stock_price(symbol)
        elif asset_type in ["gold", "silver"]:
            return PriceFetcher._fetch_commodity_price(asset_type)
        else:
            # Genel yfinance denemesi
            return PriceFetcher._fetch_yahoo_price(symbol)
    
    @staticmethod
    def _fetch_bist_price_from_investing(symbol: str) -> Optional[dict]:
        """
        Investing.com'dan BIST hisse fiyatı çeker (Yahoo'da olmayan hisseler için)
        """
        try:
            # Investing.com için basit scraping
            url = f"https://www.investing.com/search/?q={symbol}"
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
            
            response = requests.get(url, headers=headers, verify=False, timeout=10)
            
            if response.status_code == 200:
                html = response.text
                # Basit regex ile fiyat bul
                price_patterns = [
                    r'data-test="instrument-price-last">([0-9,\.]+)',
                    r'class="text-2xl[^>]*>([0-9,\.]+)',
                ]
                
                for pattern in price_patterns:
                    match = re.search(pattern, html)
                    if match:
                        price_str = match.group(1).replace(',', '')
                        price = float(price_str)
                        if price > 0:
                            return {
                                "price": price,
                                "currency": "TRY",
                                "source": "investing_com"
                            }
        except Exception as e:
            print(f"Investing.com hatası ({symbol}): {e}")
        
        return None
    
    @staticmethod
    def _fetch_bist_price(symbol: str) -> Optional[dict]:
        """
        BIST hisselerinin fiyatını çeker
        Direkt Yahoo Finance API kullanır (SSL sorunu için)
        """
        try:
            yahoo_symbol = f"{symbol}.IS"
            
            # Yöntem 1: Direkt Yahoo Finance API (SSL bypass)
            try:
                url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_symbol}"
                params = {
                    "interval": "1d",
                    "range": "5d"
                }
                headers = {
                    "User-Agent": "Mozilla/5.0"
                }
                
                response = requests.get(url, params=params, headers=headers, verify=False, timeout=10)
                
                if response.status_code == 200:
                    data = response.json()
                    result = data.get("chart", {}).get("result", [])
                    if result:
                        quotes = result[0].get("indicators", {}).get("quote", [{}])[0]
                        closes = quotes.get("close", [])
                        # En son None olmayan fiyatı bul
                        for close_price in reversed(closes):
                            if close_price and close_price > 0:
                                return {
                                    "price": float(close_price),
                                    "currency": "TRY",
                                    "source": "yahoo_api"
                                }
            except Exception as e:
                print(f"Yahoo API hatası ({symbol}): {e}")
            
            # Yöntem 2: yfinance (SSL sorunu yoksa çalışır)
            try:
                ticker = yf.Ticker(yahoo_symbol, session=_cffi_session)
                hist = ticker.history(period="5d")
                if not hist.empty:
                    price = float(hist['Close'].iloc[-1])
                    if price > 0:
                        return {
                            "price": price,
                            "currency": "TRY",
                            "source": "yfinance"
                        }
            except Exception as e:
                print(f"yfinance hatası ({symbol}): {e}")
            
            # Yöntem 3: Investing.com (Yahoo'da olmayan hisseler için)
            investing_result = PriceFetcher._fetch_bist_price_from_investing(symbol)
            if investing_result:
                return investing_result
                
        except Exception as e:
            print(f"BIST fiyat çekme hatası ({symbol}): {e}")
        
        return None
    
    @staticmethod
    def _fetch_us_stock_price(symbol: str) -> Optional[dict]:
        """ABD hisse senetlerinin fiyatını çeker - direkt Yahoo Finance API"""
        try:
            # Önce direkt Yahoo Finance API (daha güvenilir)
            yahoo_api_url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
            params = {
                "range": "1d",
                "interval": "1d"
            }
            
            response = requests.get(
                yahoo_api_url,
                params=params,
                headers=YAHOO_FINANCE_HEADERS,
                timeout=15,
                verify=False
            )
            
            if response.status_code == 200:
                data = response.json()
                if data and 'chart' in data and 'result' in data['chart']:
                    result = data['chart']['result']
                    if result and len(result) > 0:
                        meta = result[0].get('meta', {})
                        price = meta.get('regularMarketPrice') or meta.get('previousClose')
                        
                        if price:
                            print(f"✓ US stock API başarılı ({symbol}): ${price}")
                            return {
                                "price": float(price),
                                "currency": "USD",
                                "source": "yahoo_api"
                            }
            
            # Fallback: Alternatif Yahoo endpoint (query2)
            print(f"Yahoo API başarısız ({symbol}), alternatif endpoint deneniyor...")
            try:
                alt_url = f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"
                alt_response = requests.get(
                    alt_url,
                    params={"range": "1d", "interval": "1d"},
                    headers=YAHOO_FINANCE_HEADERS,
                    timeout=15,
                    verify=False
                )
                
                if alt_response.status_code == 200:
                    alt_data = alt_response.json()
                    if alt_data and 'chart' in alt_data and 'result' in alt_data['chart']:
                        alt_result = alt_data['chart']['result']
                        if alt_result and len(alt_result) > 0:
                            meta = alt_result[0].get('meta', {})
                            price = meta.get('regularMarketPrice') or meta.get('previousClose')
                            
                            if price:
                                print(f"✓ Alternatif endpoint başarılı ({symbol}): ${price}")
                                return {
                                    "price": float(price),
                                    "currency": "USD",
                                    "source": "yahoo_api_alt"
                                }
            except Exception as e:
                print(f"Alternatif endpoint hatası ({symbol}): {e}")
                
        except Exception as e:
            print(f"US stock fiyat çekme hatası ({symbol}): {e}")
        
        return None
    
    @staticmethod
    def _fetch_commodity_price(commodity_type: str) -> Optional[dict]:
        """
        Emtia fiyatlarını çeker (altın, gümüş vb.)
        
        Altın: GC=F (Gold Futures) - ons/USD
        Gümüş: SI=F (Silver Futures)
        """
        try:
            symbol_map = {
                "gold": "GC=F",
                "silver": "SI=F"
            }
            
            yahoo_symbol = symbol_map.get(commodity_type.lower())
            if not yahoo_symbol:
                return None
            
            ticker = yf.Ticker(yahoo_symbol, session=_cffi_session)
            info = ticker.info
            price = info.get('regularMarketPrice') or info.get('currentPrice')
            
            if price:
                return {
                    "price": float(price),
                    "currency": "USD",
                    "source": "yahoo_finance"
                }
            
            # Alternatif
            try:
                price = ticker.fast_info.get('lastPrice')
                if price:
                    return {
                        "price": float(price),
                        "currency": "USD",
                        "source": "yahoo_finance"
                    }
            except:
                pass
                
        except Exception as e:
            print(f"Commodity fiyat çekme hatası ({commodity_type}): {e}")
        
        return None
    
    @staticmethod
    def fetch_gold_price_per_gram(purity: int = 24, currency: str = "TRY") -> Optional[dict]:
        """
        Altın fiyatını gram bazında çeker
        
        Args:
            purity: Altın ayarı (22, 24)
            currency: Hedef para birimi (TRY, USD)
        
        Returns:
            dict: {"price": float, "currency": str, "source": str} veya None
        """
        try:
            # Önce direkt Yahoo Finance API ile dene (SSL bypass)
            import requests
            url = "https://query1.finance.yahoo.com/v8/finance/chart/GC=F"
            headers = {'User-Agent': 'Mozilla/5.0'}
            
            try:
                response = requests.get(url, headers=headers, timeout=10, verify=False)
                if response.status_code == 200:
                    data = response.json()
                    price_per_ounce = data['chart']['result'][0]['meta']['regularMarketPrice']
                    if price_per_ounce:
                        # Başarılı!
                        pass
                    else:
                        raise Exception("No price in API response")
                else:
                    raise Exception(f"API returned {response.status_code}")
            except Exception as e:
                # Fallback: yfinance kullan
                print(f"Yahoo API hatası, yfinance deneniyor: {e}")
                ticker = yf.Ticker("GC=F", session=_cffi_session)
                info = ticker.info
                price_per_ounce = info.get('regularMarketPrice') or info.get('currentPrice')
                
                if not price_per_ounce:
                    try:
                        price_per_ounce = ticker.fast_info.get('lastPrice')
                    except:
                        pass
                
                if not price_per_ounce:
                    return None
            
            # Ons'tan gram'a çevir (1 ons = 31.1035 gram)
            price_per_gram_usd = float(price_per_ounce) / 31.1035
            
            # Ayar hesaplaması (24 ayar = %100, 22 ayar = %91.67, 18 ayar = %75)
            purity_ratio = {
                24: 1.0,
                22: 22/24,  # 0.9167
                18: 18/24,  # 0.75
                14: 14/24   # 0.5833
            }
            
            ratio = purity_ratio.get(purity, 1.0)
            price_per_gram_usd = price_per_gram_usd * ratio
            
            # Para birimi dönüşümü
            if currency.upper() == "TRY":
                # USD/TRY kurunu çek
                from .fx import FXService
                usd_try_rate = FXService.get_rate("USD", "TRY")
                
                if not usd_try_rate:
                    print("USD/TRY kuru alınamadı, altın fiyatı USD olarak döndürülüyor")
                    return {
                        "price": price_per_gram_usd,
                        "currency": "USD",
                        "source": "yahoo_finance",
                        "purity": purity
                    }
                
                price_per_gram = price_per_gram_usd * usd_try_rate
                return {
                    "price": price_per_gram,
                    "currency": "TRY",
                    "source": "yahoo_finance",
                    "purity": purity
                }
            else:
                return {
                    "price": price_per_gram_usd,
                    "currency": "USD",
                    "source": "yahoo_finance",
                    "purity": purity
                }
                
        except Exception as e:
            print(f"Altın fiyat çekme hatası: {e}")
        
        return None
    
    @staticmethod
    def _fetch_yahoo_price(symbol: str) -> Optional[dict]:
        """Genel Yahoo Finance fiyat çekme"""
        try:
            ticker = yf.Ticker(symbol, session=_cffi_session)
            info = ticker.info
            price = info.get('regularMarketPrice') or info.get('currentPrice')
            currency = info.get('currency', 'USD')
            
            if price:
                return {
                    "price": float(price),
                    "currency": currency.upper(),
                    "source": "yahoo_finance"
                }
                
        except Exception as e:
            print(f"Yahoo Finance fiyat çekme hatası ({symbol}): {e}")
        
        return None
    
    @staticmethod
    def _fetch_tefas_fund_price(fund_code: str) -> Optional[dict]:
        """
        TEFAS (Türkiye Elektronik Fon Alım Satım Platformu) fonlarının fiyatını çeker
        
        Args:
            fund_code: Fon kodu (örn: AAK, TQA, AZE, KCV vb.)
        
        Returns:
            dict: {"price": float, "currency": str, "source": str} veya None
        
        Örnek TEFAS kodları:
        - AAK: Ak Portföy Kısa Vadeli Tahvil Fonu
        - TQA: Tacirler Portföy Değişken Fon
        - AZE: Azimut PYŞ Değişken Fon
        - KCV: Kuveyt Türk Portföy Çoklu Varlık Katılım Fonu
        """
        try:
            # Önce basit JSON endpoint'i dene (TEFAS'ın mobil API'si)
            try:
                simple_url = f"https://www.tefas.gov.tr/api/DB/BindComparisonDetailInfo"
                payload = {"fontip": fund_code.upper()}
                headers = {
                    "User-Agent": "Mozilla/5.0",
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                }
                response = requests.post(simple_url, json=payload, headers=headers, timeout=10, verify=False)
                
                if response.status_code == 200:
                    data = response.json()
                    if data and len(data) > 0:
                        # İlk sonuç
                        fund_data = data[0]
                        price = fund_data.get('FIYAT') or fund_data.get('fiyat')
                        if price:
                            return {
                                "price": float(price),
                                "currency": "TRY",
                                "source": "tefas_mobile"
                            }
            except Exception as e:
                print(f"TEFAS mobile API hatası ({fund_code}): {e}")
            
            # Fallback: TEFAS API endpoint'i - BindHistoryInfo
            end_date = datetime.now()
            start_date = end_date - timedelta(days=10)  # Son 10 gün (hafta sonu + tatil için)
            
            url = "https://www.tefas.gov.tr/api/DB/BindHistoryInfo"
            
            payload = {
                "fontip": fund_code.upper(),
                "bastarih": start_date.strftime("%d.%m.%Y"),
                "bittarih": end_date.strftime("%d.%m.%Y"),
                "fonturkod": "",
                "fonunvantip": ""
            }
            
            headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://www.tefas.gov.tr/"
            }
            
            response = requests.post(url, json=payload, headers=headers, timeout=30, verify=False)
            
            if response.status_code == 200:
                data = response.json()
                
                # En son fiyatı al
                if data and isinstance(data, list) and len(data) > 0:
                    latest = data[-1]  # Son kayıt
                    
                    # TEFAS'ta fiyat "FIYAT" alanında
                    price = latest.get("FIYAT") or latest.get("fiyat") or latest.get("Fiyat")
                    
                    if price:
                        return {
                            "price": float(str(price).replace(',', '.')),  # Virgülü noktaya çevir
                            "currency": "TRY",
                            "source": "tefas",
                            "date": latest.get("TARIH") or latest.get("tarih") or latest.get("Tarih")
                        }
            
            # Yanıt boşsa veya hatalıysa debug için yazdır
            print(f"TEFAS API yanıtı ({fund_code}): status={response.status_code}, data_length={len(response.text)}")
            if response.text:
                print(f"TEFAS response preview: {response.text[:200]}")
            
        except requests.exceptions.Timeout:
            print(f"TEFAS API timeout ({fund_code})")
        except Exception as e:
            print(f"TEFAS fiyat çekme hatası ({fund_code}): {e}")
            import traceback
            traceback.print_exc()
        
        return None
    
    @staticmethod
    def _fetch_alternative_tefas_price(fund_code: str) -> Optional[dict]:
        """
        Alternatif TEFAS fiyat çekme yöntemi
        BindHistoryAllocation endpoint'ini kullanır
        """
        try:
            # TEFAS'ın alternatif API endpoint'i - BindHistoryAllocation
            url = "https://www.tefas.gov.tr/api/DB/BindHistoryAllocation"
            
            end_date = datetime.now()
            start_date = end_date - timedelta(days=10)
            
            payload = {
                "fontip": fund_code.upper(),
                "bastarih": start_date.strftime("%d.%m.%Y"),
                "bittarih": end_date.strftime("%d.%m.%Y")
            }
            
            headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://www.tefas.gov.tr/"
            }
            
            response = requests.post(url, json=payload, headers=headers, timeout=30, verify=False)
            
            if response.status_code == 200:
                data = response.json()
                
                if data and isinstance(data, list) and len(data) > 0:
                    latest = data[-1]  # Son kayıt
                    price = latest.get("FIYAT") or latest.get("fiyat") or latest.get("Fiyat")
                    
                    if price:
                        return {
                            "price": float(str(price).replace(',', '.')),
                            "currency": "TRY",
                            "source": "tefas_allocation"
                        }
            
            print(f"Alternatif TEFAS yanıtı ({fund_code}): status={response.status_code}")
                        
        except Exception as e:
            print(f"Alternatif TEFAS çekme hatası ({fund_code}): {e}")
        
        return None
    
    @staticmethod
    def _fetch_tefas_price_by_scraping(fund_code: str) -> Optional[dict]:
        """
        TEFAS web sitesinden scraping ile fiyat çeker
        API çalışmazsa bu yöntem kullanılır
        """
        try:
            # TEFAS fon detay sayfası
            url = f"https://www.tefas.gov.tr/FonAnaliz.aspx?FonKod={fund_code.upper()}"
            
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
                "Referer": "https://www.tefas.gov.tr/"
            }
            
            response = requests.get(url, headers=headers, timeout=30, allow_redirects=True, verify=False)
            
            if response.status_code == 200:
                html = response.text
                
                # Çoklu pattern dene - daha agresif
                price_patterns = [
                    # Pattern 1: Son Fiyat (TL) ile başlayan satır
                    r'Son Fiyat[^0-9]*([0-9]+[,\.][0-9]{2,})',
                    
                    # Pattern 2: Sadece büyük sayılar (fon fiyatları genelde 0.1-100 arası)
                    r'>([0-9]{1,2}[,\.][0-9]{4,})<',
                    
                    # Pattern 3: price class'ı
                    r'class=["\'].*?price.*?["\'][^>]*>([0-9]+[,\.][0-9]+)',
                    
                    # Pattern 4: Herhangi bir td içinde ondalıklı sayı
                    r'<td[^>]*>\s*([0-9]+[,\.][0-9]{4,})\s*</td>',
                    
                    # Pattern 5: Span içinde ondalıklı sayı
                    r'<span[^>]*>\s*([0-9]+[,\.][0-9]{4,})\s*</span>',
                    
                    # Pattern 6: Div içinde ondalıklı sayı
                    r'<div[^>]*>\s*([0-9]+[,\.][0-9]{4,})\s*</div>',
                ]
                
                found_prices = []
                
                for pattern in price_patterns:
                    matches = re.finditer(pattern, html, re.IGNORECASE | re.DOTALL)
                    for match in matches:
                        try:
                            price_str = match.group(1)
                            # Virgülü noktaya çevir
                            price_str = price_str.replace(',', '.')
                            price = float(price_str)
                            
                            # Makul bir fon fiyatı mı? (0.001 - 1000 arası)
                            if 0.001 < price < 1000:
                                found_prices.append(price)
                        except:
                            continue
                
                if found_prices:
                    # En yaygın fiyatı seç veya ilkini al
                    price = found_prices[0]
                    print(f"TEFAS scraping başarılı ({fund_code}): {price} (Bulunan: {len(found_prices)} fiyat)")
                    return {
                        "price": price,
                        "currency": "TRY",
                        "source": "tefas_scraping"
                    }
                
                print(f"TEFAS scraping: Fiyat bulunamadı ({fund_code})")
                print(f"HTML length: {len(html)}")
                # "Son Fiyat" kelimesinin olup olmadığını kontrol et
                if "Son Fiyat" in html or "son fiyat" in html.lower():
                    print("'Son Fiyat' metni bulundu ama fiyat parse edilemedi")
                    # Son Fiyat çevresindeki 200 karakteri yazdır
                    idx = html.lower().find("son fiyat")
                    if idx > 0:
                        print(f"Context: {html[max(0, idx-50):idx+150]}")
                        
        except Exception as e:
            print(f"TEFAS scraping hatası ({fund_code}): {e}")
            import traceback
            traceback.print_exc()
        
        return None
    
    @staticmethod
    def search_tefas_fund(search_term: str) -> list:
        """
        TEFAS'ta fon arar
        
        Args:
            search_term: Aranacak terim (fon adı veya kodu)
        
        Returns:
            list: Bulunan fonların listesi
        """
        try:
            url = "https://www.tefas.gov.tr/api/DB/BindComparisonFundList"
            
            headers = {
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
            
            response = requests.post(url, json={}, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                
                if data and isinstance(data, list):
                    # Arama terimine göre filtrele
                    search_lower = search_term.lower()
                    results = []
                    
                    for fund in data:
                        fund_code = fund.get("FONKODU", "")
                        fund_name = fund.get("FONUNVAN", "")
                        
                        if search_lower in fund_code.lower() or search_lower in fund_name.lower():
                            results.append({
                                "code": fund_code,
                                "name": fund_name,
                                "type": fund.get("FONTIPI", "")
                            })
                    
                    return results[:20]  # İlk 20 sonuç
                        
        except Exception as e:
            print(f"TEFAS arama hatası: {e}")
        
        return []
    
    @staticmethod
    def _fetch_binance_price(symbol: str) -> Optional[dict]:
        """
        Binance'den kripto fiyatı çeker (Public API - API key gerektirmez)
        
        Args:
            symbol: Trading pair sembolü (örn: BTCUSDT, ETHUSDT, BNBUSDT)
                   Eğer sadece BTC girilirse otomatik BTCUSDT'ye çevrilir
        
        Returns:
            dict: {"price": float, "currency": str, "source": str} veya None
        """
        try:
            # Sembol formatını düzenle
            symbol_upper = symbol.upper().strip()
            
            # Eğer USDT, BUSD, TRY gibi quote currency yoksa, varsayılan olarak USDT ekle
            # Uzun quote currency'leri önce kontrol et (USDT, BUSD önce, sonra USD, TRY)
            quote_currencies = ["USDT", "BUSD", "USDC", "TUSD", "TRY", "EUR", "GBP", "AUD"]
            has_quote = False
            quote_currency = "USDT"  # default
            
            # Quote currency'yi tespit et (uzun olanları önce kontrol et)
            for q in quote_currencies:
                if symbol_upper.endswith(q) and len(symbol_upper) > len(q):
                    has_quote = True
                    quote_currency = q
                    trading_pair = symbol_upper
                    break
            
            if not has_quote:
                # Varsayılan olarak USDT ekle
                trading_pair = f"{symbol_upper}USDT"
                quote_currency = "USDT"
            
            # Binance Public API - Ticker Price
            url = "https://api.binance.com/api/v3/ticker/price"
            params = {"symbol": trading_pair}
            
            response = requests.get(url, params=params, verify=False, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                price = float(data["price"])
                
                # Quote currency'ye göre para birimi belirle
                if quote_currency == "TRY":
                    currency = "TRY"
                elif quote_currency in ["USDT", "USD", "BUSD"]:
                    currency = "USD"
                elif quote_currency == "EUR":
                    currency = "EUR"
                else:
                    # BTC, ETH gibi crypto quote'lar için USD kabul et
                    currency = "USD"
                
                return {
                    "price": price,
                    "currency": currency,
                    "source": f"binance_{trading_pair}"
                }
            
            # Eğer USDT çalışmazsa, TRY dene (Türk kullanıcılar için)
            elif quote_currency == "USDT" and not symbol_upper.endswith("TRY"):
                try:
                    base_symbol = symbol_upper.replace("USDT", "").replace("BUSD", "")
                    trading_pair_try = f"{base_symbol}TRY"
                    params_try = {"symbol": trading_pair_try}
                    
                    response_try = requests.get(url, params=params_try, verify=False, timeout=10)
                    if response_try.status_code == 200:
                        data_try = response_try.json()
                        price_try = float(data_try["price"])
                        
                        return {
                            "price": price_try,
                            "currency": "TRY",
                            "source": f"binance_{trading_pair_try}"
                        }
                except:
                    pass
            
            print(f"Binance API hatası ({trading_pair}): {response.status_code} - {response.text}")
            return None
            
        except Exception as e:
            print(f"Binance fiyat çekme hatası ({symbol}): {e}")
            return None
    
    @staticmethod
    def search_binance_symbols(query: str, limit: int = 20) -> list:
        """
        Binance'de sembol arama (trading pair listesi)
        
        Args:
            query: Arama terimi (örn: BTC, ETH, BNB)
            limit: Maksimum sonuç sayısı
        
        Returns:
            list: [{"symbol": "BTCUSDT", "base": "BTC", "quote": "USDT"}, ...]
        """
        try:
            # Binance Exchange Info API
            url = "https://api.binance.com/api/v3/exchangeInfo"
            response = requests.get(url, verify=False, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                symbols = data.get("symbols", [])
                
                query_upper = query.upper().strip()
                results = []
                
                for symbol_info in symbols:
                    if symbol_info["status"] != "TRADING":
                        continue
                    
                    symbol = symbol_info["symbol"]
                    base = symbol_info["baseAsset"]
                    quote = symbol_info["quoteAsset"]
                    
                    # Arama: base asset veya symbol içinde query varsa
                    if query_upper in base or query_upper in symbol:
                        results.append({
                            "symbol": symbol,
                            "base": base,
                            "quote": quote,
                            "name": f"{base}/{quote}"
                        })
                        
                        if len(results) >= limit:
                            break
                
                return results
                
        except Exception as e:
            print(f"Binance sembol arama hatası: {e}")
        
        return []


def fetch_instrument_price(symbol: str, market: str, asset_type: str) -> Optional[dict]:
    """
    Kolaylık fonksiyonu - dışarıdan çağrılabilir
    """
    return PriceFetcher.fetch_price(symbol, market, asset_type)

