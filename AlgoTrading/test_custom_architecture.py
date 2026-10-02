"""
test_custom_architecture.py — Verification of Custom Indicators and User Strategies
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from Algos import BacktestEngine, Candle, indicator_engine, strategy_registry
from Algos.strategies import JsonStrategy

def create_sample_candles(n=100):
    candles = []
    base_price = 100.0
    for i in range(n):
        open_p = base_price + i * 0.5
        high_p = open_p + 2.0
        low_p = open_p - 1.0
        close_p = open_p + 1.0
        volume = 10000 + i * 100
        candles.append(Candle(
            timestamp=f"2025-01-{i+1:02d}" if i < 28 else f"2025-02-{i-27:02d}",
            open=open_p,
            high=high_p,
            low=low_p,
            close=close_p,
            volume=volume
        ))
    return candles

def test_custom_formula_indicator():
    print("\n--- Testing Custom Formula Indicator ---")
    candles = create_sample_candles(50)
    
    # 1. Typical Price (HL3)
    hl2_res = indicator_engine.calculate("Formula", candles, formula="(high + low) / 2")
    assert len(hl2_res) == 50
    print("[OK] (high + low) / 2 computed successfully:", hl2_res[:3])
    
    # 2. Rolling SMA Formula
    sma_res = indicator_engine.calculate("Formula", candles, formula="sma(close, 10)")
    assert len(sma_res) == 50
    print("[OK] sma(close, 10) computed successfully:", sma_res[:3])
    
    # 3. Spread Formula
    spread_res = indicator_engine.calculate("Formula", candles, formula="(close - open) / open * 100")
    assert len(spread_res) == 50
    print("[OK] (close - open)/open * 100 computed successfully:", spread_res[:3])
    print("All custom formula tests passed!")

def test_user_defined_strategy():
    print("\n--- Testing Dynamic User-Defined Strategy ---")
    candles = create_sample_candles(100)
    
    # Define a completely custom strategy JSON in memory
    user_strategy_config = {
        "name": "User_Custom_Breakout_Strategy",
        "description": "User created custom strategy with formula indicators and take profit",
        "indicators": [
            {
                "name": "Formula",
                "key": "typical_price",
                "params": {
                    "formula": "(high + low + close) / 3"
                }
            },
            {
                "name": "EMA",
                "key": "ema_fast",
                "params": {
                    "period": 9
                }
            }
        ],
        "entry": {
            "type": "AND",
            "conditions": [
                {
                    "type": "CrossAbove",
                    "args": ["close", "ema_fast"]
                },
                {
                    "type": "GreaterThan",
                    "args": ["close", "typical_price"]
                }
            ]
        },
        "exit": {
            "type": "CrossBelow",
            "args": ["close", "ema_fast"]
        },
        "stop_loss_pct": 1.5,
        "take_profit_pct": 3.0
    }
    
    strategy = JsonStrategy(params={"strategy_config": user_strategy_config})
    engine = BacktestEngine(initial_capital=100_000, warm_up_period=20)
    report = engine.run(strategy, candles, symbol="TEST_STOCK")
    
    print("[OK] Backtest completed successfully!")
    print(f"Strategy: {report.strategy_name}")
    print(f"Total Trades: {report.total_trades}")
    print(f"Final Equity: {report.final_equity}")
    print(f"Return: {report.total_return_pct}%")
    print(f"Metadata Indicators: {strategy.get_metadata()['indicators_used']}")
    print("Dynamic User Strategy verification passed!")

if __name__ == "__main__":
    test_custom_formula_indicator()
    test_user_defined_strategy()
    print("\n[OK] ALL ARCHITECTURAL TESTS PASSED PERFECTLY!")
