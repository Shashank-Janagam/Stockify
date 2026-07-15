import requests

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

url = "https://groww.in/v1/api/stocks_data/v1/quick_options/underlying/sbin"
try:
    resp = requests.get(url, headers=headers, timeout=10)
    print("Status:", resp.status_code)
    if resp.status_code == 200:
        data = resp.json()
        print("Keys:", data.keys())
        print("First option detail preview:", data.get('optionChains', [])[0] if data.get('optionChains') else None)
except Exception as e:
    print("Error:", e)
