import requests
import httpx
import urllib.request
import ssl

pdf_url = "https://www.bseindia.com/xml-data/corpfiling/AttachLive/73e7294b-1953-4c5d-af11-f87d3f24a7b0.pdf"

print("--- Test 1: Simple requests.get (no session, with headers) ---")
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.bseindia.com/',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}
try:
    res = requests.get(pdf_url, headers=headers, timeout=10)
    print(f"Status: {res.status_code}, Length: {len(res.content)}")
except Exception as e:
    print(f"Failed: {e}")

print("\n--- Test 2: requests.get with Connection: close ---")
headers_close = headers.copy()
headers_close['Connection'] = 'close'
try:
    res = requests.get(pdf_url, headers=headers_close, timeout=10)
    print(f"Status: {res.status_code}, Length: {len(res.content)}")
except Exception as e:
    print(f"Failed: {e}")

print("\n--- Test 3: httpx.get ---")
try:
    with httpx.Client(headers=headers) as client:
        res = client.get(pdf_url, timeout=10)
        print(f"Status: {res.status_code}, Length: {len(res.content)}")
except Exception as e:
    print(f"Failed: {e}")

print("\n--- Test 4: urllib.request ---")
try:
    req = urllib.request.Request(pdf_url, headers=headers)
    context = ssl._create_unverified_context()
    with urllib.request.urlopen(req, context=context, timeout=10) as response:
        content = response.read()
        print(f"Status: {response.status}, Length: {len(content)}")
except Exception as e:
    print(f"Failed: {e}")
