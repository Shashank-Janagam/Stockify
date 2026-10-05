import re

filepath = r'c:\Users\shash\OneDrive\Documents\IOMP\stockify\autotrading\live.py'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the accidental replacements inside TradingSession class
content = content.replace('self.session.', 'self.')
content = content.replace('"session.current_capital":', '"current_capital":')
content = content.replace('"session.shares_held":', '"shares_held":')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("Fixed TradingSession syntax")
