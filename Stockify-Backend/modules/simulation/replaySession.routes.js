import express from "express";
import { db } from "../../db/sql.js";
import requireAuth from "../../Middleware/requireAuth.js";

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// POST /api/replay/sessions
// Create a brand-new replay session with its own isolated wallet.
// ─────────────────────────────────────────────────────────────
router.post("/sessions", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const { symbol, replay_date, interval_used = "1m", initial_capital = 100000 } = req.body;

    if (!symbol || !replay_date) {
      return res.status(400).json({ error: "symbol and replay_date are required" });
    }

    const userRes = await db.query(`SELECT id FROM users WHERE uid = $1`, [uid]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "User not found" });
    const userId = userRes.rows[0].id;

    // Always create a NEW session — never reuse an existing one.
    const sessionRes = await db.query(
      `INSERT INTO replay_sessions
         (user_id, symbol, replay_date, interval_used, initial_capital, current_cash, status)
       VALUES ($1, $2, $3, $4, $5, $5, 'RUNNING')
       RETURNING id, initial_capital, current_cash, created_at`,
      [userId, symbol.replace(".NS", ""), replay_date, interval_used, Number(initial_capital)]
    );

    const session = sessionRes.rows[0];
    res.json({
      sessionId: session.id,
      initialCapital: Number(session.initial_capital),
      currentCash: Number(session.current_cash),
      createdAt: session.created_at,
    });
  } catch (err) {
    console.error("create session error:", err);
    res.status(500).json({ error: "Failed to create replay session" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/replay/sessions
// List all past sessions for the user (optionally filtered by symbol).
// ─────────────────────────────────────────────────────────────
router.get("/sessions", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const { symbol } = req.query;

    const userRes = await db.query(`SELECT id FROM users WHERE uid = $1`, [uid]);
    if (userRes.rows.length === 0) return res.json([]);
    const userId = userRes.rows[0].id;

    let query = `
      SELECT
        rs.id,
        rs.symbol,
        rs.replay_date,
        rs.interval_used,
        rs.initial_capital,
        rs.current_cash,
        rs.status,
        rs.created_at,
        rs.completed_at,
        (rs.current_cash - rs.initial_capital) AS pnl,
        ROUND(((rs.current_cash - rs.initial_capital) / rs.initial_capital) * 100, 2) AS return_pct,
        (SELECT COUNT(*) FROM sim_trades WHERE replay_session_id = rs.id) AS trade_count
      FROM replay_sessions rs
      WHERE rs.user_id = $1
    `;
    const params = [userId];

    if (symbol) {
      query += ` AND rs.symbol = $2`;
      params.push(symbol.replace(".NS", ""));
    }

    query += ` ORDER BY rs.created_at DESC LIMIT 50`;

    const result = await db.query(query, params);
    res.json(result.rows.map(r => ({
      id: r.id,
      symbol: r.symbol,
      replayDate: r.replay_date,
      intervalUsed: r.interval_used,
      initialCapital: Number(r.initial_capital),
      currentCash: Number(r.current_cash),
      pnl: Number(r.pnl),
      returnPct: Number(r.return_pct),
      status: r.status,
      tradeCount: Number(r.trade_count),
      createdAt: r.created_at,
      completedAt: r.completed_at,
    })));
  } catch (err) {
    console.error("list sessions error:", err);
    res.status(500).json({ error: "Failed to list replay sessions" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/replay/sessions/:id
// Get full detail of a single session.
// ─────────────────────────────────────────────────────────────
router.get("/sessions/:id", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const sessionId = Number(req.params.id);

    const userRes = await db.query(`SELECT id FROM users WHERE uid = $1`, [uid]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "User not found" });
    const userId = userRes.rows[0].id;

    const sessionRes = await db.query(
      `SELECT rs.*,
              (rs.current_cash - rs.initial_capital) AS pnl,
              ROUND(((rs.current_cash - rs.initial_capital) / rs.initial_capital) * 100, 2) AS return_pct,
              (SELECT COUNT(*) FROM sim_trades WHERE replay_session_id = rs.id) AS trade_count
       FROM replay_sessions rs
       WHERE rs.id = $1 AND rs.user_id = $2`,
      [sessionId, userId]
    );

    if (sessionRes.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    const r = sessionRes.rows[0];
    res.json({
      id: r.id,
      symbol: r.symbol,
      replayDate: r.replay_date,
      intervalUsed: r.interval_used,
      initialCapital: Number(r.initial_capital),
      currentCash: Number(r.current_cash),
      pnl: Number(r.pnl),
      returnPct: Number(r.return_pct),
      status: r.status,
      tradeCount: Number(r.trade_count),
      createdAt: r.created_at,
      completedAt: r.completed_at,
    });
  } catch (err) {
    console.error("get session error:", err);
    res.status(500).json({ error: "Failed to get session" });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/replay/sessions/:id/trades
// Get all trades for a specific session (never leaks between sessions).
// ─────────────────────────────────────────────────────────────
router.get("/sessions/:id/trades", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const sessionId = Number(req.params.id);

    const userRes = await db.query(`SELECT id FROM users WHERE uid = $1`, [uid]);
    if (userRes.rows.length === 0) return res.json([]);
    const userId = userRes.rows[0].id;

    // Verify session belongs to user
    const sessionCheck = await db.query(
      `SELECT id FROM replay_sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, userId]
    );
    if (sessionCheck.rows.length === 0) return res.status(404).json({ error: "Session not found" });

    const tradesRes = await db.query(
      `SELECT st.side, st.quantity, st.price, st.created_at, s.symbol
       FROM sim_trades st
       JOIN stocks s ON s.id = st.stock_id
       WHERE st.replay_session_id = $1 AND st.user_id = $2
       ORDER BY st.created_at ASC`,
      [sessionId, userId]
    );

    res.json(tradesRes.rows.map(r => ({
      side: r.side,
      quantity: Number(r.quantity),
      pricePerShare: Number(r.price),
      symbol: r.symbol,
      createdAtIST: r.created_at,
    })));
  } catch (err) {
    console.error("get session trades error:", err);
    res.status(500).json({ error: "Failed to get session trades" });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/replay/sessions/:id/complete
// Mark session as COMPLETED.
// ─────────────────────────────────────────────────────────────
router.post("/sessions/:id/complete", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const sessionId = Number(req.params.id);

    const userRes = await db.query(`SELECT id FROM users WHERE uid = $1`, [uid]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "User not found" });
    const userId = userRes.rows[0].id;

    await db.query(
      `UPDATE replay_sessions
       SET status = 'COMPLETED', completed_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [sessionId, userId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("complete session error:", err);
    res.status(500).json({ error: "Failed to complete session" });
  }
});

export default router;
