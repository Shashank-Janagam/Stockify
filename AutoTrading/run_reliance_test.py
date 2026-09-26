import pandas as pd
import yfinance as yf
from indicator_engine.dsl import (
    DSLEvaluator, 
    ComparisonCondition, 
    LogicalCondition, 
    IndicatorRef
)

def main():
    # You can change these dates to test any specific timeframe
    start_date = "2023-01-01"
    end_date = "2029-09-24"
    
    print(f"Downloading historical data from {start_date} to {end_date}...")
    # TCS.NS is the ticker being tested
    df = yf.download("NTPC.NS", start=start_date, end=end_date, progress=False)
    
    # New yfinance versions return a MultiIndex for columns (e.g. ('Close', 'RELIANCE.NS'))
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    
    # Lowercase the columns so 'Close' becomes 'close'
    df.columns = [str(c).lower() for c in df.columns]

    print(f"Successfully downloaded {len(df)} days of data.")

    # Define our test strategy:
    # BUY WHEN: RSI(14) < 30 (Oversold) AND SMA(20) > SMA(50) (In a broader uptrend)
    strategy = LogicalCondition(
        operator='AND',
        conditions=[
            ComparisonCondition(
                indicator='RSI',
                params={'period': 14},
                comparison='<',
                value=45
            ),
            ComparisonCondition(
                indicator='SMA',
                params={'period': 20},
                comparison='>',
                value=IndicatorRef(indicator='SMA', params={'period': 50})
            )
        ]
    )

    # SELL WHEN: RSI(14) > 65 (Overbought) OR SMA(20) < SMA(50) (Downtrend)
    sell_strategy = LogicalCondition(
        operator='OR',
        conditions=[
            ComparisonCondition(
                indicator='RSI',
                params={'period': 14},
                comparison='>',
                value=65
            ),
            ComparisonCondition(
                indicator='SMA',
                params={'period': 20},
                comparison='<',
                value=IndicatorRef(indicator='SMA', params={'period': 50})
            )
        ]
    )

    print("\nEvaluating buy and sell strategies against the data...")
    evaluator = DSLEvaluator()
    buy_signals = evaluator.evaluate(strategy, df)
    sell_signals = evaluator.evaluate(sell_strategy, df)

    # Attach the boolean signals back to our dataframe
    df['buy_signal'] = buy_signals
    df['sell_signal'] = sell_signals

    # Filter out only the days where the signal was True
    buy_days = df[df['buy_signal'] == True]
    sell_days = df[df['sell_signal'] == True]

    print(f"\n--- RESULTS ---")
    print(f"Total days analyzed: {len(df)}")
    print(f"Total BUY signals triggered: {len(buy_days)}")
    print(f"Total SELL signals triggered: {len(sell_days)}")
    
    if not buy_days.empty:
        print("\nRecent Dates where the strategy triggered a BUY (showing last 5):")
        print(buy_days[['close']].tail())
    else:
        print("\nNo buy signals were triggered.")
        
    if not sell_days.empty:
        print("\nRecent Dates where the strategy triggered a SELL (showing last 5):")
        print(sell_days[['close']].tail())
    else:
        print("\nNo sell signals were triggered.")

    # --- PnL Backtester ---
    initial_capital = 100000.0  # Start with ₹100,000
    stop_loss_pct = 0.05        # 5% Stop Loss
    
    capital = initial_capital
    shares_held = 0
    buy_price = 0.0
    trades = 0

    print(f"\n--- TRADE LOG (Starting Capital: {initial_capital:,.2f} | Stop Loss: {stop_loss_pct*100}%) ---")
    for date, row in df.iterrows():
        current_price = row['close']
        
        # 1. Check Stop Loss if holding shares
        if shares_held > 0 and current_price <= buy_price * (1 - stop_loss_pct):
            sell_value = shares_held * current_price
            trade_pnl = sell_value - (shares_held * buy_price)
            capital += sell_value
            trades += 1
            print(f"STOP LOSS | {date.date()} | Price: {current_price:,.2f} | PnL: {trade_pnl:,.2f} | Capital: {capital:,.2f}")
            shares_held = 0
            buy_price = 0.0
            continue # Skip regular signals on this day

        # 2. Check Buy Signal (invest all capital)
        if row['buy_signal'] and shares_held == 0:
            shares_held = int(capital // current_price)
            if shares_held > 0:
                cost = shares_held * current_price
                capital -= cost
                buy_price = current_price
                print(f"BUY       | {date.date()} | Price: {buy_price:,.2f} | Shares: {shares_held} | Cost: {cost:,.2f}")
                
        # 3. Check Sell Signal
        elif row['sell_signal'] and shares_held > 0:
            sell_value = shares_held * current_price
            trade_pnl = sell_value - (shares_held * buy_price)
            capital += sell_value
            trades += 1
            print(f"SELL      | {date.date()} | Price: {current_price:,.2f} | PnL: {trade_pnl:,.2f} | Capital: {capital:,.2f}")
            shares_held = 0
            buy_price = 0.0

    if shares_held > 0:
        # Close open position at the end of the period
        current_price = df.iloc[-1]['close']
        sell_value = shares_held * current_price
        trade_pnl = sell_value - (shares_held * buy_price)
        capital += sell_value
        trades += 1
        print(f"AUTO-CLOSE| {df.index[-1].date()} | Price: {current_price:,.2f} | PnL: {trade_pnl:,.2f} | Capital: {capital:,.2f}")

    total_pnl = capital - initial_capital
    roi = (total_pnl / initial_capital) * 100

    print(f"\n--- PnL SUMMARY ---")
    print(f"Initial Capital: {initial_capital:,.2f}")
    print(f"Final Capital:   {capital:,.2f}")
    print(f"Total Trades:    {trades}")
    print(f"Total PnL:       {total_pnl:,.2f}")
    print(f"ROI:             {roi:.2f}%")

if __name__ == "__main__":
    main()
