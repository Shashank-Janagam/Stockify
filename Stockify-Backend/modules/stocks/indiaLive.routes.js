// routes/indiaLive.routes.js
import express from "express";
import { getYahooIndiaHistory } from "./yahooIndiaHistory.service.js";
import { getYahooIndiaQuote } from "./yahooIndiaQuote.service.js";
import redis from "../../cache/redisClient.js";
import fs from "fs";

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

// 🧠 1️⃣ Gemini Prompt for Single Stock AI Report
const buildStockPrompt = (symbol, quoteData, history1D, history1Y) => `
You are a quantitative trading assistant. Analyze ${symbol} and provide a probability-based technical assessment.

Stock Data: Price ₹${quoteData.regularMarketPrice}, Change ${quoteData.regularMarketChangePercent}%, 1D-Trend: ${JSON.stringify(history1D.slice(-10))}, 1Y-Sample: ${JSON.stringify(history1Y.filter((_, i) => i % 20 === 0))}.

Return ONLY this STRICT JSON format (no markdown):
{
  "bullish": number (chance of price going up 0-100),
  "bearish": number (chance of price going down 0-100),
  "neutral": number (chance of price staying flat 0-100),
  "breakout": number (chance of a sudden big jump 0-100),
  "correction": number (chance of a sudden big drop 0-100),
  "target": number (the price it might reach),
  "stopLoss": number (the price to sell if it drops),
  "summary": "max 8 words overall view",
  "intraday": "max 12 words for day traders",
  "delivery": "max 12 words for long-term investors",
  "suggestion": "BUY | SELL | HOLD | WAIT",
  "confidence": number (your certainty 0-100)
}
`;

// 🚀 Stock AI Route with Redis Caching (24 Hours)
router.get("/:symbol/ai-report", async (req, res) => {
  const { symbol } = req.params;
  const cacheKey = `stock:ai:v3:${symbol.toUpperCase()}`; // v3 for probability schema

  try {
    // 1️⃣ Check Redis First
    const cached = await redis.get(cacheKey);
    if (cached) {
      return res.json({
        source: "cache",
        data: JSON.parse(cached)
      });
    }

    // 2️⃣ Fetch Fresh Market Data
    const [quote, history1D, history1Y] = await Promise.all([
      getYahooIndiaQuote(symbol),
      getYahooIndiaHistory(symbol, 1),
      getYahooIndiaHistory(symbol, 365)
    ]);

    if (!quote) {
        fs.appendFileSync("ai_debug.log", `[${new Date().toISOString()}] NO QUOTE for ${symbol}\n`);
        return res.status(404).json({ error: "Stock data unavailable" });
    }

    // 3️⃣ Build Prompt and Call LLM
    const apiKey = process.env.LLM_API_KEY || process.env.GROK_API_KEY;
    if (!apiKey) {
        console.error("❌ AI reporting: Service unavailable (API key missing)");
        return res.status(503).json({ error: "AI service offline" });
    }

    const baseUrl = process.env.LLM_BASE_URL || process.env.GROK_BASE_URL || "https://api.x.ai/v1";
    const modelName = process.env.LLM_MODEL || process.env.GROK_MODEL || "openai/gpt-oss-120b";
    const prompt = buildStockPrompt(symbol, quote, history1D, history1Y);

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: modelName,
            messages: [
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.1
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API returned status ${response.status}: ${errorText}`);
    }

    const responseData = await response.json();
    let responseText = responseData.choices[0].message.content;
    
    // 🛡️ Sanitize: Strip potential markdown code blocks
    responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

    let analysis;
    try {
        analysis = JSON.parse(responseText);
    } catch (parseError) {
        fs.appendFileSync("ai_debug.log", `[${new Date().toISOString()}] PARSE ERROR for ${symbol}: ${responseText}\n`);
        throw parseError;
    }

    // 4️⃣ Store in Redis (24 Hours)
    await redis.setex(cacheKey, 86400, JSON.stringify(analysis));

    return res.json({
      source: "grok",
      data: analysis
    });

  } catch (error) {
    console.error(`AI Report Error (${symbol}):`, error);
    fs.appendFileSync("ai_debug.log", `[${new Date().toISOString()}] ERROR for ${symbol}: ${error.stack || error.message}\n`);
    res.status(500).json({ error: "Failed to generate AI analysis" });
  }
});

export default router;
