from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backtest import router as backtest_router
from live import router as live_router
import uvicorn

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(backtest_router)
app.include_router(live_router)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
