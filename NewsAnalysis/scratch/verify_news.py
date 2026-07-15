import requests

print("--- Requesting live news for TCS via Backend Proxy (Port 4000) ---")
try:
    res = requests.get("http://localhost:4000/api/news/stock/TCS?live=true")
    print("Status:", res.status_code)
    data = res.json()
    print("Announcements returned:")
    for ann in data.get("data", []):
        print(f"- Symbol: {ann.get('symbol')}, Company: {ann.get('company_name')}, Category: {ann.get('category')}, Sentiment: {ann.get('sentiment')}")
        print(f"  Headline: {ann.get('headline')}")
except Exception as e:
    print("Failed request:", e)
