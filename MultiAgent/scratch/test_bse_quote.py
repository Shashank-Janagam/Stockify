import requests

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.bseindia.com/"
}

# 1. Scrip Header
url1 = "https://api.bseindia.com/BseIndiaAPI/service/getScripHeaderCharacterData.aspx?CoCode=0&ScripCd=500112&flag=sent&status="
try:
    resp = requests.get(url1, headers=headers, timeout=10)
    print("Header Status:", resp.status_code)
    print("Header Data:", resp.text)
except Exception as e:
    print("Header Error:", e)

# 2. Scrip Details (which usually has delivery data)
# Let's try some other common BSE APIs:
# https://api.bseindia.com/BseIndiaAPI/service/Largetrade.aspx?scripcode=500112
# https://api.bseindia.com/BseIndiaAPI/service/stockreachgraphic.aspx?scripcode=500112
url2 = "https://api.bseindia.com/BseIndiaAPI/service/stockreachgraphic.aspx?scripcode=500112&flag=g&seriesid="
try:
    resp2 = requests.get(url2, headers=headers, timeout=10)
    print("StockReach Status:", resp2.status_code)
    print("StockReach Data:", resp2.text[:1000])
except Exception as e:
    print("StockReach Error:", e)
