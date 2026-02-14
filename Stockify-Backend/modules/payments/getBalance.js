import express from "express";
import { db } from "../../db/sql.js";
import requireAuth from "../../Middleware/requireAuth.js";
import redis from "../../cache/redisClient.js";

const router = express.Router();

router.get("/getBalance", requireAuth, async (req, res) => {
  try {
    const { uid, name, email } = req.user;
    const redisKey = `wallet:balance:${uid}`; // use uid as key

    // 1️⃣ Try Redis cache
    const cached = await redis.get(redisKey);
    if (cached) {
      return res.json(JSON.parse(cached));
    }

    // 2️⃣ Resolve User & Wallet (Lazy Init)
    let userRes = await db.query(`SELECT id FROM users WHERE uid = $1`, [uid]);
    let userId;

    if (userRes.rows.length === 0) {
      await db.query("BEGIN");
      const insert = await db.query(
        `INSERT INTO users (uid, name, email) VALUES ($1, $2, $3) RETURNING id`,
        [uid, name || 'Trader', email]
      );
      userId = insert.rows[0].id;
      // Default Wallet
      await db.query(`INSERT INTO wallet_accounts (user_id, available_balance) VALUES ($1, 0)`, [userId]);
      await db.query("COMMIT");
    } else {
      userId = userRes.rows[0].id;
    }

    // 3️⃣ Fetch Balance
    const walletRes = await db.query(
        `SELECT available_balance, blocked_balance FROM wallet_accounts WHERE user_id = $1`,
        [userId]
    );

    const balance = {
      cash: Number(walletRes.rows[0]?.available_balance ?? 0),
      blocked: Number(walletRes.rows[0]?.blocked_balance ?? 0)
    };

    // 4️⃣ Cache in Redis (5 minutes)
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
