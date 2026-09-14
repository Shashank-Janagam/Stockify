import express from "express";
import { db } from "../../db/sql.js";
import requireAuth from "../../Middleware/requireAuth.js";

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// GET /api/simulation/balance?session_id=X
// ─────────────────────────────────────────────────────────────
router.get("/balance", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ error: "session_id query param is required" });
    }

    const userRes = await db.query(`SELECT id FROM users WHERE uid = $1`, [uid]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "User not found" });
    const userId = userRes.rows[0].id;

    const sessionRes = await db.query(
      `SELECT current_cash, initial_capital FROM replay_sessions WHERE id = $1 AND user_id = $2`,
      [Number(session_id), userId]
    );

    if (sessionRes.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const row = sessionRes.rows[0];
    res.json({
      cash: Number(row.current_cash),
      blocked: 0,
      initialCapital: Number(row.initial_capital),
    });
  } catch (err) {
    console.error("sim balance error:", err);
    res.status(500).json({ error: "Failed to fetch simulation balance" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/simulation/positions?session_id=X
// ─────────────────────────────────────────────────────────────
router.get("/positions", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ error: "session_id query param is required" });
    }

    const userRes = await db.query(`SELECT id FROM users WHERE uid = $1`, [uid]);
    if (userRes.rows.length === 0) return res.json([]);
    const userId = userRes.rows[0].id;

    // Verify session belongs to user
    const sessionCheck = await db.query(
      `SELECT id FROM replay_sessions WHERE id = $1 AND user_id = $2`,
      [Number(session_id), userId]
    );
    if (sessionCheck.rows.length === 0) return res.json([]);

    const posRes = await db.query(
      `SELECT p.id, s.symbol, s.stock_name as name, p.average_price as entry_price, p.quantity,
              p.product_type, p.created_at
       FROM sim_positions p
       JOIN stocks s ON s.id = p.stock_id
       WHERE p.user_id = $1 AND p.replay_session_id = $2 AND p.quantity > 0
       ORDER BY p.created_at DESC`,
      [userId, Number(session_id)]
    );

    res.json(posRes.rows.map(r => ({
      symbol: r.symbol,
      name: r.name,
      entryPrice: Number(r.entry_price),
      quantity: Number(r.quantity),
      productType: r.product_type,
      createdAt: r.created_at,
    })));
  } catch (err) {
    console.error("sim positions error:", err);
    res.status(500).json({ error: "Failed to fetch simulation positions" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/simulation/trades/:symbol?session_id=X
// ─────────────────────────────────────────────────────────────
router.get("/trades/:symbol", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const { symbol } = req.params;
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ error: "session_id query param is required" });
    }

    const userRes = await db.query(`SELECT id FROM users WHERE uid = $1`, [uid]);
    if (userRes.rows.length === 0) return res.json([]);
    const userId = userRes.rows[0].id;

    // Verify session belongs to user
    const sessionCheck = await db.query(
      `SELECT id FROM replay_sessions WHERE id = $1 AND user_id = $2`,
      [Number(session_id), userId]
    );
    if (sessionCheck.rows.length === 0) return res.json([]);

    const finalSymbol = symbol.endsWith(".NS") ? symbol : `${symbol}.NS`;
    const stockRes = await db.query(`SELECT id FROM stocks WHERE symbol = $1`, [finalSymbol]);
    if (stockRes.rows.length === 0) return res.json([]);
    const stockId = stockRes.rows[0].id;

    const tradesRes = await db.query(
      `SELECT side, quantity, price, created_at
       FROM sim_trades
       WHERE user_id = $1 AND stock_id = $2 AND replay_session_id = $3
       ORDER BY created_at ASC`,
      [userId, stockId, Number(session_id)]
    );

    res.json(tradesRes.rows.map(r => ({
      side: r.side,
      quantity: Number(r.quantity),
      pricePerShare: Number(r.price),
      createdAtIST: r.created_at,
    })));
  } catch (err) {
    console.error("sim trades error:", err);
    res.status(500).json({ error: "Failed to fetch simulation trades" });
  }
});

export default router;
