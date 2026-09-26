import pandas as pd
import yfinance as yf
from indicator_engine.dsl import (
    DSLEvaluator, 
    ComparisonCondition, 
    LogicalCondition, 
    IndicatorRef
)

def run_backtest_for_ticker(ticker: str, buy_strategy, sell_strategy, evaluator, start_date: str, end_date: str, initial_capital: float, stop_loss_pct: float):
    print(f"\n{'='*40}")
    print(f"Testing {ticker}...")
    
    df = yf.download(ticker, start=start_date, end=end_date, progress=False)
    
    if df.empty:
        print(f"No data found for {ticker}")
        return None
        
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    
    df.columns = [str(c).lower() for c in df.columns]

    buy_signals = evaluator.evaluate(buy_strategy, df)
    sell_signals = evaluator.evaluate(sell_strategy, df)

    df['buy_signal'] = buy_signals
    df['sell_signal'] = sell_signals

    capital = initial_capital
    shares_held = 0
    buy_price = 0.0
    trades = 0

    for date, row in df.iterrows():
        current_price = row['close']
        
        # 1. Stop Loss
        if shares_held > 0 and current_price <= buy_price * (1 - stop_loss_pct):
            sell_value = shares_held * current_price
            capital += sell_value
            trades += 1
            shares_held = 0
            buy_price = 0.0
            continue 

        # 2. Buy Signal
        if row['buy_signal'] and shares_held == 0:
            shares_held = int(capital // current_price)
            if shares_held > 0:
                cost = shares_held * current_price
                capital -= cost
                buy_price = current_price
                
        # 3. Sell Signal
        elif row['sell_signal'] and shares_held > 0:
            sell_value = shares_held * current_price
            capital += sell_value
            trades += 1
            shares_held = 0
            buy_price = 0.0

    if shares_held > 0:
        current_price = df.iloc[-1]['close']
        sell_value = shares_held * current_price
        capital += sell_value
        trades += 1

    total_pnl = capital - initial_capital
    roi = (total_pnl / initial_capital) * 100

    print(f"{ticker} SUMMARY -> Trades: {trades} | Final Capital: {capital:,.2f} | ROI: {roi:.2f}%")
    return {
        "Ticker": ticker,
        "Trades": trades,
        "Final Capital": capital,
        "Total PnL": total_pnl,
        "ROI (%)": roi
    }

def main():
    # You can easily test a single stock by putting one ticker, or multiple by adding more
    tickers = ["TCS.NS", "RELIANCE.NS", "HDFCBANK.NS", "INFY.NS", "NTPC.NS"]
    
    start_date = "2023-01-01"
    end_date = "2029-01-01"
    initial_capital = 100000.0
    stop_loss_pct = 0.05
    
    print(f"Running Strategy Comparison from {start_date} to {end_date}")
    print(f"Starting Capital per stock: {initial_capital:,.2f} | Stop Loss: {stop_loss_pct*100}%")
    
    # BUY WHEN: RSI(14) < 45 AND SMA(20) > SMA(50)
    buy_strategy = LogicalCondition(
        operator='AND',
        conditions=[
            ComparisonCondition(indicator='RSI', params={'period': 14}, comparison='<', value=45),
            ComparisonCondition(indicator='SMA', params={'period': 20}, comparison='>', value=IndicatorRef(indicator='SMA', params={'period': 50}))
        ]
    )

    # SELL WHEN: RSI(14) > 65 OR SMA(20) < SMA(50)
    sell_strategy = LogicalCondition(
        operator='OR',
        conditions=[
            ComparisonCondition(indicator='RSI', params={'period': 14}, comparison='>', value=65),
            ComparisonCondition(indicator='SMA', params={'period': 20}, comparison='<', value=IndicatorRef(indicator='SMA', params={'period': 50}))
        ]
    )

    evaluator = DSLEvaluator()
    results = []
    
    for ticker in tickers:
        res = run_backtest_for_ticker(ticker, buy_strategy, sell_strategy, evaluator, start_date, end_date, initial_capital, stop_loss_pct)
        if res:
            results.append(res)
            
    # Print Comparison Table
    print("\n\n" + "#"*65)
    print("STRATEGY PERFORMANCE COMPARISON")
    print("#"*65)
    
    if results:
        # Convert to DataFrame for a nice table print
        df_results = pd.DataFrame(results)
        df_results = df_results.sort_values(by="ROI (%)", ascending=False).reset_index(drop=True)
        
        # Formatting for display
        df_results['Final Capital'] = df_results['Final Capital'].apply(lambda x: f"{x:,.2f}")
        df_results['Total PnL'] = df_results['Total PnL'].apply(lambda x: f"{x:,.2f}")
        df_results['ROI (%)'] = df_results['ROI (%)'].apply(lambda x: f"{x:.2f}%")
        
        print(df_results.to_string(index=False))
        
        avg_roi = sum([r['ROI (%)'] for r in results]) / len(results)
        print(f"\nAverage Portfolio ROI: {avg_roi:.2f}%")
    else:
        print("No results to compare.")

if __name__ == "__main__":
    main()
