import yfinance as yf

ticker = "SBIN.NS"
try:
    stock = yf.Ticker(ticker)
    # Check options expiration dates
    expirations = stock.options
    print("Options Expirations:", expirations)
    if expirations:
        # Fetch the option chain for the nearest expiration date
        chain = stock.option_chain(expirations[0])
        puts = chain.puts
        calls = chain.calls
        
        print("Puts columns:", list(puts.columns))
        print("Calls columns:", list(calls.columns))
        
        # Calculate PCR based on Open Interest
        total_pe_oi = puts['openInterest'].sum()
        total_ce_oi = calls['openInterest'].sum()
        
        print(f"Total PE Open Interest: {total_pe_oi}")
        print(f"Total CE Open Interest: {total_ce_oi}")
        if total_ce_oi > 0:
            print("PCR:", round(total_pe_oi / total_ce_oi, 2))
        else:
            print("PCR CE OI is 0")
except Exception as e:
    print("Failed to fetch options via yfinance:", e)
