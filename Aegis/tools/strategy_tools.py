"""
strategy_tools.py — Aegis tools for submitting strategies to the AlgoTrading engine
======================================================================================
Provides two LangChain tools:

1. submit_strategy_for_backtest  — single backtest submission
2. backtest_and_refine           — iterative self-improvement loop
"""

import json
import os
import requests
from langchain_core.tools import tool

# AlgoTrading server base URL — configured via ALGO_TRADING_URL env var or localhost default
ALGO_TRADING_URL = os.getenv("ALGO_TRADING_URL", "http://localhost:8000")


# ─── Shared helpers ───────────────────────────────────────────────────────────

def _format_report(report: dict, strategy_name: str, strategy: dict) -> str:
    """Format a BacktestReport dict into a clean, readable string and append a JSON payload for the frontend UI."""
    summary = report.get('portfolio_summary', {})
    final_eq = summary.get('final_capital')
    final_eq_str = f"Rs.{final_eq:,.2f}" if isinstance(final_eq, (int, float)) else "N/A"

    lines = [
        f"**Backtest Report - {strategy_name}**",
        "",
        f"- **Total Return:**      {summary.get('roi', 'N/A')}%",
        f"- **Final Equity:**      {final_eq_str}",
        f"- **Total Trades:**      {summary.get('trades', 'N/A')}",
        f"- **Total PnL:**         {summary.get('total_pnl', 'N/A')}",
        f"- **Initial Capital:**   {summary.get('initial_capital', 'N/A')}",
    ]
    
    # Construct the JSON payload for the UI
    pnl_curve = []
    stock_reports = report.get('stock_reports', [])
    if stock_reports and stock_reports[0].get('price_history'):
        for ph in stock_reports[0]['price_history']:
            pnl_curve.append({
                "date": ph.get("timestamp"),
                "value": ph.get("pnl", 0)
            })
            
    # Calculate additional metrics for the UI
    summary["total_return"] = f"{summary.get('roi', 0):.2f}%"
    summary["max_drawdown"] = "N/A"
    summary["sharpe_ratio"] = "N/A"
    summary["win_rate"] = "N/A"
    
    wins = 0
    losses = 0
    for stock_report in stock_reports:
        for trade in stock_report.get("trade_log", []):
            if "pnl" in trade:
                if trade["pnl"] > 0:
                    wins += 1
                else:
                    losses += 1
    total_closed = wins + losses
    if total_closed > 0:
        summary["win_rate"] = f"{(wins / total_closed) * 100:.1f}%"

    ui_payload = {
        "status": "strategy_backtest",
        "name": strategy_name,
        "symbol": strategy.get("symbol", ""),
        "config": strategy,
        "metrics": summary,
        "pnl_curve": pnl_curve
    }
    
    lines.append("")
    lines.append("```json")
    lines.append(json.dumps(ui_payload, indent=2))
    lines.append("```")
    
    return "\n".join(lines)


def _run_backtest(strategy: dict, period: str, interval: str | None) -> tuple[dict | None, str | None]:
    """
    Submit a strategy to the AutoTrading server (/evaluate).
    Returns (report_dict, None) on success, or (None, error_str) on failure.
    """
    from datetime import datetime, timedelta
    
    symbol = strategy.get("symbol", "").strip().upper()
    if not symbol:
        return None, "Strategy JSON is missing the 'symbol' field."

    # Map period to start_date and end_date
    end_dt = datetime.now()
    if period == "1y":
        start_dt = end_dt - timedelta(days=365)
    elif period == "6mo":
        start_dt = end_dt - timedelta(days=180)
    elif period == "3mo":
        start_dt = end_dt - timedelta(days=90)
    elif period == "1mo":
        start_dt = end_dt - timedelta(days=30)
    elif period == "1w":
        start_dt = end_dt - timedelta(days=7)
    else:
        start_dt = end_dt - timedelta(days=365) # default 1y

    buy_strategy = strategy.get("buy_strategy", strategy.get("entry_conditions", {"operator": "AND", "conditions": []}))
    if isinstance(buy_strategy, list):
        buy_strategy = {"operator": "AND", "conditions": buy_strategy}
        
    sell_strategy = strategy.get("sell_strategy", strategy.get("exit_conditions", {"operator": "AND", "conditions": []}))
    if isinstance(sell_strategy, list):
        sell_strategy = {"operator": "AND", "conditions": sell_strategy}
        
    payload = {
        "ticker": symbol,
        "start_date": start_dt.strftime("%Y-%m-%d"),
        "end_date": end_dt.strftime("%Y-%m-%d"),
        "buy_strategy": buy_strategy,
        "sell_strategy": sell_strategy,
        "initial_capital": strategy.get("capital", 100000.0),
        "stop_loss_pct": strategy.get("stopLossPct", 0.05),
        "stop_loss_type": strategy.get("stopLossType", "fixed"),
        "timeframe": interval or "1D"
    }

    try:
        response = requests.post(
            f"{ALGO_TRADING_URL}/evaluate",
            json=payload,
            timeout=120,
        )
        response.raise_for_status()
        data = response.json()
    except requests.exceptions.ConnectionError:
        return None, (
            f"Could not connect to AutoTrading server at {ALGO_TRADING_URL}. "
        )
    except requests.exceptions.Timeout:
        return None, "Backtest request timed out (>120s). Try a shorter period."
    except requests.exceptions.HTTPError as e:
        try:
            err = response.json().get("error", str(e))
        except Exception:
            err = str(e)
        return None, f"HTTP {response.status_code}: {err}"
    except Exception as e:
        return None, f"Unexpected error: {e}"

    if not data.get("success"):
        return None, data.get("error", "Unknown error from AutoTrading server.")

    return data, None


