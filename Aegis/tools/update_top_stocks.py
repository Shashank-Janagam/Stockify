import json
import os
import ssl
import pandas as pd

# Disable SSL verification for pandas read_html
ssl._create_default_https_context = ssl._create_unverified_context

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOP_STOCKS_PATH = os.path.join(BASE_DIR, "top_stocks.json")

def update_top_stocks():
    print("Fetching latest Nifty 50 constituents from Wikipedia...")
    try:
        url = 'https://en.wikipedia.org/wiki/NIFTY_50'
        import requests
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        import io
        tables = pd.read_html(io.StringIO(response.text))
        # Usually the 3rd table (index 2) contains the list of companies
        nifty50_table = None
        for i, table in enumerate(tables):
            if 'Symbol' in table.columns and 'Company name' in table.columns:
                nifty50_table = table
                break
        
        if nifty50_table is not None:
            symbols = nifty50_table['Symbol'].tolist()
            # Clean symbols just in case
            symbols = [str(s).strip() for s in symbols]
            
            with open(TOP_STOCKS_PATH, "w", encoding="utf-8") as f:
                json.dump(symbols, f, indent=2)
                
            print(f"Successfully updated top_stocks.json with {len(symbols)} symbols.")
        else:
            print("Could not find the Nifty 50 table on the Wikipedia page.")
            
    except Exception as e:
        print(f"Error fetching top stocks: {e}")

if __name__ == "__main__":
    update_top_stocks()
