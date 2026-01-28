// routes/indiaLive.routes.js
import express from "express";
import { getYahooIndiaHistory } from "./yahooIndiaHistory.service.js";
import { getYahooIndiaQuote } from "./yahooIndiaQuote.service.js";

const router = express.Router();

// mock
router.get("/:symbol/stream", async (req, res) => {
  const { symbol } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let isClosed = false;
  req.on("close", () => (isClosed = true));

  async function sendUpdate() {

    if (isClosed) return;

    try {
      const candlesRaw = await getYahooIndiaHistory(symbol, 1);
      if (!candlesRaw.length) return;

      const candles = candlesRaw.map(d => ({
        x: d.x,
        c: d.c
      }));

      const quote = await getYahooIndiaQuote(symbol);

      // ✅ MATCH FRONTEND EXPECTATION
      res.write(
        `data: ${JSON.stringify({
          candles,
          quote
        })}\n\n`
      );
    } catch (err) {
      console.error("❌ SSE error:", err.message);
    }
  }

  await sendUpdate();
  const interval = setInterval(sendUpdate, 1000);
  req.on("close", () => {clearInterval(interval);
    console.log("SEE closed")
  });
});

router.get("/:symbol/history", async (req, res) => {
  const { symbol } = req.params;
  let { days } = req.query;
  console.log("calling history from live")
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
  const { symbol } = req.params;


    const data = await getYahooIndiaQuote(symbol);
    // 🚨 Guard against empty Yahoo response
    if (!data) {
      console.log("no data")
      return res.status(204).json({ error: "NO_DATA" });
    }

    res.json(data);
 
});

export default router;
