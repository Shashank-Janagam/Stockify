import json
import sys
from crew import create_crew, create_trading_crew

def coerce_dict_scores_to_int(data):
    """Recursively coerces any key ending in '_score', 'final_score', or 'quantity' to an integer if it's a string."""
    if isinstance(data, dict):
        for k, v in data.items():
            if k == "quantity" or k.endswith("_score") or k == "final_score":
                if isinstance(v, str):
                    try:
                        data[k] = int(v)
                    except ValueError:
                        pass
            else:
                coerce_dict_scores_to_int(v)
    elif isinstance(data, list):
        for item in data:
            coerce_dict_scores_to_int(item)
    return data

def execute_buy_order(symbol: str, quantity: int):
    """Sends a POST request to the backend to execute a market buy order using bypassed auth."""
    import requests
    url = "http://localhost:4000/api/orderExecution/buy"
    headers = {
        "Content-Type": "application/json",
        "x-bypass-auth": "true"
    }
    clean_sym = symbol.strip().upper()
    if not clean_sym.endswith(".NS") and not clean_sym.endswith(".BO"):
        clean_sym = f"{clean_sym}.NS"
    body = {
        "symbol": clean_sym,
        "quantity": int(quantity),
        "product_type": "Delivery",
        "category": "AI Algo Trading"
    }
    
    print(f"\n[Execution] Sending buy order: {quantity} shares of {clean_sym}...", flush=True)
    try:
        response = requests.post(url, json=body, headers=headers)
        if response.status_code == 200:
            res_data = response.json()
            print(f"[Execution] Success! Status: {res_data.get('status')}, Price: {res_data.get('buyPricePerShare')}, Total Cost: {res_data.get('totalPrice')}", flush=True)
            return {"status": "success", "detail": res_data}
        else:
            print(f"[Execution] Failed for {clean_sym}: Status {response.status_code}, Response: {response.text}", flush=True)
            return {"status": "failed", "error": response.text}
    except Exception as e:
        print(f"[Execution] Error for {clean_sym}: {str(e)}", flush=True)
        return {"status": "failed", "error": str(e)}

def fetch_portfolio():
    """Fetches the user's available cash and current holdings from the backend using bypassed auth."""
    import requests
    headers = {
        "x-bypass-auth": "true"
    }
    
    cash = 0.0
    holdings = []
    
    print("\n[Portfolio] Fetching available cash balance...", flush=True)
    try:
        res = requests.get("http://localhost:4000/api/getBalance/getBalance", headers=headers, timeout=10)
        if res.status_code == 200:
            data = res.json()
            cash = float(data.get("cash", 0.0))
            print(f"[Portfolio] Cash balance: Rs. {cash:.2f}", flush=True)
        else:
            print(f"[Portfolio] Failed to fetch balance: Status {res.status_code}", flush=True)
    except Exception as e:
        print(f"[Portfolio] Error fetching balance: {str(e)}", flush=True)
        
    print("[Portfolio] Fetching current holdings...", flush=True)
    try:
        res = requests.get("http://localhost:4000/api/portfolio/summary?fresh=1", headers=headers, timeout=15)
        if res.status_code == 200:
            data = res.json()
            holdings = data.get("holdings", [])
            print(f"[Portfolio] Found {len(holdings)} holdings.", flush=True)
        else:
            print(f"[Portfolio] Failed to fetch holdings: Status {res.status_code}", flush=True)
    except Exception as e:
        print(f"[Portfolio] Error fetching holdings: {str(e)}", flush=True)
        
    return cash, holdings

