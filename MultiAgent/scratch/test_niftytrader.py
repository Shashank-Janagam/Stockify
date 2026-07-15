import requests
import re

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

url = "https://www.niftytrader.in/stock-analysis/sbin"
try:
    resp = requests.get(url, headers=headers, timeout=10)
    print("Status:", resp.status_code)
    print("Length:", len(resp.text))
    # Look for PCR or put call ratio
    matches = re.findall(r"(?i)pcr\s*:\s*([\d\.]+)", resp.text)
    print("PCR Matches:", matches)
    
    # Let's search for any decimal number next to "Put Call Ratio"
    pcr_text = re.findall(r"Put-Call Ratio[^\d]+([\d\.]+)", resp.text)
    print("Put-Call Ratio text matches:", pcr_text)
except Exception as e:
    print("Error:", e)
