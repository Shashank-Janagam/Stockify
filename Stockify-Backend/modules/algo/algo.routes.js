import express from "express";
import fs from "fs";
import path from "path";

const router = express.Router();

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

export default router;
