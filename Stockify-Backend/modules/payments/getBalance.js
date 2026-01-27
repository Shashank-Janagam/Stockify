import express from "express";
import { getDb } from "../../db/mongo.js";
import requireAuth from "../../Middleware/requireAuth.js";
import redis from "../../cache/redisClient.js"
const router = express.Router();

/**
 * GET /balance
 * Returns user's balance
 * Lazy-creates balance if missing
 */


router.get("/getBalance", requireAuth, async (req, res) => {
  const userId = req.user.uid;
  const redisKey = `wallet:balance:${userId}`;

  // 1️⃣ Redis first
  await redis.flushall()
  console.log("redis frmget bal",redisKey)

  const cached = await redis.get(redisKey);
  if (cached) {
    return res.json(JSON.parse(cached));
  }

  // 2️⃣ Fallback to Mongo
  const wallet = await getDb()
    .collection("wallets")
    .findOne({ userId });

  const balance = {
    cash: wallet?.cash ?? 0,
    blocked: wallet?.blocked ?? 0,
  };
  // 3️⃣ Populate Redis ONLY if empty
  await redis.set(
    redisKey,
    JSON.stringify(balance),
    "EX",
    300
  );

  return res.json(balance);
});


export default router;
