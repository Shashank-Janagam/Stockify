import requests

try:
    res = requests.get("http://localhost:5001/api/news")
    print("Status:", res.status_code)
    print("Response JSON:")
    print(res.json())
except Exception as e:
    print("Failed to request API:", e)
