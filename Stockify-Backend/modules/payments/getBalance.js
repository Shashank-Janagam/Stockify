import express from "express";
import { db } from "../../db/sql.js";
import requireAuth from "../../Middleware/requireAuth.js";
import redis from "../../cache/redisClient.js";

const router = express.Router();

/**
 * GET /getBalance
 * Returns user's wallet balance (SQL source of truth)
 */
router.get("/getBalance", requireAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const redisKey = `wallet:balance:${userId}`;

    // 1️⃣ Try Redis cache
    const cached = await redis.get(redisKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // 2️⃣ Fetch from SQL
    const result = await db.query(
      `
      SELECT balance
      FROM wallets
      WHERE firebase_uid = $1
      `,
      [userId]
    );

   const balance = {
  cash: Number(result.rows[0]?.balance ?? 0),
  blocked: 0
};


    // 3️⃣ Cache in Redis (5 minutes)
    await redis.set(
      redisKey,
      JSON.stringify(balance),
      "EX",
      300
    );

    return res.json(balance);

  } catch (err) {
    console.error("getBalance error:", err);
    res.status(500).json({ error: "Failed to fetch balance" });
  }
});

export default router;
