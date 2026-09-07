import express from "express";
import { getYahooIndiaHistory } from "./yahooIndiaHistory.service.js";
import { getYahooIndiaQuote } from "./yahooIndiaQuote.service.js";

const router = express.Router();

router.get("/:symbol/history", async (req, res) => {
  const { symbol } = req.params;
  let { days, interval } = req.query;

  // ✅ normalize
  if (days !== "ALL") {
    days = Number(days || 1);
  }

  try {
    const data = await getYahooIndiaHistory(symbol, days, interval);
    res.json(data || []);
  } catch (err) {
    console.warn(`[HistoryRoute] Could not fetch history for ${symbol}:`, err.message);
    res.json([]);
  }
});

router.get("/:symbol/quote", async (req, res) => {
  try {
    const data = await getYahooIndiaQuote(req.params.symbol);
    if (!data) {
      return res.status(204).json({ error: "NO_DATA" });
    }
    res.json(data);
  } catch (err) {
    console.error("Quote error:", err.message);
    res.status(500).json({ error: "Quote fetch failed" });
  }
});

export default router;
