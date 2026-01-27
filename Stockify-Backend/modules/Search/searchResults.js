import express from "express";
import { getDb } from "../../db/mongo.js";
import { yahooSearch } from "./yahooSearch.js";
import redis from "../../cache/redisClient.js";

const router = express.Router();

// TTL for search cache (seconds)
const SEARCH_CACHE_TTL = 60 * 10; // 10 minutes

router.get("/search", async (req, res) => {
  try {
    const q = (req.query.q || "").toLowerCase().trim();
    if (q.length < 2) return res.json([]);

    const redisKey = `search:${q}`;

    /* =========================
       1️⃣ REDIS CACHE (FASTEST)
    ========================= */
    const cached = await redis.get(redisKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    /* =========================
       2️⃣ MONGODB
    ========================= */
    const db = getDb();
    const stocks = db.collection("stocks");

    const mongoResults = await stocks
      .find({
        $or: [
          { symbol: { $regex: `^${q}`, $options: "i" } },
          { name: { $regex: q, $options: "i" } }
        ]
      })
      .sort({ popularity: -1 })
      .limit(10)
      .toArray();

    if (mongoResults.length) {
      await redis.set(
        redisKey,
        JSON.stringify(mongoResults),
        "EX",
        SEARCH_CACHE_TTL
      );
      return res.json(mongoResults);
    }

    /* =========================
       3️⃣ YAHOO FALLBACK
    ========================= */
    const yahooResults = await yahooSearch(q);

    await redis.set(
      redisKey,
      JSON.stringify(yahooResults),
      "EX",
      SEARCH_CACHE_TTL
    );

    return res.json(yahooResults);
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ message: "Search failed" });
  }
});

export default router;
