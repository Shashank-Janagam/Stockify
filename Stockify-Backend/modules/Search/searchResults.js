import express from "express";
import { searchStocks } from "./stockSearchEngine.js";
import redis from "../../cache/redisClient.js";

const router = express.Router();

// TTL for search cache (seconds)
const SEARCH_CACHE_TTL = 60 * 5; // 5 minutes

router.get("/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const category = req.query.category || "All";
    const limit = parseInt(req.query.limit) || 15;

    if (q.length < 1) {
      return res.json({ results: [], didYouMean: null, total: 0, query: q });
    }

    const redisKey = `search:${category}:${q.toLowerCase()}`;

    /* =========================
       1️⃣ REDIS CACHE (FASTEST)
    ========================= */
    try {
      const cached = await redis.get(redisKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
    } catch (e) {
      // Redis error ignore safely
    }

    /* ==============================================
       2️⃣ HIGH SPEED TYPO-TOLERANT SEARCH ENGINE
    ============================================== */
    const searchResponse = searchStocks(q, { category, limit });

    /* =========================
       3️⃣ CACHE TO REDIS
    ========================= */
    try {
      await redis.set(
        redisKey,
        JSON.stringify(searchResponse),
        "EX",
        SEARCH_CACHE_TTL
      );
    } catch (e) {
      // Redis error ignore safely
    }

    return res.json(searchResponse);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ message: "Search failed", results: [], didYouMean: null });
  }
});

export default router;