def execute_sell_order(symbol: str, quantity: int):
    """Sends a POST request to the backend to execute a market sell order using bypassed auth."""
    import requests
    url = "http://localhost:4000/api/sellStock/sell"
    headers = {
        "Content-Type": "application/json",
        "x-bypass-auth": "true"
    }
    clean_sym = symbol.strip().upper()
    if not clean_sym.endswith(".NS") and not clean_sym.endswith(".BO"):
        clean_sym = f"{clean_sym}.NS"
    body = {
        "symbol": clean_sym,
        "quantity": int(quantity),
        "sl_enabled": False,
        "product_type": "Delivery",
        "category": "AI Algo Trading"
    }
    
    print(f"\n[Execution] Sending sell order: {quantity} shares of {clean_sym}...", flush=True)
    try:
        response = requests.post(url, json=body, headers=headers)
        if response.status_code == 200:
            res_data = response.json()
            print(f"[Execution] Success! Status: {res_data.get('status')}, Price: {res_data.get('sellPricePerShare')}, Total Value: {res_data.get('totalValue')}", flush=True)
            return {"status": "success", "detail": res_data}
        else:
            print(f"[Execution] Failed for {clean_sym}: Status {response.status_code}, Response: {response.text}", flush=True)
            return {"status": "failed", "error": response.text}
    except Exception as e:
        print(f"[Execution] Error for {symbol}: {str(e)}", flush=True)
        return {"status": "failed", "error": str(e)}

def fetch_lstm_forecast(symbol: str):
    from lstm_local import get_lstm_forecast
    clean_symbol = symbol.strip().upper().replace(".NS", "").replace(".BO", "")
    return get_lstm_forecast(clean_symbol)

def analyze_stock(symbol: str):
    """Analyzes a single stock and returns its structured JSON output with retry logic."""
    import time
    import random
    
    max_attempts = 4
    base_backoff = 35  # seconds
    
    for attempt in range(1, max_attempts + 1):
        print(f"Starting analysis for {symbol} (Attempt {attempt}/{max_attempts})...", flush=True)
        try:
            print(f"Fetching LSTM forecast for {symbol}...", flush=True)
            lstm_data = fetch_lstm_forecast(symbol)
            if lstm_data.get("forecast_available", True) and "forecast" in lstm_data:
                fc = lstm_data["forecast"]
                report_text = f"LSTM 5-Day Predicted Prices: {fc.get('prices')}\n"
                report_text += f"Lower Bound: {fc.get('lower')}\n"
                report_text += f"Upper Bound: {fc.get('upper')}\n"
                report_text += f"Predicted Direction: {fc.get('direction')}\n"
                report_text += f"Confidence Score: {fc.get('confidence')}%\n"
                if "report" in lstm_data:
                    rep = lstm_data["report"]
                    report_text += f"Verdict Summary: {rep.get('verdict')}\n"
                    report_text += f"Bull Case: {rep.get('bull_case')}\n"
                    report_text += f"Bear Case: {rep.get('bear_case')}\n"
                    report_text += f"Risk Level: {rep.get('risk_level')}\n"
            else:
                report_text = f"LSTM Forecast Unavailable: {lstm_data.get('error', 'Unknown error')}"

            print(f"Pre-fetching news, financials, and technicals for {symbol}...", flush=True)
            from tools.news import StockNewsTool
            from tools.financial_tool import FinancialTool
            from tools.tech_tool import TechTool

            try:
                raw_news_data = StockNewsTool()._run(symbol)
                news_data = json.dumps(raw_news_data, indent=2, ensure_ascii=False)
            except Exception as e:
                news_data = f"Error fetching news: {str(e)}"

            try:
                raw_financial_data = FinancialTool()._run(symbol)
                financial_data = json.dumps(raw_financial_data, indent=2, ensure_ascii=False)
            except Exception as e:
                financial_data = f"Error fetching financial data: {str(e)}"

            try:
                raw_technical_data = TechTool()._run(symbol)
                technical_data = json.dumps(raw_technical_data, indent=2, ensure_ascii=False)
            except Exception as e:
                technical_data = f"Error fetching technical indicators: {str(e)}"

            crew = create_crew()
            result = crew.kickoff(inputs={
                "symbol": symbol,
                "lstm_forecast": report_text,
                "news_data": news_data,
                "financial_data": financial_data,
                "technical_data": technical_data
            })
            
            # Extract structured JSON data
            data = None
            if hasattr(result, "json_dict") and result.json_dict:
                data = result.json_dict
            elif hasattr(result, "pydantic") and result.pydantic:
                data = result.pydantic.model_dump()
            else:
                try:
                    data = json.loads(result.raw)
                except Exception:
                    data = {"raw_output": result.raw}
                    
            if data:
                data = coerce_dict_scores_to_int(data)
                
            # Fetch current price using yfinance
            current_price = 0.0
            try:
                import yfinance as yf
                ticker = symbol if symbol.endswith(".NS") or symbol.endswith(".BO") else f"{symbol}.NS"
                stock = yf.Ticker(ticker)
                history = stock.history(period="1d")
                if not history.empty:
                    current_price = float(history["Close"].iloc[-1])
            except Exception:
                pass
                
            if data and isinstance(data, dict):
                data["current_price"] = current_price

            print(f"Successfully completed analysis for {symbol} on attempt {attempt}.", flush=True)
            return symbol, {"status": "success", "result": data}
        except Exception as e:
            error_str = str(e)
            # Safe encoding for Windows console printing
            try:
                encoding = sys.stdout.encoding or 'utf-8'
                safe_error_str = error_str.encode(encoding, errors='replace').decode(encoding)
            except Exception:
                safe_error_str = repr(e)
                
            print(f"Attempt {attempt} failed for {symbol}: {safe_error_str}", flush=True)
            if attempt == max_attempts:
                # Store a clean, short error message to prevent blowing up prompt tokens
                clean_error = "Rate Limit or API Error"
                if "RateLimitError" in error_str:
                    clean_error = "Rate Limit Exceeded"
                elif "BadRequestError" in error_str:
                    clean_error = "API Bad Request"
                return symbol, {"status": "failed", "error": clean_error}
            
            # Exponential backoff with some jitter
            sleep_time = (base_backoff * (2 ** (attempt - 1))) + random.uniform(1, 5)
            print(f"Waiting {sleep_time:.2f} seconds before retrying {symbol}...", flush=True)
            time.sleep(sleep_time)


