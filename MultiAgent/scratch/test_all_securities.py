import bseindia
import pandas as pd

try:
    securities = bseindia.all_listed_securities()
    print("Securities type:", type(securities))
    if isinstance(securities, pd.DataFrame):
        # Try to find SBIN
        sbi_row = securities[securities['symbol'].str.upper() == 'SBIN']
        print("\nSBIN row:")
        print(sbi_row)
except Exception as e:
    print("Failed:", e)
