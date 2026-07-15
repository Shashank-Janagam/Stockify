import requests

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.bseindia.com/"
}

url = "https://api.bseindia.com/Msource/1D/getQouteSearch.aspx?Type=EQ&text=SBIN&flag=site"
try:
    resp = requests.get(url, headers=headers, timeout=10)
    print("Status:", resp.status_code)
    print("Text:", resp.text)
except Exception as e:
    print("Error:", e)
