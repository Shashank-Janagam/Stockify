import express from "express";
import requireAuth from "../../Middleware/requireAuth.js";
import { db } from "../../db/sql.js";

const router = express.Router();

router.post("/buy", requireAuth, async (req, res) => {
  const client = await db.connect();
  try {
    const { uid } = req.user;
    const {
      symbol,
      quantity,
      product_type,
      category,
      simulated_price,
      simulated_time,
      replay_session_id,
    } = req.body;

    if (!replay_session_id) {
      return res.status(400).json({ error: "replay_session_id is required" });
    }
    if (!symbol || !quantity || quantity <= 0) {
      return res.status(400).json({ error: "Invalid input" });
    }
    if (!simulated_price) {
      return res.status(400).json({ error: "simulated_price is required" });
    }

    const finalProductType = product_type === "Intraday" ? "Intraday" : "Delivery";
    const pricePerShare = Number(simulated_price);
    const ts = simulated_time ? new Date(simulated_time).toISOString() : new Date().toISOString();

    const userRes = await client.query(`SELECT id FROM users WHERE uid = $1`, [uid]);
    if (userRes.rows.length === 0) return res.status(400).json({ error: "User not found" });
    const userId = userRes.rows[0].id;

    // ── Verify session belongs to this user ──
    const sessionRes = await client.query(
      `SELECT id, current_cash FROM replay_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [replay_session_id, userId]
    );
    if (sessionRes.rows.length === 0) {
      return res.status(404).json({ error: "Replay session not found" });
    }
    const sessionCash = Number(sessionRes.rows[0].current_cash);

    const finalSymbol = symbol.endsWith(".NS") ? symbol : `${symbol}.NS`;
    let stockRes = await client.query(`SELECT id FROM stocks WHERE symbol = $1`, [finalSymbol]);
    if (stockRes.rows.length === 0) {
      stockRes = await client.query(
        `INSERT INTO stocks (symbol, stock_name, exchange) VALUES ($1, $2, 'NSE') RETURNING id`,
        [finalSymbol, finalSymbol]
      );
    }
    const stockId = stockRes.rows[0].id;

    await client.query("BEGIN");

    const totalPrice = pricePerShare * quantity;

    // ── Validate session wallet (NOT wallet_accounts) ──
    if (sessionCash < totalPrice) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Insufficient simulation balance" });
    }

    const newCash = sessionCash - totalPrice;

    // ── Deduct from session wallet ──
    await client.query(
      `UPDATE replay_sessions SET current_cash = $1 WHERE id = $2`,
      [newCash, replay_session_id]
    );

    // ── Insert sim order ──
    const orderRes = await client.query(
      `INSERT INTO sim_orders
       (user_id, stock_id, side, order_type, quantity, price,
        status, executed_at, created_at, updated_at, sell_type, category, replay_session_id)
       VALUES ($1, $2, 'BUY', 'MARKET', $3, $4, 'EXECUTED',
               $5, $5, $5, $6, $7, $8)
       RETURNING id`,
      [userId, stockId, quantity, pricePerShare, ts, finalProductType, category || "REGULAR", replay_session_id]
    );
    const orderId = orderRes.rows[0].id;

    // ── Insert sim trade ──
    const tradeRes = await client.query(
      `INSERT INTO sim_trades
       (order_id, user_id, stock_id, side, quantity, price, created_at, replay_session_id)
       VALUES ($1, $2, $3, 'BUY', $4, $5, $6, $7)
       RETURNING id`,
      [orderId, userId, stockId, quantity, pricePerShare, ts, replay_session_id]
    );

    // ── Upsert sim position ──
    await client.query(
      `INSERT INTO sim_positions
       (user_id, stock_id, quantity, average_price, product_type, created_at, updated_at, replay_session_id)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7)
       ON CONFLICT (user_id, stock_id, product_type, replay_session_id)
       DO UPDATE SET
         average_price = ((sim_positions.quantity * sim_positions.average_price) + (EXCLUDED.quantity * EXCLUDED.average_price)) / (sim_positions.quantity + EXCLUDED.quantity),
         quantity      = sim_positions.quantity + EXCLUDED.quantity,
         updated_at    = EXCLUDED.updated_at`,
      [userId, stockId, quantity, pricePerShare, finalProductType, ts, replay_session_id]
    );

    await client.query("COMMIT");

    res.json({
      status: "EXECUTED",
      side: "BUY",
      symbol: finalSymbol,
      quantity,
      buyPricePerShare: pricePerShare,
      totalPrice,
      sessionCash: newCash,
      replaySessionId: replay_session_id,
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("SIM BUY ERROR:", err);
    res.status(500).json({ error: "Simulation Buy failed" });
  } finally {
    client.release();
  }
});

export default router;
