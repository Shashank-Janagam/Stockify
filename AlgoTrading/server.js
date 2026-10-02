import express from "express";
import cors from "cors";
import "dotenv/config";
import "./intradaySquareOff.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "2mb" }));

const PORT = 4001;

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ALGO_TRADING_RUNNING" }));

// ── POST /api/strategy/submit ────────────────────────────────────────────────
// Accepts an Aegis strategy JSON, translates it, and runs a backtest.
//
// Request body:
//   {
//     "strategy": { ...Aegis strategy JSON... },
//     "symbol":   "TCS",          // override symbol (optional, falls back to strategy.symbol)
//     "period":   "1y",           // backtest lookback period (default "1y")
//     "interval": "1d"            // candle interval (optional, auto-resolved if omitted)
//   }
//
// Response:
//   { "success": true,  "strategy_name": "...", "report": { ...BacktestReport... } }
//   { "success": false, "error": "..." }
app.post("/api/strategy/submit", async (req, res) => {
  const { strategy, symbol, period = "1y", interval } = req.body;

  if (!strategy || typeof strategy !== "object") {
    return res.status(400).json({ success: false, error: "Missing or invalid 'strategy' field." });
  }

  const resolvedSymbol = (symbol || strategy.symbol || "").toUpperCase().trim();
  if (!resolvedSymbol) {
    return res.status(400).json({ success: false, error: "No symbol provided. Set 'symbol' in the request or in strategy.symbol." });
  }

  console.log(`\n[Aegis] ▶ Strategy submit received`);
  console.log(`[Aegis]   Symbol  : ${resolvedSymbol}`);
  console.log(`[Aegis]   Period  : ${period}`);
  console.log(`[Aegis]   Strategy: "${strategy.name || 'unnamed'}"`);

  console.log(`[Aegis] ⏳ Forwarding backtest request to native Python API...`);
  
  try {
    const response = await fetch("http://localhost:5001/aegis/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: resolvedSymbol,
        aegis_strategy: strategy,
        period: period,
        interval: interval
      })
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API responded with status ${response.status}: ${text}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      console.error(`[Aegis] ✗ Backtest failed: ${result.error}`);
      return res.status(500).json({ success: false, error: result.error });
    }
    
    const r = result.report || {};
    console.log(`[Aegis] ✓ Backtest complete via Native Python`);
    console.log(`[Aegis]   Trades : ${r.total_trades ?? 'N/A'}`);
    console.log(`[Aegis]   Return : ${r.total_return_pct ?? 'N/A'}%`);
    console.log(`[Aegis]   WinRate: ${r.win_rate_pct ?? 'N/A'}%`);
    
    res.json({
      success: true,
      strategy_name: strategy.name || 'Aegis Strategy',
      translated_config: strategy,
      report: result.report,
    });
  } catch (err) {
    console.error(`[Aegis] ✗ Native backtest failed:`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 AlgoTrading Server is active on port ${PORT}`);
});
