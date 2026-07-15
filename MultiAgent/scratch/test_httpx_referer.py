import httpx
import time

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.nseindia.com/",
    "Connection": "keep-alive"
}

with httpx.Client(http2=True, headers=headers) as client:
    print("Fetching main page with HTTP/2...")
    try:
        r1 = client.get("https://www.nseindia.com", timeout=10)
        print("Status 1:", r1.status_code)
        
        time.sleep(2)
        
        print("Fetching quote-equity API...")
        r2 = client.get("https://www.nseindia.com/api/quote-equity?symbol=SBIN", timeout=10)
        print("Status 2:", r2.status_code)
        if r2.status_code == 200:
            print("Parsed JSON keys:", r2.json().keys())
            print("deliveryToTradedQuantity:", r2.json().get('securityWiseDP', {}).get('deliveryToTradedQuantity'))
        else:
            print("Response text:", r2.text[:200])
    except Exception as e:
        print("Failed:", e)
