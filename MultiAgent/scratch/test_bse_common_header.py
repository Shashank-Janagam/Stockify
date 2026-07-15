import requests

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.bseindia.com/"
}

# 1. getcommonheader.aspx
url1 = "https://api.bseindia.com/BseIndiaAPI/service/getcommonheader.aspx?scripcode=500112"
try:
    resp1 = requests.get(url1, headers=headers, timeout=10)
    print("Status 1:", resp1.status_code)
    print("Text 1:", resp1.text[:500])
except Exception as e:
    print("Error 1:", e)

# 2. Let's try to query: https://api.bseindia.com/BseIndiaAPI/service/getScripHeaderCharacterData.aspx?CoCode=9106&ScripCd=500112&flag=sent
# Wait, let's see if getcommonheader returns CoCode!
