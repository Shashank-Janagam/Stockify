# # import yfinance as yf

# # def get_company_profile(ticker_symbol):
# #     try:
# #         # Create the ticker instance
# #         ticker = yf.Ticker(ticker_symbol)
        
# #         # Fetch the comprehensive metadata dictionary
# #         info = ticker.info
        
# #         # Extract individual profile metrics
# #         profile_data = {
# #             "symbol": ticker_symbol,
# #             "company_name": info.get("longName", "N/A"),
# #             "sector": info.get("sector", "N/A"),
# #             "industry": info.get("industry", "N/A"),
# #             "website": info.get("website", "N/A"),
# #             # This is the core text block representing the company's profile
# #             "summary_text": info.get("longBusinessSummary", "No corporate summary available.")
# #         }
# #         return profile_data
        
# #     except Exception as e:
# #         print(f"Error fetching data for {ticker_symbol}: {e}")
# #         return None

# # # Example Usage
# # profile = get_company_profile("RELIANCE.NS")

# # if profile:
# #     print(f"--- {profile['company_name']} ({profile['symbol']}) Profile ---")
# #     print(f"Sector: {profile['sector']} | Industry: {profile['industry']}")
# #     print(f"Website: {profile['website']}\n")
# #     print("Business Summary:")
# #     print(profile['summary_text'])
# #     print("------------------------------------------------------")
# #     print(profile)

import finnhub

finnhub_client = finnhub.Client(api_key="d5cj5r1r01qgl5onejegd5cj5r1r01qgl5onejf0")

def get_finnhub_indian_profile(ticker_symbol):
    try:
        # Append the National Stock Exchange suffix required by Finnhub
        formatted_ticker = f"{ticker_symbol}.NS"
        
        profile = finnhub_client.company_profile2(symbol=formatted_ticker)
        return profile
    except Exception as e:
        print(f"Error pulling Indian asset data: {e}")
        return None
# Fetch data for Infosys
infy_raw = get_finnhub_indian_profile("INFY")
print(infy_raw)

import requests
from bs4 import BeautifulSoup
import json

def fetch_updated_indian_company_data(ticker_symbol):
    """
    Connects directly to real-time Indian corporate filings and financial indices.
    Strips away rate limits to return raw, updated corporate statistics.
    """
    # Clean up the ticker name for standard Indian portals (TCS, INFY, RELIANCE)
    clean_symbol = ticker_symbol.replace(".NS", "").replace(".BO", "").replace(".BOM", "").upper()
    
    # Screener provides real-time updated data for both NSE and BSE companies
    url = f"https://www.screener.in/company/{clean_symbol}/"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    print(f"Extracting live data parameters for Indian Asset: {clean_symbol}...")
    
    try:
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code != 200:
            print(f"[-] Could not find corporate data for '{clean_symbol}'. Check spelling.")
            return None
            
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Initialize our raw data object
        company_data = {
            "Symbol": clean_symbol,
            "Market": "NSE / BSE India",
            "Metrics": {}
        }
        
        # 1. Extract Live Updated Profile Text
        about_div = soup.find("div", class_="about")
        if about_div:
            # Clean up the parsed layout text
            company_data["Corporate_Profile"] = about_div.get_text().replace("About", "").strip()
        else:
            company_data["Corporate_Profile"] = "Summary description profile block currently loading on corporate register."

        # 2. Extract Real-Time Key Financial Data Points
        top_ratios = soup.find("ul", id="top-ratios")
        if top_ratios:
            for li in top_ratios.find_all("li"):
                name_span = li.find("span", class_="name")
                value_span = li.find("span", class_="number")
                
                if name_span and value_span:
                    key = name_span.get_text().strip().replace("\n", "").replace("  ", "")
                    val = value_span.get_text().strip()
                    company_data["Metrics"][key] = val
                    
        # 3. Extract Real-Time Pros and Cons Lists
        pros_cons = {"Pros": [], "Cons": []}
        pros_div = soup.find("div", class_="pros")
        cons_div = soup.find("div", class_="cons")
        
        if pros_div:
            pros_cons["Pros"] = [li.get_text().strip() for li in pros_div.find_all("li")]
        if cons_div:
            pros_cons["Cons"] = [li.get_text().strip() for li in cons_div.find_all("li")]
            
        company_data["Analysis_Signals"] = pros_cons

        return company_data

    except Exception as e:
        print(f"[-] Network connection interrupted or structure changed: {e}")
        return None

if __name__ == "__main__":
    # Test with any Indian stock code directly 
    TARGET_ASSET = "RELIANCE" 
    
    raw_payload = fetch_updated_indian_company_data(TARGET_ASSET)
    
    if raw_payload:
        print("\n================== LIVE UPDATED DATA BLOCK ==================\n")
        print(json.dumps(raw_payload, indent=4))