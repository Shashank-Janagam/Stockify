import os
from dotenv import load_dotenv

# Load env from AutoTrading directory, fallback to Stockify-Backend
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Stockify-Backend", ".env"))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backtest import router as backtest_router
from live import router as live_router
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "https://www.stockifyindia.app",
        "https://stockifyindia.app",
        "https://stockify-india.vercel.app",
        "https://api.stockifyindia.app",
    ],
    allow_origin_regex=r"https://.*stockify.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(backtest_router)
app.include_router(live_router)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
