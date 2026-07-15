import bseindia
from bseindia.equity import gross_delivery
from datetime import datetime, timedelta

def get_bse_delivery_percentage(symbol: str) -> float:
    print(f"Resolving BSE security code for {symbol}...")
    securities = bseindia.all_listed_securities()
    match = securities[securities['symbol'].str.upper() == symbol.upper()]
    if match.empty:
        print(f"No BSE security code found for symbol {symbol}")
        return None
    scrip_code = match.iloc[0]['security_code']
    print(f"BSE Scrip Code for {symbol} is {scrip_code}")
    
    # Try fetching the delivery report for the last few days
    current_date = datetime.now()
    for i in range(10):
        test_date = current_date - timedelta(days=i)
        date_str = test_date.strftime("%d-%m-%Y")
        print(f"Trying date: {date_str}...")
        try:
            df = gross_delivery(date_str)
            if df.empty:
                continue
            
            # Find the row for our scrip_code (scrip_code in df is usually an int or string)
            # Let's inspect unique values in SCRIP CODE column to see their type
            row = df[df['SCRIP CODE'].astype(str) == str(scrip_code)]
            if not row.empty:
                delv_per = row.iloc[0]['DELV. PER.']
                print(f"Found delivery percentage on {date_str}: {delv_per}%")
                return float(delv_per)
        except Exception as e:
            # Silence connection/missing file errors and try previous day
            pass
            
    print("Could not find any recent delivery report")
    return None

pct = get_bse_delivery_percentage("SBIN")
print("Delivery percentage:", pct)