def main():
    # 1. Fetch the user's cash balance and current holdings
    cash, holdings = fetch_portfolio()
    
    # Extract held stock symbols (cleaned of suffixes)
    held_symbols = []
    for h in holdings:
        qty = h.get("quantity", 0)
        if qty <= 0:
            continue
        sym = h.get("symbol", "").strip().upper().replace(".NS", "").replace(".BO", "")
        if sym:
            held_symbols.append(sym)
            
    # Base symbols to analyze
    base_symbols = ["RELIANCE", "TCS", "INFY", "KOTAKBANK", "ONGC", "VEDL"]
    
    # Merge symbols without duplicates
    symbols = []
    for sym in base_symbols + held_symbols:
        if sym not in symbols:
            symbols.append(sym)
            
    print(f"\nAnalyzing stocks sequentially (in series): {symbols}", flush=True)
    
    output_filename = "stocks_analysis_report.json"
    try:
        with open(output_filename, "r", encoding="utf-8") as f:
            report = json.load(f)
        print(f"[Cache] Loaded existing analysis for {list(report.keys())} from {output_filename}", flush=True)
    except Exception:
        report = {}
    
    for i, symbol in enumerate(symbols):
        if symbol in report and report[symbol].get("status") == "success":
            print(f"Skipping analysis for {symbol} (using existing analysis from cache file)...", flush=True)
            continue
            
        symbol, res = analyze_stock(symbol)
        report[symbol] = res
        
        # Save progress to file (using UTF-8 to prevent Windows CP1252 crash)
        with open(output_filename, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=4, ensure_ascii=False)
        print(f"Progress saved to {output_filename}", flush=True)
        
        if i < len(symbols) - 1:
            delay = 5
            print(f"Waiting {delay} seconds before starting the next stock to respect API rate limits...", flush=True)
            import time
            time.sleep(delay)
                
    # Output the combined report as pretty JSON
    pretty_report = json.dumps(report, indent=4, ensure_ascii=False)
    print("\n--- COMBINED STOCKS ANALYSIS REPORT ---")
    try:
        encoding = sys.stdout.encoding or 'utf-8'
        safe_pretty_report = pretty_report.encode(encoding, errors='replace').decode(encoding)
        print(safe_pretty_report)
    except Exception:
        print(repr(report))
        
    print(f"\nFinal report saved to {output_filename}", flush=True)

    # Construct a highly condensed report to save prompt tokens for the trading agent
    condensed_report_list = []
    report_updated = False
    for sym, data in report.items():
        if sym not in symbols:
            continue
        if data.get("status") == "success" and "result" in data:
            res = data["result"]
            score = res.get("final_score")
            rec = res.get("recommendation")
            
            # Fetch close price on the fly if not present in the cached result
            price = res.get("current_price")
            if not price:
                try:
                    import yfinance as yf
                    ticker = sym if sym.endswith(".NS") or sym.endswith(".BO") else f"{sym}.NS"
                    stock = yf.Ticker(ticker)
                    history = stock.history(period="1d")
                    if not history.empty:
                        price = float(history["Close"].iloc[-1])
                        res["current_price"] = price
                        report_updated = True
                    else:
                        price = 0.0
                except Exception:
                    price = 0.0
            
            condensed_report_list.append(
                f"- Stock: {sym}, Current Price: Rs. {price:.2f}, Final Score: {score}, Recommendation: {rec}"
            )
        else:
            condensed_report_list.append(
                f"- Stock: {sym}, Status: failed ({data.get('error', 'Unknown Error')})"
            )
            
    # Save the updated report if any prices were added
    if report_updated:
        with open(output_filename, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=4, ensure_ascii=False)
            
    condensed_report = "\n".join(condensed_report_list)
    if not condensed_report.strip():
        print("\n[Trader] No stocks in the analysis report. Skipping trading agent execution.", flush=True)
        return

    # Format portfolio details as context for the trading agent
    portfolio_text = f"Available cash balance: Rs. {cash:.2f}\n"
    if holdings:
        portfolio_text += "Current holdings:\n"
        for h in holdings:
            sym = h.get("symbol", "").replace(".NS", "").replace(".BO", "")
            qty = h.get("quantity", 0)
            if qty <= 0:
                continue
            avg_price = h.get("avgPrice", 0.0)
            curr_price = h.get("currentPrice", 0.0)
            pnl = h.get("pnl", 0.0)
            pnl_pct = h.get("pnlPercent", 0.0)
            portfolio_text += f"  - {sym}: {qty} shares @ average buy price Rs. {avg_price:.2f} (Current Price: Rs. {curr_price:.2f}, PnL: Rs. {pnl:.2f} [{pnl_pct}%])\n"
    else:
        portfolio_text += "Current holdings: None\n"

    # 2. Activate the Trading Agent to decide which stocks to buy/sell based on the analysis and portfolio
    print("\nActivating Portfolio Trading Agent to decide purchases and sales...", flush=True)
    try:
        trading_crew = create_trading_crew()
        trading_result = trading_crew.kickoff(inputs={
            "combined_report": condensed_report,
            "user_portfolio": portfolio_text
        })
        
        # Extract decisions
        decisions_data = None
        if hasattr(trading_result, "json_dict") and trading_result.json_dict:
            decisions_data = trading_result.json_dict
        elif hasattr(trading_result, "pydantic") and trading_result.pydantic:
            decisions_data = trading_result.pydantic.model_dump()
        else:
            try:
                decisions_data = json.loads(trading_result.raw)
            except Exception:
                # Attempt to parse json from raw text manually
                import re
                match = re.search(r'\{.*\}', trading_result.raw, re.DOTALL)
                if match:
                    try:
                        decisions_data = json.loads(match.group(0))
                    except Exception:
                        pass
        
        if decisions_data:
            decisions_data = coerce_dict_scores_to_int(decisions_data)
            
        if not decisions_data or "decisions" not in decisions_data:
            print(f"\n[Trader] No decisions parsed from LLM output. Raw: {trading_result.raw}", flush=True)
            return
            
        decisions = decisions_data["decisions"]
        print(f"\n[Trader] Decided on {len(decisions)} action(s):", flush=True)
        executed_decisions = []
        import yfinance as yf
        for d in decisions:
            action = d.get("action", "BUY").upper()
            sym = d.get("symbol", "").strip().upper()
            qty = int(d.get("quantity", 0))
            rat = d.get("rationale", "")
            try:
                encoding = sys.stdout.encoding or 'utf-8'
                safe_rat = rat.encode(encoding, errors='replace').decode(encoding)
            except Exception:
                safe_rat = rat
            print(f"  - {action} {qty} shares of {sym} (Rationale: {safe_rat})", flush=True)
            
            # Programmatically execute the trade with guardrails
            if action == "BUY":
                # Check score threshold
                score = 0
                if sym in report and "result" in report[sym]:
                    try:
                        score = int(report[sym]["result"].get("final_score", 0))
                    except Exception:
                        pass
                if score < 75:
                    print(f"[Execution] Blocking BUY for {sym} as its score ({score}) is below the 75 threshold.", flush=True)
                    exec_res = {"status": "failed", "error": "Score below threshold"}
                else:
                    # Enforce 10% position sizing
                    price = 0.0
                    try:
                        ticker = sym if sym.endswith(".NS") or sym.endswith(".BO") else f"{sym}.NS"
                        stock = yf.Ticker(ticker)
                        history = stock.history(period="1d")
                        if not history.empty:
                            price = float(history["Close"].iloc[-1])
                    except Exception:
                        pass
                    if price <= 0.0 and sym in report and "result" in report[sym]:
                        try:
                            price = float(report[sym]["result"].get("current_price", 0.0))
                        except Exception:
                            pass
                            
                    if price > 0.0:
                        max_alloc = cash * 0.10
                        safe_qty = int(max_alloc // price)
                        if qty != safe_qty:
                            print(f"[Execution] Correcting BUY quantity for {sym} from {qty} to {safe_qty} based on 10% position sizing rule (price: Rs. {price:.2f}, max allocation: Rs. {max_alloc:.2f})", flush=True)
                            qty = safe_qty
                    
                    if qty > 0:
                        exec_res = execute_buy_order(sym, qty)
                    else:
                        exec_res = {"status": "failed", "error": "Calculated quantity is 0"}
                        
            elif action == "SELL":
                # Check holdings
                held_qty = 0
                for h in holdings:
                    h_sym = h.get("symbol", "").replace(".NS", "").replace(".BO", "").strip().upper()
                    if h_sym == sym:
                        held_qty = int(h.get("quantity", 0))
                        break
                
                if held_qty > 0:
                    if qty != held_qty:
                        print(f"[Execution] Correcting SELL quantity for {sym} from {qty} to {held_qty} to sell the entire position.", flush=True)
                        qty = held_qty
                    exec_res = execute_sell_order(sym, qty)
                else:
                    print(f"[Execution] Skipping SELL for {sym} as it is not currently held in holdings.", flush=True)
                    exec_res = {"status": "failed", "error": "Stock not held"}
            else:
                exec_res = {"status": "failed", "error": f"Unknown action: {action}"}
                
            # Add execution result to the decision log
            d["quantity"] = qty
            d["execution_result"] = exec_res
            executed_decisions.append(d)
            
        # 3. Save trading actions and execution details
        trading_actions_file = "trading_actions_report.json"
        with open(trading_actions_file, "w", encoding="utf-8") as f:
            json.dump({
                "summary": decisions_data.get("portfolio_summary", ""),
                "decisions": executed_decisions
            }, f, indent=4, ensure_ascii=False)
        print(f"\n[Trader] Trading actions and executions report saved to {trading_actions_file}", flush=True)
        
    except Exception as e:
        print(f"\n[Trader] Failed to execute portfolio decisions: {str(e)}", flush=True)

if __name__ == "__main__":
    main()