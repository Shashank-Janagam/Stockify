import express from "express";
import { getYahooIndiaHistory } from "../services/yahooIndiaHistory.service.js";
import { getYahooIndiaQuote } from "../services/yahooIndiaQuote.service.js";
const router = express.Router();

router.get("/:symbol/history", async (req, res) => {
console.log("calling history route")
  const { symbol } = req.params;
  let { days } = req.query;

  // ✅ normalize
  if (days !== "ALL") {
    days = Number(days || 1);
  }

  try {
    const data = await getYahooIndiaHistory(symbol, days);
    res.json(data); 
  } catch (err) {
    console.log("Market closed------------------")
    res.status(500).json({ error: "Failed to fetch history" });
  }
});
router.get("/:symbol/quote", async (req, res) => {
  console.log("calling quote")
  try {
    const data = await getYahooIndiaQuote(req.params.symbol);
    res.json(data);
  } catch (err) {
    console.error("Quote error:", err.message);
    res.status(500).json({ error: "Quote fetch failed" });
  }
});


export default router;
