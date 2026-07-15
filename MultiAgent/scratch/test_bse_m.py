import requests
from bs4 import BeautifulSoup

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

url = "https://m.bseindia.com/StockReach.aspx?scripcd=500112"
try:
    resp = requests.get(url, headers=headers, timeout=15)
    print("Status:", resp.status_code)
    print("Response Length:", len(resp.text))
    
    soup = BeautifulSoup(resp.text, "html.parser")
    # Print some key elements or values
    for span in soup.find_all("span"):
        if span.get("id"):
            print(f"{span.get('id')}: {span.get_text(strip=True)}")
            
    for td in soup.find_all("td"):
        if td.get("id"):
            print(f"{td.get('id')}: {td.get_text(strip=True)}")
            
except Exception as e:
    print("Error:", e)
