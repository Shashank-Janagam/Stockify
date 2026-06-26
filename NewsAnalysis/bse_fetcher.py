import re
import urllib.parse
import requests
from datetime import datetime

class BSECorporatePipeline:
    def __init__(self, company_name):
        self.search_query = self._clean_company_name(company_name)
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://www.bseindia.com/'
        }
        
        # Automatically search and resolve the name to a scrip code on initialization
        self.scrip_code, self.resolved_name = self._search_company_by_name()

    def _clean_company_name(self, name: str) -> str:
        # 1. If it has .NS or .BO, it is a ticker
        if '.' in name and (name.endswith('.NS') or name.endswith('.BO') or name.endswith('.ns') or name.endswith('.bo')):
            return name.split('.')[0]
        # Remove common suffixes
        name = re.sub(r'\b(limited|ltd|corp|corporation|inc|gmbh|co)\b\.?', '', name, flags=re.IGNORECASE)
        # Clean multiple spaces and trim
        name = re.sub(r'\s+', ' ', name).strip()
        return name

    def _search_company_by_name(self):
        """Hits the BSE Autocomplete API to find the closest matching company."""
        # URL encode the search query (e.g., "Tata Motors" -> "Tata%20Motors")
        encoded_query = urllib.parse.quote(self.search_query)
        url = f"https://api.bseindia.com/Msource/1D/getQouteSearch.aspx?Type=EQ&text={encoded_query}&flag=site"
        
        try:
            res = requests.get(url, headers=self.headers, timeout=10)
            
            # Find all lenient matches (since last item might be missing </a>)
            matches = list(re.finditer(r"href=['\"]([^'\"]+/(\d{6})/)['\"]>(.*?)(?=</li>|</a>|$)", res.text, re.IGNORECASE))
            
            if not matches:
                return None, None
                
            parsed_results = []
            for m in matches:
                scrip = m.group(2)
                content = m.group(3)
                
                # Split by <br> or <span> to separate company name from the ticker details
                parts = content.split('<br')
                if len(parts) == 0:
                    parts = content.split('<span')
                
                raw_html_name = parts[0]
                clean_name = re.sub(r'<[^>]+>', '', raw_html_name).replace('&amp;', '&').strip()
                
                # Try to extract ticker from the span tag
                ticker = ""
                span_match = re.search(r'<span>(.*?)</span>', content, re.IGNORECASE)
                if not span_match:
                    span_match = re.search(r'<span>(.*)', content, re.IGNORECASE)
                
                if span_match:
                    span_content = re.sub(r'<[^>]+>', '', span_match.group(1)).replace('&nbsp;', ' ').strip()
                    ticker_parts = span_content.split()
                    if ticker_parts:
                        ticker = ticker_parts[0].strip()
                        
                parsed_results.append({
                    "scrip": scrip,
                    "name": clean_name,
                    "ticker": ticker
                })
                
            # Matching logic:
            # 1. Exact match on ticker (case insensitive)
            for res_item in parsed_results:
                if res_item['ticker'].upper() == self.search_query.upper():
                    return res_item['scrip'], res_item['name']
                    
            # 2. Startswith match on ticker
            for res_item in parsed_results:
                if res_item['ticker'].upper().startswith(self.search_query.upper()):
                    return res_item['scrip'], res_item['name']
                    
            # 3. Exact match on clean name (case insensitive)
            for res_item in parsed_results:
                if res_item['name'].upper() == self.search_query.upper():
                    return res_item['scrip'], res_item['name']
                    
            # 4. Fallback to first result
            return parsed_results[0]['scrip'], parsed_results[0]['name']
            
        except Exception as e:
            print(f"[-] Network error during search: {e}")
            return None, None

    def get_announcements(self):
        """Fetches recent news and corporate filings."""
        if not self.scrip_code: return []
        url = f"https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?strCat=-1&pageno=1&strPrevDate=&strScrip={self.scrip_code}&strSearch=P&strToDate=&strType=C"
        
        # Announcements specifically requires the corporates referer
        local_headers = self.headers.copy()
        local_headers['Referer'] = 'https://www.bseindia.com/corporates/ann.html'
        
        try:
            res = requests.get(url, headers=local_headers, timeout=10)
            data = res.json()
            return data.get('Table', []) if isinstance(data, dict) else []
        except Exception as e:
            print(f"[-] Error getting announcements: {e}")
            return []

def fetch_bse_announcements(symbol: str):
    pipeline = BSECorporatePipeline(symbol)
    if not pipeline.scrip_code:
        return []

    raw_news = pipeline.get_announcements()
    announcements = []
    
    for item in raw_news:
        try:
            # Parse BSE date format: "2024-04-25T14:30:00"
            date_str = item.get('NEWS_DT')
            
            pdf_link = item.get('ATTACHMENTNAME')
            pdf_url = f"https://www.bseindia.com/xml-data/corpfiling/AttachLive/{pdf_link}" if pdf_link else None

            announcements.append({
                "bse_id": str(item.get('NEWSID')),
                "scrip_code": pipeline.scrip_code,
                "symbol": symbol,
                "company_name": pipeline.resolved_name,
                "headline": item.get('HEADLINE', ''),
                "summary": item.get('NEWSSUB', ''),
                "pdf_url": pdf_url,
                "announced_at": date_str,
                "category": "other",  # Default, to be enriched
                "sentiment": "neutral" # Default, to be enriched
            })
        except Exception as e:
            print(f"Error parsing announcement {item}: {e}")

    return announcements

def fetch_overall_market_announcements():
    """Fetches recent news and corporate filings for the overall market (last 50 announcements)."""
    url = "https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?strCat=-1&pageno=1&strPrevDate=&strScrip=&strSearch=P&strToDate=&strType=C"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.bseindia.com/corporates/ann.html'
    }
    
    try:
        res = requests.get(url, headers=headers, timeout=10)
        data = res.json()
        raw_news = data.get('Table', []) if isinstance(data, dict) else []
    except Exception as e:
        print(f"[-] Error getting overall market announcements: {e}")
        return []

    announcements = []
    for item in raw_news:
        try:
            date_str = item.get('NEWS_DT')
            pdf_link = item.get('ATTACHMENTNAME')
            pdf_url = f"https://www.bseindia.com/xml-data/corpfiling/AttachLive/{pdf_link}" if pdf_link else None
            
            # Try to extract the symbol from NSURL if possible
            nsurl = item.get('NSURL', '')
            symbol = ""
            if nsurl and "/" in nsurl:
                parts = [p for p in nsurl.split('/') if p]
                if len(parts) >= 2:
                    symbol = parts[-2].upper()
            
            company_name = item.get('SLONGNAME', '')
            if not symbol:
                symbol = company_name

            announcements.append({
                "bse_id": str(item.get('NEWSID')),
                "scrip_code": str(item.get('SCRIP_CD', '')),
                "symbol": symbol,
                "company_name": company_name,
                "headline": item.get('HEADLINE', ''),
                "summary": item.get('NEWSSUB', ''),
                "pdf_url": pdf_url,
                "announced_at": date_str,
                "category": "other",  
                "sentiment": "neutral" 
            })
        except Exception as e:
            print(f"Error parsing market announcement {item}: {e}")

    return announcements

