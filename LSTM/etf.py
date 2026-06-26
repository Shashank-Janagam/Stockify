import requests

def get_etf_list():
    session = requests.Session()

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.nseindia.com/",
        "Connection": "keep-alive"
    }

    # Step 1: Get cookies
    session.get("https://www.nseindia.com", headers=headers)

    # Step 2: Actual API
    url = "https://www.nseindia.com/api/etf"

    response = session.get(url, headers=headers)

    # 🔍 Debug (IMPORTANT)
    if response.status_code != 200:
        print("Error:", response.status_code)
        print(response.text[:200])
        return []

    try:
        data = response.json()
    except Exception:
        print("Blocked / Not JSON response:")
        print(response.text[:500])
        return []

    etfs = []
    for item in data.get("data", []):
        etfs.append({
            "symbol": item.get("symbol"),
            "name": item.get("meta", {}).get("companyName")
        })

    return etfs


# Test
etfs = get_etf_list()
print(len(etfs))
print(etfs[:5])