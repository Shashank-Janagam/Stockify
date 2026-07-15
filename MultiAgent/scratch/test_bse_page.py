import requests
import re

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.bseindia.com/"
}

url = "https://www.bseindia.com/stock-share-price/state-bank-of-india/sbin/500112/"
try:
    resp = requests.get(url, headers=headers, timeout=15)
    print("Status:", resp.status_code)
    print("Response Length:", len(resp.text))
    
    # Try to find "cocode" or "CoCode" in the text
    matches = re.findall(r"(?i)cocode\s*:\s*['\"]?(\d+)['\"]?", resp.text)
    print("CoCode Matches:", matches)
    
    # Also find all script variables or API calls
    api_calls = re.findall(r"https://api.bseindia.com/[^\s'\"`>]+", resp.text)
    print("Found API calls:", api_calls[:5])
    
except Exception as e:
    print("Error:", e)
