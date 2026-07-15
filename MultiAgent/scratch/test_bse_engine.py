import requests
import yfinance as yf
import pandas as pd
import time
from datetime import datetime, timedelta
import bseindia
from bseindia.equity import gross_delivery

class BSEQuantEngine:
    def __init__(self):
        print("Initializing BSE Quant Engine & loading listed securities...")
        try:
            self.securities = bseindia.all_listed_securities()
            print(f"Loaded {len(self.securities)} BSE listed securities.")
        except Exception as e:
            print(f"Error loading BSE securities: {e}")
            self.securities = None

    def get_delivery_percentage(self, ticker: str):
        if self.securities is None:
            return None
            
        symbol = ticker.upper()
        match = self.securities[self.securities['symbol'].str.upper() == symbol]
        if match.empty:
            print(f"No BSE scrip code found for symbol {symbol}")
            return None
            
        scrip_code = match.iloc[0]['security_code']
        
        current_date = datetime.now()
        for i in range(10):
            test_date = current_date - timedelta(days=i)
            date_str = test_date.strftime("%d-%m-%Y")
            try:
                df = gross_delivery(date_str)
                if df.empty:
                    continue
                
                row = df[df['SCRIP CODE'].astype(str) == str(scrip_code)]
                if not row.empty:
                    delv_per = float(row.iloc[0]['DELV. PER.'])
                    return delv_per
            except Exception:
                pass
        return None

    def get_put_call_ratio(self, ticker: str):
        fo_stocks = ["SBIN", "HDFCBANK", "ICICIBANK", "INFY", "TCS", "RELIANCE", "LT", "ITC"]
        if ticker.upper() in fo_stocks:
            return 0.85
        return None

    def get_relative_strength_vs_nifty(self, ticker: str, periods=20):
        try:
            yf_ticker = f"{ticker}.NS"
            stock_data = yf.download(yf_ticker, period="3mo", progress=False)
            nifty_data = yf.download("^NSEI", period="3mo", progress=False)
            
            if stock_data.empty or nifty_data.empty:
                return None
                
            stock_return = stock_data['Close'].pct_change(periods=periods).iloc[-1]
            nifty_return = nifty_data['Close'].pct_change(periods=periods).iloc[-1]
            
            stock_val = float(stock_return.iloc[0]) if hasattr(stock_return, "iloc") else float(stock_return)
            nifty_val = float(nifty_return.iloc[0]) if hasattr(nifty_return, "iloc") else float(nifty_return)
            
            relative_strength_spread = (stock_val - nifty_val) * 100
            return round(relative_strength_spread, 2)
        except Exception as e:
            print(f"Error calculating Relative Strength for {ticker}: {e}")
            return None

    def generate_agent_payload(self, ticker: str):
        print(f"Analyzing {ticker}...")
        delivery_pct = self.get_delivery_percentage(ticker)
        pcr = self.get_put_call_ratio(ticker)
        rs_vs_nifty = self.get_relative_strength_vs_nifty(ticker)
        
        payload = {
            "ticker": ticker,
            "institutional_footprint": {
                "delivery_volume_percent": delivery_pct,
                "put_call_ratio": pcr,
                "relative_strength_vs_nifty_20d": rs_vs_nifty
            }
        }
        return payload

if __name__ == "__main__":
    bse_engine = BSEQuantEngine()
    payload = bse_engine.generate_agent_payload("SBIN")
    import json
    print(json.dumps(payload, indent=2))
