import express from "express";
import requireAuth from "../../Middleware/requireAuth.js";
import { db } from "../../db/sql.js";

const router = express.Router();

/**
 * GET /api/transactions
 * Returns latest 50 wallet transactions for logged-in user
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user.uid;

    const result = await db.query(
      `
      SELECT
        id,
        type,
        title,
        amount,
        created_at
      FROM wallet_transactions
      WHERE firebase_uid = $1
      ORDER BY created_at DESC
      LIMIT 50
      `,
      [userId]
    );

    // keep response format similar to Mongo version
    res.json(
      result.rows.map(txn => ({
        ...txn,
        amount: Number(txn.amount)
      }))
    );

  } catch (err) {
    console.error("Fetch transactions error:", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

export default router;
