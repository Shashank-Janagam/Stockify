import express from "express";
import requireAuth from "../../Middleware/requireAuth.js";
import { db } from "../../db/sql.js";

const router = express.Router();

/**
 * DEBUG ENDPOINT - Check wallet_transactions and trades data
 */
router.get("/debug", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;

    // Get user ID
    const userRes = await db.query(`SELECT id FROM users WHERE uid=$1`, [uid]);
    if (userRes.rows.length === 0) return res.json({ error: "User not found" });
    const userId = userRes.rows[0].id;

    // Get all wallet transactions for this user
    const wtRes = await db.query(
      `SELECT id, transaction_type, reference_type, reference_id, amount, created_at 
       FROM wallet_transactions 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );

    // Get all trades for this user
    const tradesRes = await db.query(
      `SELECT t.id, t.order_id, t.side, t.quantity, t.price, s.symbol, s.stock_name
       FROM trades t
       LEFT JOIN stocks s ON t.stock_id = s.id
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC`,
      [userId]
    );

    // Try the JOIN query
    const joinRes = await db.query(
      `SELECT
        wt.id as wt_id,
        wt.transaction_type,
        wt.reference_type,
        wt.reference_id,
        t.id as trade_id,
        t.side,
        t.quantity,
        t.price,
        s.symbol,
        s.stock_name
      FROM wallet_transactions wt
      LEFT JOIN trades t ON (wt.reference_type = 'TRADE' AND wt.reference_id = t.id)
      LEFT JOIN stocks s ON t.stock_id = s.id
      WHERE wt.user_id = $1 AND wt.reference_type = 'TRADE'
      ORDER BY wt.created_at DESC`,
      [userId]
    );

    res.json({
      userId,
      walletTransactions: wtRes.rows,
      trades: tradesRes.rows,
      joinResult: joinRes.rows,
      summary: {
        totalWalletTransactions: wtRes.rows.length,
        totalTrades: tradesRes.rows.length,
        joinedRows: joinRes.rows.length
      }
    });

  } catch (err) {
    console.error("Debug endpoint error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
