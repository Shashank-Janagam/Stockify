import re
import urllib.parse
import requests

class BSECorporatePipeline:
    def __init__(self, company_name):
        self.search_query = company_name
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://www.bseindia.com/'
        }
        
        # Automatically search and resolve the name to a scrip code on initialization
        self.scrip_code, self.resolved_name = self._search_company_by_name()

    def _search_company_by_name(self):
        """Hits the BSE Autocomplete API to find the closest matching company."""
        # URL encode the search query (e.g., "Tata Motors" -> "Tata%20Motors")
        encoded_query = urllib.parse.quote(self.search_query)
        url = f"https://api.bseindia.com/Msource/1D/getQouteSearch.aspx?Type=EQ&text={encoded_query}&flag=site"
        
        try:
            res = requests.get(url, headers=self.headers, timeout=10)
            
            # The API returns HTML list items. We use Regex to find the first link.
            # Example target: href='https://www.bseindia.com/.../532540/'><strong>Tata Consultancy Services</strong>
            match = re.search(r"href=['\"]([^'\"]+/(\d{6})/)['\"]>(.*?)</a>", res.text, re.IGNORECASE)
            
            if match:
                scrip = match.group(2)
                raw_html_name = match.group(3)
                
                # Clean out bold tags and messy HTML entities like &nbsp;
                clean_name = re.sub(r'<[^>]+>', '', raw_html_name).replace('&amp;', '&')
                # Split by &nbsp; to drop the extra ticker and ISIN garbage at the end
                clean_name = clean_name.split('&nbsp;')[0].strip()
                
                # Sometimes the ticker is mashed into the name (e.g. "TATA CONSULTANCY SERVICES LTDTCS")
                # We can do a basic cleanup to remove trailing "TCS" if needed, but this is cleaner.
                return scrip, clean_name
            else:
                return None, None
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
        except:
            return []

    def get_financial_results(self):
        """Fetches quarterly and annual financial results table data."""
        if not self.scrip_code: return None
        url = f"https://api.bseindia.com/BseIndiaAPI/api/CorpFinancials/w?scripcode={self.scrip_code}"
        
        # Add stock-specific referer to bypass blocks
        local_headers = self.headers.copy()
        local_headers['Referer'] = f'https://www.bseindia.com/stock-share-price/company/{self.scrip_code}/'
        
        try:
            res = requests.get(url, headers=local_headers, timeout=10)
            data = res.json()
            if not isinstance(data, dict):
                print(f"  [-] Financial API returned unexpected data: {str(data)[:100]}")
                return None
            return data
        except Exception as e:
            print(f"  [-] Financials Error: {e}")
            return None

    def get_shareholding_pattern(self):
        """Fetches promoter vs public equity allocation percentages."""
        if not self.scrip_code: return None
        url = f"https://api.bseindia.com/BseIndiaAPI/api/ShareHoldingPage/w?scripcode={self.scrip_code}"
        
        local_headers = self.headers.copy()
        local_headers['Referer'] = f'https://www.bseindia.com/stock-share-price/company/{self.scrip_code}/'
        
        try:
            res = requests.get(url, headers=local_headers, timeout=10)
            data = res.json()
            if not isinstance(data, dict):
                print(f"  [-] Shareholding API returned unexpected data: {str(data)[:100]}")
                return None
            return data
        except Exception as e:
            print(f"  [-] Shareholding Error: {e}")
            return None

    def get_corporate_actions(self):
        """Fetches historical dividends, stock splits, bonuses, and rights issues."""
        if not self.scrip_code: return None
        url = f"https://api.bseindia.com/BseIndiaAPI/api/CorpAction/w?scripcode={self.scrip_code}"
        
        local_headers = self.headers.copy()
        local_headers['Referer'] = f'https://www.bseindia.com/stock-share-price/company/{self.scrip_code}/'
        
        try:
            res = requests.get(url, headers=local_headers, timeout=10)
            data = res.json()
            if not isinstance(data, dict):
                print(f"  [-] Corporate Action API returned unexpected data: {str(data)[:100]}")
                return None
            return data
        except Exception as e:
            print(f"  [-] Corporate Actions Error: {e}")
            return None


# ==========================================
# EXECUTION / TESTING
# ==========================================
if __name__ == "__main__":
    # You can now search by standard names!
    search_term = "Tata Consultancy"
    print(f"[*] Searching BSE for: '{search_term}'...")
    
    pipeline = BSECorporatePipeline(search_term)
    
    if pipeline.scrip_code:
        print(f"[+] Match Found!")
        print(f"    Resolved Name: {pipeline.resolved_name}")
        print(f"    Scrip Code:    {pipeline.scrip_code}")
        print("-" * 50)
        
        # 1. Get Latest News
        print("\n[*] Fetching Latest News...")
        news = pipeline.get_announcements()
        for item in news[:2]:
            print(f"  -> [{item.get('NEWS_DT')}] {item.get('HEADLINE')}")
            
        # 2. Get Corporate Actions (Dividends)
        print("\n[*] Fetching Corporate Actions (Dividends/Splits)...")
        actions = pipeline.get_corporate_actions()
        if actions and 'Table' in actions and actions['Table']:
            for action in actions['Table'][:2]:
                print(f"  -> {action.get('PURPOSE')} (Ex-Date: {action.get('BC_RD_FROM')})")
        else:
            print("  -> No recent corporate actions found or data blocked.")

        # 3. Get Shareholding 
        print("\n[*] Fetching Shareholding Pattern...")
        shareholding = pipeline.get_shareholding_pattern()
        if shareholding and 'Table' in shareholding and shareholding['Table']:
            for group in shareholding['Table'][:2]:
                print(f"  -> {group.get('Category')}: {group.get('Holding_per')}%")
        else:
            print("  -> No shareholding data found or data blocked.")
                
    else:
        print(f"[-] Could not find any matching company for '{search_term}'.")