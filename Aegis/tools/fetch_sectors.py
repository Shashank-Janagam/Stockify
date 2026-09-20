import json
import os
import time
import yfinance as yf

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SUBSCRIPTIONS_PATH = os.path.join(BASE_DIR, "subscriptions.json")
SECTORS_PATH = os.path.join(BASE_DIR, "sectors.json")

def main():
    print(f"Reading subscriptions from {SUBSCRIPTIONS_PATH}")
    if not os.path.exists(SUBSCRIPTIONS_PATH):
        print("subscriptions.json not found.")
        return
        
    with open(SUBSCRIPTIONS_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    instruments = data if isinstance(data, list) else data.get("instruments", data.get("stocks", []))
    print(f"Found {len(instruments)} instruments to process.")
    
    # Load existing sectors
    sectors_map = {}
    if os.path.exists(SECTORS_PATH):
        with open(SECTORS_PATH, "r", encoding="utf-8") as f:
            sectors_map = json.load(f)
            
    # Keep track of already processed symbols to resume easily
    processed = set()
    for sec, syms in sectors_map.items():
        processed.update(syms)
        
    print(f"Already processed {len(processed)} symbols.")
        
    count = 0
    for item in instruments:
        sym = (item.get("symbol") or "").strip().upper()
        if not sym or sym in processed:
            continue
            
        # skip indices/mutual funds
        name_upper = (item.get("name") or "").upper()
        if "^" in sym or "NIFTY 50" in name_upper or "SENSEX" in name_upper or "MUTUAL FUND" in name_upper or "AMC" in name_upper or "ETF" in name_upper or "BEES" in sym:
            continue
            
        yf_sym = f"{sym}.NS" if not sym.endswith(".NS") and not sym.endswith(".BO") else sym
        
        try:
            ticker = yf.Ticker(yf_sym)
            info = ticker.info or {}
            sector = info.get("sector", "Diversified")
            
            if sector not in sectors_map:
                sectors_map[sector] = []
                
            if sym not in sectors_map[sector]:
                sectors_map[sector].append(sym)
                
            print(f"Fetched {sym} -> {sector}")
        except Exception as e:
            print(f"Failed {sym}: {e}")
            
        count += 1
        
        # Save every 10 items
        if count % 10 == 0:
            with open(SECTORS_PATH, "w", encoding="utf-8") as f:
                json.dump(sectors_map, f, indent=2)
                
        time.sleep(0.5) # rate limit prevention

    # Final save
    with open(SECTORS_PATH, "w", encoding="utf-8") as f:
        json.dump(sectors_map, f, indent=2)
    print("Finished fetching sectors.")

if __name__ == "__main__":
    main()
