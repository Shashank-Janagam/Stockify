import concurrent.futures
import requests
from requests.adapters import HTTPAdapter

urls = [
    "https://www.bseindia.com/xml-data/corpfiling/AttachLive/73e7294b-1953-4c5d-af11-f87d3f24a7b0.pdf",
    "https://www.bseindia.com/xml-data/corpfiling/AttachLive/3baac4ec-7d86-43c6-a7c8-72a1a644541a.pdf",
    "https://www.bseindia.com/xml-data/corpfiling/AttachLive/b6dd096d-32af-4612-805f-d37061e79786.pdf",
    "https://www.bseindia.com/xml-data/corpfiling/AttachLive/24a54355-8c5b-447d-8d84-c2681d021cbe.pdf",
    "https://www.bseindia.com/xml-data/corpfiling/AttachLive/22e6f6fd-f9f2-40c7-930b-3fd8c444df28.pdf"
]

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.bseindia.com/'
}

print("--- Test A: Concurrent with SHARED Session and pool ---")
session = requests.Session()
adapter = HTTPAdapter(pool_connections=20, pool_maxsize=20)
session.mount("https://", adapter)

def fetch_shared(url):
    try:
        res = session.get(url, headers=headers, timeout=12, stream=True)
        return url, res.status_code, len(res.content)
    except Exception as e:
        return url, "FAILED", str(e)

with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
    results = list(executor.map(fetch_shared, urls))
for r in results:
    print(r)

print("\n--- Test B: Concurrent with INDIVIDUAL requests (no shared session) ---")
def fetch_individual(url):
    try:
        res = requests.get(url, headers=headers, timeout=12, stream=True)
        return url, res.status_code, len(res.content)
    except Exception as e:
        return url, "FAILED", str(e)

with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
    results = list(executor.map(fetch_individual, urls))
for r in results:
    print(r)
