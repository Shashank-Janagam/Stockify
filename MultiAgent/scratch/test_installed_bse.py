from bseindia.equity import gross_delivery
import inspect

print("gross_delivery function inspect details:")
print(inspect.signature(gross_delivery))

# Test fetching gross delivery report for a recent trading day
# Current date: July 12, 2026. The last trading day was July 10, 2026.
try:
    df = gross_delivery("10-07-2026")
    print("Success! DataFrame shape:", df.shape)
    print("Columns:", list(df.columns))
    print("First 3 rows:")
    print(df.head(3))
except Exception as e:
    print("Failed to fetch gross delivery:", e)
