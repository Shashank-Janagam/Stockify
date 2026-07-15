import requests

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

url = "https://www.bseindia.com/BSEDATA/gross/2026/SCBSEALL100726.TXT"
try:
    resp = requests.get(url, headers=headers, timeout=15)
    print("Status:", resp.status_code)
    print("Response Length:", len(resp.text))
    if resp.status_code == 200:
        print("First 5 lines:")
        print("\n".join(resp.text.splitlines()[:5]))
except Exception as e:
    print("Error:", e)
