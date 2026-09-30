import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();
import requireAuth from "../../Middleware/requireAuth.js";
import { db } from "../../db/sql.js";
import { getUserId } from "../dbUtils.js";

// Path to streaming trader directory
const STREAMING_TRADER_DIR = path.resolve(process.cwd(), "../crewai/streamingtrader");
const ALT_STREAMING_TRADER_DIR = path.resolve(process.cwd(), "crewai/streamingtrader");

function getTraderFilePath(filename) {
  let primary = path.join(STREAMING_TRADER_DIR, filename);
  if (fs.existsSync(primary)) return primary;

  let secondary = path.join(ALT_STREAMING_TRADER_DIR, filename);
  if (fs.existsSync(secondary)) return secondary;

  let fallback = path.join(process.cwd(), "..", "Crewai", "streamingtrader", filename);
  if (fs.existsSync(fallback)) return fallback;

  return primary;
}

// GET /api/algo/status
router.get("/status", (req, res) => {
  try {
    const configPath = getTraderFilePath("config.json");
    const liveTxPath = getTraderFilePath("live_transactions.json");
    const simTxPath = getTraderFilePath("transactions.json");

    let config = {};
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      } catch (e) {}
    }

    let liveTx = [];
    if (fs.existsSync(liveTxPath)) {
      try {
        liveTx = JSON.parse(fs.readFileSync(liveTxPath, "utf-8"));
      } catch (e) {}
    }

    let simTx = [];
    if (fs.existsSync(simTxPath)) {
      try {
        simTx = JSON.parse(fs.readFileSync(simTxPath, "utf-8"));
      } catch (e) {}
    }

    const allTx = Array.isArray(liveTx) && liveTx.length > 0 ? liveTx : (Array.isArray(simTx) ? simTx : []);
    
    // Sort transactions reverse chronological
    const sortedTx = [...allTx].reverse();

    // Summary calculations
    let totalTrades = sortedTx.length;
    let buyCount = sortedTx.filter(t => t.action === "BUY").length;
    let sellCount = sortedTx.filter(t => t.action === "SELL").length;
    let totalVolume = sortedTx.reduce((acc, t) => acc + (t.total_value || 0), 0);

    res.json({
      success: true,
      config,
      summary: {
        totalTrades,
        buyCount,
        sellCount,
        totalVolume,
        lastActive: sortedTx[0]?.datetime_real || sortedTx[0]?.timestamp || null,
        mode: Array.isArray(liveTx) && liveTx.length > 0 ? "LIVE" : "SIMULATION"
      },
      transactions: sortedTx
    });
  } catch (err) {
    console.error("Algo status error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/algo/config
router.post("/config", (req, res) => {
  try {
    const configPath = getTraderFilePath("config.json");
    let currentConfig = {};
    if (fs.existsSync(configPath)) {
      try {
        currentConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      } catch (e) {}
    }

    const updatedConfig = { ...currentConfig, ...req.body };
    fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 4), "utf-8");

    res.json({ success: true, config: updatedConfig });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/algo/session/start
router.post("/session/start", requireAuth, async (req, res) => {
  try {
    const userId = await getUserId(req.user.uid, req.user.name, req.user.email);
    const { capital, symbol, strategyName } = req.body;
    const stockLabel = symbol ? symbol.replace('.NS','').toUpperCase() : 'ALGO';
    const strat = strategyName || 'Custom';
    const refType = (`Algo Start: ${stockLabel} [${strat}]`).substring(0, 50);
    if (!capital || capital <= 0) return res.status(400).json({ error: "Invalid capital" });
    
    // Check balance
    const { rows } = await db.query("SELECT available_balance as cash FROM wallet_accounts WHERE user_id = $1 AND (account_type = 'LIVE' OR account_type IS NULL) LIMIT 1", [userId]);
    if (!rows.length || rows[0].cash < capital) return res.status(400).json({ error: "Insufficient balance" });
    
    // Deduct
    await db.query("UPDATE wallet_accounts SET available_balance = available_balance - $1 WHERE user_id = $2 AND (account_type = 'LIVE' OR account_type IS NULL)", [capital, userId]);
    
    // Add Transaction
    await db.query(
        "INSERT INTO wallet_transactions (user_id, reference_type, transaction_type, amount, balance_after, created_at) VALUES ($1, $3, 'WITHDRAWAL', $2, (SELECT available_balance FROM wallet_accounts WHERE user_id=$1 AND (account_type = 'LIVE' OR account_type IS NULL) LIMIT 1), NOW() AT TIME ZONE 'Asia/Kolkata')",
        [userId, capital, refType]
    );
    
    // Invalidate Cache
    if (req.user && req.user.uid) {
        const redis = (await import('../../cache/redisClient.js')).default;
        await redis.del(`wallet:balance:${req.user.uid}`);
    }
    
    res.json({ success: true, message: "Capital allocated" });
  } catch (e) {
    console.error("Algo start error:", e);
    res.status(500).json({ error: e.message || "Internal error", stack: e.stack });
  }
});

// POST /api/algo/session/stop
router.post("/session/stop", requireAuth, async (req, res) => {
  try {
    const userId = await getUserId(req.user.uid, req.user.name, req.user.email);
    const { returnedCapital, symbol, strategyName, pnl, trades } = req.body;
    
    if (returnedCapital === undefined || returnedCapital === null || isNaN(Number(returnedCapital))) {
       return res.status(400).json({ error: "Invalid returned capital" });
    }
    
    const stockLabel = symbol ? symbol.replace('.NS','').toUpperCase() : 'ALGO';
    const strat = strategyName || 'Custom';
    const pnlSign = (pnl >= 0) ? `+₹${Number(pnl).toFixed(2)}` : `-₹${Math.abs(Number(pnl)).toFixed(2)}`;
    const refType = (`Algo Return: ${stockLabel} P&L ${pnlSign} [${strat}]`).substring(0, 50);
    
    // Add returned capital (original + pnl) back to wallet
    await db.query("UPDATE wallet_accounts SET available_balance = available_balance + $1 WHERE user_id = $2 AND (account_type = 'LIVE' OR account_type IS NULL)", [returnedCapital, userId]);
    
    // Add Transaction
    await db.query(
        "INSERT INTO wallet_transactions (user_id, reference_type, transaction_type, amount, balance_after, created_at) VALUES ($1, $3, 'DEPOSIT', $2, (SELECT available_balance FROM wallet_accounts WHERE user_id=$1 AND (account_type = 'LIVE' OR account_type IS NULL) LIMIT 1), NOW() AT TIME ZONE 'Asia/Kolkata')",
        [userId, returnedCapital, refType]
    );
    
    // Invalidate Cache
    if (req.user && req.user.uid) {
        const redis = (await import('../../cache/redisClient.js')).default;
        await redis.del(`wallet:balance:${req.user.uid}`);
    }
    
    // Save to orders table as a single AlgoOrder summary if there were trades
    if (trades && trades.length > 0) {
       // Look up stock_id
       let stockId = null;
       const finalSymbol = symbol ? (symbol.endsWith('.NS') ? symbol : `${symbol}.NS`) : 'ALGO.NS';
       const finalName = symbol ? symbol.replace('.NS', '') : 'ALGO';

       const stockRes = await db.query(`SELECT id FROM stocks WHERE symbol = $1`, [finalSymbol]);
       if (stockRes.rows.length === 0) {
         const ins = await db.query(
           `INSERT INTO stocks (symbol, name, exchange, tick_size) VALUES ($1, $2, 'NSE', 0.05) RETURNING id`,
           [finalSymbol, finalName]
         );
         stockId = ins.rows[0].id;
       } else {
         stockId = stockRes.rows[0].id;
       }

       // Try adding reason and algo_session_id columns
       try { 
         await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS reason VARCHAR(255)`); 
         await db.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS algo_session_id VARCHAR(100)`);
       } catch(e) {}

       const sessionId = `ALGO_${Date.now()}_${Math.floor(Math.random()*1000)}`;

       // Insert Master Session Order
       const masterRes = await db.query(
         "INSERT INTO orders (user_id, stock_id, side, order_type, quantity, price, category, sell_type, status, executed_at, reason, algo_session_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() AT TIME ZONE 'Asia/Kolkata', $10, $11) RETURNING id",
         [userId, stockId, 'BUY', 'MARKET', trades.length, 0, 'ALGO_SESSION', 'INTRADAY', 'COMPLETED', `Algo Session: ${strat}`, sessionId]
       );
       const masterId = masterRes.rows[0].id;
       await db.query("INSERT INTO trades (order_id, user_id, stock_id, side, quantity, price, realized_pnl, created_at) VALUES ($1, $2, $3, 'BUY', 0, 0, $4, NOW() AT TIME ZONE 'Asia/Kolkata')", [masterId, userId, stockId, pnl]);

       for (const trade of trades) {
         await db.query(
           "INSERT INTO orders (user_id, stock_id, side, order_type, quantity, price, category, sell_type, status, executed_at, reason, algo_session_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() AT TIME ZONE 'Asia/Kolkata', $10, $11)",
           [userId, stockId, trade.side, "MARKET", trade.quantity, trade.pricePerShare, "ALGO", "INTRADAY", "COMPLETED", (trade.reason || strat).substring(0, 255), sessionId]
         );
       }
    }
    
    res.json({ success: true, message: "Capital returned" });
  } catch (e) {
    console.error("Algo stop error:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
