import os

with open(os.path.join(os.path.dirname(__file__), "server.js"), encoding="utf-8") as f:
    print(f.readline())