def _criteria_met(
    report: dict,
    min_return_pct: float,
    min_trades: int,
    min_win_rate: float,
) -> tuple[bool, list[str]]:
    """Check success criteria. Returns (all_passed, list_of_failure_reasons)."""
    summary = report.get("portfolio_summary", {})
    failures = []
    ret = summary.get("roi")
    trades = summary.get("trades")
    win_rate = 100.0 # TODO: implement win rate parsing

    if not isinstance(ret, (int, float)) or ret <= min_return_pct:
        failures.append(f"Return {ret}% <= target {min_return_pct}%")
    if not isinstance(trades, int) or trades < min_trades:
        failures.append(f"Only {trades} trade(s) — need >= {min_trades}")

    return len(failures) == 0, failures


def _refine_strategy(strategy: dict, report: dict, failures: list[str]) -> dict | None:
    """
    Ask Gemini to revise the strategy based on what the backtest revealed.
    Returns a new strategy dict, or None if the LLM call fails.
    """
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain_core.messages import HumanMessage

    summary = report.get("portfolio_summary", {})
    ret = summary.get("roi", "N/A")
    trades = summary.get("trades", "N/A")
    win_rate = "N/A"
    failure_bullets = "\n".join(f"  - {f}" for f in failures)

    prompt = f"""You are a quantitative strategy optimizer.

The following trading strategy was backtested and did not meet the performance targets.

Current Strategy (JSON):
{json.dumps(strategy, indent=2)}

Backtest Results:
- Total Return : {ret}%
- Total Trades : {trades}
- Win Rate     : {win_rate}%

Problems identified:
{failure_bullets}

Common fixes to consider:
- Too few trades -> relax entry thresholds (e.g. RSI < 30 -> RSI < 40), widen BB bands period
- Negative return -> tighten stop loss, add take profit, or add trend filter (SMA/EMA)
- Low win rate -> add confirmation indicator, require EMA alignment, or use stricter entry
- Zero trades / signals -> significantly loosen the entry condition threshold

Output ONLY the revised strategy as a single valid raw JSON object.
No markdown. No prose. No code fences. No explanation.
Just the raw JSON starting with {{ and ending with }}.
Keep the same symbol, timeframe, and overall schema. Only change indicator params/thresholds.
IMPORTANT: NEVER use `"value": "price"`. If comparing to price, use `"value": {{"indicator": "Close"}}`."""

    try:
        refinement_llm = ChatGoogleGenerativeAI(
            model="gemini-3.1-flash-lite",
            temperature=0.4,
            api_key=os.getenv("GEMINI_API_KEY"),
        )
        response = refinement_llm.invoke([HumanMessage(content=prompt)])

        # Gemini may return content as a list of blocks or a plain string
        raw = response.content
        if isinstance(raw, list):
            parts = []
            for block in raw:
                if isinstance(block, str):
                    parts.append(block)
                elif isinstance(block, dict):
                    parts.append(block.get("text", ""))
            raw = "\n".join(parts)
        raw = str(raw).strip()

        # Strip any accidental markdown fences the LLM might add
        if "```" in raw:
            parts = raw.split("```")
            for part in parts:
                p = part.strip()
                if p.startswith("json"):
                    p = p[4:].strip()
                if p.startswith("{"):
                    raw = p
                    break

        return json.loads(raw)
    except Exception as e:
        print(f"[Aegis Refine] Refinement LLM failed: {e}")
        return None


def _extract_rsi_threshold(strategy: dict) -> str:
    """Helper to extract the first RSI entry threshold for logging."""
    for cond in strategy.get("entry_conditions", []):
        if cond.get("indicator", "").upper() == "RSI":
            return str(cond.get("value", "?"))
    return "N/A"


# ─── Tool 1: Single backtest ──────────────────────────────────────────────────

@tool
def submit_strategy_for_backtest(
    strategy_json: str,
    period: str = "1y",
    interval: str = None,
) -> str:
    """
    Submit an Aegis strategy specification to the AlgoTrading engine for a single backtest.

    Use this for ONE backtest run. For automatic iterative refinement until profitable,
    use backtest_and_refine instead.

    Args:
        strategy_json: The complete Aegis strategy specification as a JSON string.
                       Must include the 'symbol' field.
        period:        Historical lookback period (default '1y').
                       Values: '1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y'.
        interval:      Candle interval (optional). Auto-resolved from period if omitted.

    Returns:
        A formatted backtest report string, or an error message.
    """
    try:
        strategy = json.loads(strategy_json) if isinstance(strategy_json, str) else strategy_json
    except json.JSONDecodeError as e:
        return f"[BacktestError] Failed to parse strategy JSON: {e}"

    report, error = _run_backtest(strategy, period, interval)
    if error:
        return f"[BacktestError] {error}"

    strategy_name = strategy.get("name", "Strategy")
    return _format_report(report, strategy_name, strategy)


