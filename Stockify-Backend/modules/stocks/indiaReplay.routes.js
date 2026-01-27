import express from "express";
import { getYahooIndiaHistory } from "./yahooIndiaHistory.service.js";
import { getYahooIndiaQuote } from "./yahooIndiaQuote.service.js";
const router = express.Router();

export function replayCandlesCumulative({
  res,
  candles,
  speed = 1000
}) {
  let index = 0;

  const interval = setInterval(() => {
    if (index >= candles.length) {
      clearInterval(interval);
      res.write(`event: end\ndata: {}\n\n`);
      res.end();
      return;
    }

    // 🔥 SEND ALL DATA UP TO CURRENT INDEX
    const payload = {
        candle: candles[index]
    };  

    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    index++;
  }, speed);

  return interval;
}

/**
 * GET /api/indiaReplay/:symbol/stream
 * ?speed=500
 */
router.get("/:symbol/stream", async (req, res) => {
    console.log("replay progress:")
  const { symbol } = req.params;
  const speed = Number(req.query.speed) || 1000;

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Fetch full intraday data
  const candles = await getYahooIndiaHistory(symbol, 1);

  if (!candles?.length) {
    res.end();
    return;
  }

  const interval = replayCandlesCumulative({
    res,
    candles,
    speed
  });

  // cleanup
  req.on("close", () => {
    clearInterval(interval);
    res.end();
  });
});

router.get("/:symbol/history", async (req, res) => {
  const { symbol } = req.params;
  let { days } = req.query;
  console.log("calling hostory from live")
  // ✅ normalize
  if (days !== "ALL") {
    days = Number(days || 1);
  }

  try {
    const data = await getYahooIndiaHistory(symbol, days);
        console.log(data)

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
