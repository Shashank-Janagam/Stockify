import httpx
import asyncio
from bse_fetcher import fetch_overall_market_announcements

async def main():
    print("Fetching NSE stocks from backend...")
    backend_url = "http://localhost:4000"
    nse_stocks = set()
    stock_name_map = {}
    
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{backend_url}/api/stocks/list", timeout=5.0)
            if response.status_code == 200:
                stocks_list = response.json()
                print(f"Fetched {len(stocks_list)} stocks from backend.")
                for item in stocks_list:
                    sym = item["symbol"].upper()
                    name = item.get("stock_name", "").upper()
                    nse_stocks.add(sym)
                    if name:
                        clean_name = name.replace("LIMITED", "").replace("LTD", "").replace(".", "").replace("&", "AND").strip()
                        stock_name_map[clean_name] = sym
            else:
                print(f"Error status code: {response.status_code}")
        except Exception as e:
            print(f"Error fetching from backend: {e}")

    print("\nNSE Stock Symbols:")
    print(sorted(list(nse_stocks)))
    
    print("\nFetching overall market announcements from BSE...")
    announcements = fetch_overall_market_announcements()
    print(f"Fetched {len(announcements)} announcements.")
    
    print("\nChecking matching logic for each announcement:")
    matched_count = 0
    for ann in announcements:
        ann_symbol = str(ann.get("symbol", "")).upper().strip()
        ann_company = str(ann.get("company_name", "")).upper().strip()
        ann_symbol_base = ann_symbol.split('.')[0]
        
        resolved = None
        # 1. Direct symbol check
        if f"{ann_symbol_base}.NS" in nse_stocks:
            resolved = f"{ann_symbol_base}.NS"
        elif ann_symbol in nse_stocks:
            resolved = ann_symbol
            
        # 2. Check clean name from SQL stocks
        if not resolved:
            clean_ann_company = ann_company.replace("LIMITED", "").replace("LTD", "").replace(".", "").replace("&", "AND").strip()
            for clean_name, sym in stock_name_map.items():
                if clean_name in clean_ann_company or clean_ann_company in clean_name:
                    resolved = sym
                    break
        
        if resolved:
            matched_count += 1
            print(f"[MATCHED] Company: {ann_company} | BSE Ticker: {ann_symbol} | Resolved Symbol: {resolved}")
        else:
            print(f"[UNMATCHED] Company: {ann_company} | BSE Ticker: {ann_symbol}")
            
    print(f"\nTotal matches: {matched_count} out of {len(announcements)}")

if __name__ == "__main__":
    asyncio.run(main())
