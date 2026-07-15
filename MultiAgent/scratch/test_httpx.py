import httpx
import time

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive"
}

with httpx.Client(http2=True, headers=headers) as client:
    print("Fetching main page with HTTP/2...")
    try:
        r1 = client.get("https://www.nseindia.com", timeout=10)
        print("Status:", r1.status_code)
        print("Cookies:", r1.cookies)
        
        time.sleep(2)
        
        print("Fetching quote-equity API...")
        r2 = client.get("https://www.nseindia.com/api/quote-equity?symbol=SBIN", timeout=10)
        print("Status:", r2.status_code)
        print("Response length:", len(r2.text))
        if r2.status_code == 200:
            print("Parsed JSON keys:", r2.json().keys())
            print("deliveryToTradedQuantity:", r2.json().get('securityWiseDP', {}).get('deliveryToTradedQuantity'))
    except Exception as e:
        print("Failed:", e)
