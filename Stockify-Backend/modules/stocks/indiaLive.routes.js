// routes/indiaLive.routes.js
import express from "express";
import { getYahooIndiaHistory } from "./yahooIndiaHistory.service.js";
import { getYahooIndiaQuote } from "./yahooIndiaQuote.service.js";
import redis from "../../cache/redisClient.js";
import fs from "fs";
import { resolveStockProfile, getSimilarStocks } from "./profileResolver.js";

const router = express.Router();
import { db } from "../../db/sql.js";

router.get("/list", async (req, res) => {
  try {
    const result = await db.query("SELECT symbol, stock_name FROM stocks");
    res.json(result.rows);
  } catch (err) {
    console.error("Failed to fetch stock list:", err);
    res.status(500).json({ error: "Failed to fetch stock list" });
  }
});

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
  const interval = setInterval(sendUpdate, 1500);
  req.on("close", () => {clearInterval(interval);
    console.log("SEE closed")
  });
});

router.get("/:symbol/history", async (req, res) => {
  const { symbol } = req.params;
  let { days } = req.query;
  // console.log("calling history from live")
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

// Expose profile route
router.get("/:symbol/profile", async (req, res) => {
  try {
    const { symbol } = req.params;
    const profile = await resolveStockProfile(symbol);
    if (!profile) {
      return res.status(404).json({ error: "Company profile not found" });
    }
    return res.json(profile);
  } catch (err) {
    console.error("Profile endpoint error:", err);
    res.status(500).json({ error: "Failed to retrieve profile" });
  }
});

// Expose similar stocks route
router.get("/:symbol/similar", async (req, res) => {
  try {
    const { symbol } = req.params;
    const profile = await resolveStockProfile(symbol);
    const sector = profile?.sector || "Others";
    const similar = await getSimilarStocks(symbol, sector);
    return res.json({ symbol, sector, similar_stocks: similar });
  } catch (err) {
    console.error("Similar endpoint error:", err);
    res.status(500).json({ error: "Failed to retrieve similar stocks" });
  }
});

export default router;