# ─── Tool 2: Iterative refinement loop ───────────────────────────────────────

@tool
def backtest_and_refine(
    strategy_json: str,
    period: str = "1y",
    interval: str = None,
    max_iterations: int = 5,
    min_return_pct: float = 0.0,
    min_trades: int = 2,
    min_win_rate: float = 50.0,
) -> str:
    """
    Submit an Aegis strategy for backtesting and AUTOMATICALLY REFINE it if unsatisfactory.

    Use this when the user asks to 'auto-optimize', 'keep trying until profitable',
    'refine the strategy', or 'exhaust attempts'. The loop runs internally.

    The loop:
      1. Runs a backtest via the AlgoTrading engine.
      2. Checks result against success criteria (return, trades, win rate).
      3. If criteria not met, calls an LLM to diagnose and revise the strategy.
      4. Re-backtests the revised strategy.
      5. Stops early on success, or after max_iterations attempts.
      6. Always returns the BEST result found across all iterations.

    Args:
        strategy_json:   Initial Aegis strategy spec as a JSON string.
        period:          Historical lookback period (default '1y').
        interval:        Candle interval (optional).
        max_iterations:  Maximum refinement attempts (default 5).
        min_return_pct:  Minimum total return % required (default 0.0 = any profit).
        min_trades:      Minimum number of trades required (default 2).
        min_win_rate:    Minimum win rate % required (default 50.0).

    Returns:
        Full iteration log + the best backtest report + best strategy JSON.
    """
    try:
        strategy = json.loads(strategy_json) if isinstance(strategy_json, str) else strategy_json
    except json.JSONDecodeError as e:
        return f"[RefinementError] Failed to parse initial strategy JSON: {e}"

    strategy_name = strategy.get("name", "Strategy")
    best_report = None
    best_strategy = None
    best_return = float("-inf")
    iteration_log = []
    current_strategy = strategy

    print(f"\n[Aegis Refine] Starting for '{strategy_name}' | max={max_iterations} iters")
    print(f"[Aegis Refine] Targets: return>{min_return_pct}%, trades>={min_trades}, win_rate>={min_win_rate}%")

    for i in range(1, max_iterations + 1):
        print(f"[Aegis Refine] Iteration {i}/{max_iterations} ...")

        report, error = _run_backtest(current_strategy, period, interval)

        if error:
            entry = f"Iteration {i}: ERROR - {error}"
            iteration_log.append(entry)
            print(f"[Aegis Refine] {entry}")
            break

        summary = report.get("portfolio_summary", {})
        ret = summary.get("roi", 0) or 0
        trades = summary.get("trades", 0) or 0
        win_rate = 100
        rsi_val = _extract_rsi_threshold(current_strategy)

        entry = (
            f"Iteration {i}: return={ret}%, trades={trades}, "
            f"win_rate={win_rate}% | RSI threshold={rsi_val}"
        )
        print(f"[Aegis Refine] {entry}")

        # Track best
        if isinstance(ret, (int, float)) and ret > best_return:
            best_return = float(ret)
            best_report = report
            best_strategy = current_strategy

        passed, failures = _criteria_met(report, min_return_pct, min_trades, min_win_rate)

        if passed:
            iteration_log.append(entry + " --> SUCCESS")
            print(f"[Aegis Refine] All criteria met on iteration {i}!")
            break

        iteration_log.append(entry + f" --> FAIL: {'; '.join(failures)}")

        if i < max_iterations:
            print(f"[Aegis Refine] Refining strategy...")
            refined = _refine_strategy(current_strategy, report, failures)
            if refined is None:
                iteration_log.append(f"  Refinement LLM failed. Stopping early.")
                break
            current_strategy = refined
        else:
            iteration_log.append(f"  Exhausted {max_iterations} iterations.")
            print(f"[Aegis Refine] Exhausted {max_iterations} iterations.")

    # Build output
    log_text = "\n".join(f"  {line}" for line in iteration_log)
    best_name = best_strategy.get("name", strategy_name) if best_strategy else strategy_name

    output_parts = [
        f"**Iterative Refinement Complete - {strategy_name}**",
        f"Iterations run: {len(iteration_log)}  |  Best return: {best_return:.2f}%",
        "",
        "**Best Result:**",
        _format_report(best_report, best_name, best_strategy) if best_report else "No backtest completed successfully.",
        "",
        "**Iteration Log:**",
        log_text,
    ]

    if best_strategy and best_strategy is not strategy:
        output_parts += [
            "",
            "**Best Refined Strategy JSON:**",
            json.dumps(best_strategy, indent=2),
        ]

    return "\n".join(output_parts)
