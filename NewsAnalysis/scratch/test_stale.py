import requests
import time

pdf_url_1 = "https://www.bseindia.com/xml-data/corpfiling/AttachLive/73e7294b-1953-4c5d-af11-f87d3f24a7b0.pdf"
pdf_url_2 = "https://www.bseindia.com/xml-data/corpfiling/AttachLive/3baac4ec-7d86-43c6-a7c8-72a1a644541a.pdf"

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.bseindia.com/'
}

session = requests.Session()

print("Request 1...")
try:
    res = session.get(pdf_url_1, headers=headers, timeout=12)
    print(f"Request 1 Status: {res.status_code}")
except Exception as e:
    print(f"Request 1 Failed: {e}")

print("Waiting 15 seconds (typical keep-alive idle timeout)...")
time.sleep(15)

print("Request 2 (reusing session)...")
try:
    res = session.get(pdf_url_2, headers=headers, timeout=12)
    print(f"Request 2 Status: {res.status_code}")
except Exception as e:
    print(f"Request 2 Failed: {e}")
