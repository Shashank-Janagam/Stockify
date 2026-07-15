import requests

try:
    res = requests.get("http://localhost:5001/api/news/stock/TCS.NS")
    print("Status:", res.status_code)
    print("Data:", res.json())
except Exception as e:
    print("Error:", e)
