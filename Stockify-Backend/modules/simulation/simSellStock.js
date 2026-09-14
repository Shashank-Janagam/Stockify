import express from "express";
import requireAuth from "../../Middleware/requireAuth.js";
import { db } from "../../db/sql.js";

const router = express.Router();

router.post("/sell", requireAuth, async (req, res) => {
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

    // ── Verify session ──
    const sessionRes = await client.query(
      `SELECT id, current_cash FROM replay_sessions WHERE id = $1 AND user_id = $2`,
      [replay_session_id, userId]
    );
    if (sessionRes.rows.length === 0) {
      return res.status(404).json({ error: "Replay session not found" });
    }

    const finalSymbol = symbol.endsWith(".NS") ? symbol : `${symbol}.NS`;
    let stockRes = await client.query(`SELECT id FROM stocks WHERE symbol = $1`, [finalSymbol]);
    if (stockRes.rows.length === 0) {
      return res.status(400).json({ error: "Stock not found in portfolio" });
    }
    const stockId = stockRes.rows[0].id;

    await client.query("BEGIN");

    // ── Fetch session-scoped position ──
    const posRes = await client.query(
      `SELECT id, quantity, average_price
       FROM sim_positions
       WHERE user_id = $1 AND stock_id = $2 AND product_type = $3 AND replay_session_id = $4
       FOR UPDATE`,
      [userId, stockId, finalProductType, replay_session_id]
    );

    if (posRes.rows.length === 0 || Number(posRes.rows[0].quantity) < quantity) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Not enough shares in this simulation session" });
    }

    const pos = posRes.rows[0];
    const sellValue = pricePerShare * quantity;
    const realizedPnL = (pricePerShare - Number(pos.average_price)) * quantity;

    // ── Update position ──
    await client.query(
      `UPDATE sim_positions SET quantity = quantity - $1, updated_at = $2 WHERE id = $3`,
      [quantity, ts, pos.id]
    );

    // ── Credit session wallet (NOT wallet_accounts) ──
    const walletRes = await client.query(
      `UPDATE replay_sessions SET current_cash = current_cash + $1 WHERE id = $2 RETURNING current_cash`,
      [sellValue, replay_session_id]
    );
    const newCash = Number(walletRes.rows[0].current_cash);

    // ── Insert sim order + trade ──
    const orderRes = await client.query(
      `INSERT INTO sim_orders
       (user_id, stock_id, side, order_type, quantity, price,
        status, executed_at, created_at, updated_at, sell_type, category, replay_session_id)
       VALUES ($1, $2, 'SELL', 'MARKET', $3, $4, 'EXECUTED',
               $5, $5, $5, $6, $7, $8)
       RETURNING id`,
      [userId, stockId, quantity, pricePerShare, ts, finalProductType, category || "REGULAR", replay_session_id]
    );
    const orderId = orderRes.rows[0].id;

    await client.query(
      `INSERT INTO sim_trades
       (order_id, user_id, stock_id, side, quantity, price, created_at, replay_session_id)
       VALUES ($1, $2, $3, 'SELL', $4, $5, $6, $7)`,
      [orderId, userId, stockId, quantity, pricePerShare, ts, replay_session_id]
    );

    await client.query("COMMIT");

    res.json({
      status: "EXECUTED",
      side: "SELL",
      symbol: finalSymbol,
      quantity,
      sellPricePerShare: pricePerShare,
      sellValue,
      realizedPnL,
      sessionCash: newCash,
      replaySessionId: replay_session_id,
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("SIM SELL ERROR:", err);
    res.status(500).json({ error: "Simulation Sell failed" });
  } finally {
    client.release();
  }
});

export default router;
