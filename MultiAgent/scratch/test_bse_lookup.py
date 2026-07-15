import bseindia.equity as bse_eq
import inspect

print("Equity module elements:")
print([name for name, obj in inspect.getmembers(bse_eq) if not name.startswith("_")])

# Let's see if we can find all_listed_securities or symbol resolution helper
# Let's inspect other modules/functions in bseindia
import bseindia
print("bseindia package elements:")
print([name for name, obj in inspect.getmembers(bseindia) if not name.startswith("_")])
