import express from "express";
import axios from "axios";
import requireAuth from "../../Middleware/requireAuth.js";
import { db } from "../../db/sql.js";
import YahooFinance from "yahoo-finance2";
import redis from "../../cache/redisClient.js";

const router = express.Router();

const yahoo = new YahooFinance({
  suppressNotices: ["yahooSurvey"]
});

async function getCurrentPrice(symbol) {
  const finalSymbol = symbol.endsWith(".NS") ? symbol : `${symbol}.NS`;
  const quote = await yahoo.quote(finalSymbol);
  return {
    symbol: finalSymbol,
    pricePerShare: quote.regularMarketPrice,
    name: quote.shortName || quote.longName || finalSymbol,
  };
}

// 📌 HOLDING DETAILS 
router.get("/holding/:symbol", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const symbol = req.params.symbol.endsWith(".NS")
      ? req.params.symbol
      : `${req.params.symbol}.NS`;

    const userRes = await db.query(`SELECT id FROM users WHERE uid=$1`, [uid]);
    if (userRes.rows.length === 0) return res.json({ totalQuantity: 0, trades: [] });
    const userId = userRes.rows[0].id;

    const stockRes = await db.query(`SELECT id FROM stocks WHERE symbol=$1`, [symbol]);
    if (stockRes.rows.length === 0) return res.json({ totalQuantity: 0, trades: [] });
    const stockId = stockRes.rows[0].id;

    const posRes = await db.query(
      `SELECT sell_type, SUM(remaining_quantity) as qty
       FROM positions
       WHERE user_id = $1 AND stock_id = $2 AND status = 'OPEN'
       GROUP BY sell_type`,
      [userId, stockId]
    );

    let intradayQuantity = 0;
    let deliveryQuantity = 0;
    posRes.rows.forEach(r => {
      if (r.sell_type === 'Intraday') intradayQuantity = Number(r.qty || 0);
      else deliveryQuantity += Number(r.qty || 0);
    });

    const totalQuantity = intradayQuantity + deliveryQuantity;

    const tradesRes = await db.query(
      `SELECT id, side, quantity, price, created_at
       FROM trades
       WHERE user_id = $1 AND stock_id = $2
       ORDER BY created_at ASC`,
      [userId, stockId]
    );
    
    const trades = tradesRes.rows.map((t) => ({
      id: t.id,
      side: t.side,
      quantity: Number(t.quantity),
      pricePerShare: Number(t.price),
      totalPrice: Number(t.quantity) * Number(t.price),
      createdAtIST: t.created_at,
    }));
    // console.log(trades)

    res.json({ symbol, totalQuantity, intradayQuantity, deliveryQuantity, trades });
  } catch (err) {
    console.error("Holding fetch error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

// ──────────────────────────────────────────────────────────
//  SELL — two paths:
//  PATH A: sl_enabled = true  → PENDING order
//  PATH B: sl_enabled = false → execute immediately
// ──────────────────────────────────────────────────────────
router.post("/sell", requireAuth, async (req, res) => {
  const client = await db.connect();
  try {
    const { uid, name: userName, email } = req.user;

    const { symbol, quantity, sl_enabled, sl_price, product_type } = req.body;
    const finalProductType =
      product_type === "Intraday" ? "Intraday" : "Delivery";

    if (!quantity || quantity <= 0)
      return res.status(400).json({ error: "Invalid qty" });

    const userRes = await client.query(`SELECT id, "Mobile" FROM users WHERE uid=$1`, [uid]);
    if (userRes.rows.length === 0) return res.status(400).json({ error: "User not found" });
    const userId = userRes.rows[0].id;
    const userMobile = userRes.rows[0].Mobile;

    const stockRes = await client.query(`SELECT id FROM stocks WHERE symbol=$1`, [symbol]);
    if (stockRes.rows.length === 0) return res.status(400).json({ error: "Stock not found" });
    const stockId = stockRes.rows[0].id;

    // ══════════════════════════════════════════════════════
    //  PATH A: STOPLOSS SELL
    // ══════════════════════════════════════════════════════
    if (sl_enabled && sl_price) {
      await client.query("BEGIN");

      const orderRes = await client.query(
        `INSERT INTO orders
         (user_id, stock_id, side, order_type, quantity, price,
          stop_trigger_price, status, created_at, updated_at, sell_type, category)
         VALUES ($1, $2, 'SELL', 'MARKET', $3, NULL, $4, 'PENDING',
                 NOW() AT TIME ZONE 'Asia/Kolkata',
                 NOW() AT TIME ZONE 'Asia/Kolkata', $5, 'STOPLOSS')
         RETURNING id`,
        [userId, stockId, quantity, sl_price, finalProductType]
      );
      const orderId = orderRes.rows[0].id;

      await client.query("COMMIT");

      await redis.publish(
        "NEW_STOPLOSS",
        JSON.stringify({
          orderId, userId, stockId, symbol,
          stopLoss: sl_price, quantity, side: "SELL",
          product_type: finalProductType,
        })
      );

      return res.json({
        status: "PENDING",
        side: "SELL",
        order_type: "MARKET",
        product_type: finalProductType,
        sl_pending: true,
        sl_price,
        symbol,
        quantity,
        message: "Stoploss sell order registered — will execute when trigger price is hit",
      });
    }

    // ══════════════════════════════════════════════════════
    //  PATH B: REGULAR MARKET SELL
    // ══════════════════════════════════════════════════════
    await client.query("BEGIN");

    const posRes = await client.query(
      `SELECT id, remaining_quantity, entry_price
       FROM positions
       WHERE user_id = $1 AND stock_id = $2 AND status = 'OPEN' AND sell_type = $3
       ORDER BY created_at ASC
       FOR UPDATE`,
      [userId, stockId, finalProductType]
    );

    let available = 0;
    posRes.rows.forEach((r) => (available += Number(r.remaining_quantity)));

    if (available < quantity) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Not enough shares" });
    }

    const { pricePerShare } = await getCurrentPrice(symbol);
    if (!pricePerShare) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Price unavailable" });
    }
    const sellValue = pricePerShare * quantity;

    let qtyToSell = quantity;
    let totalRealizedPnL = 0;

    for (const pos of posRes.rows) {
      if (qtyToSell <= 0) break;

      const posQty = Number(pos.remaining_quantity);
      const consume = Math.min(posQty, qtyToSell);
      const pnl = (pricePerShare - Number(pos.entry_price)) * consume;
      totalRealizedPnL += pnl;

      const newRem = posQty - consume;
      await client.query(
        `UPDATE positions
         SET remaining_quantity = $1, status = $2, updated_at = NOW() AT TIME ZONE 'Asia/Kolkata'
         WHERE id = $3`,
        [newRem, newRem === 0 ? "CLOSED" : "OPEN", pos.id]
      );

      qtyToSell -= consume;
    }

    const walletRes = await client.query(
      `UPDATE wallet_accounts SET available_balance = available_balance + $1
       WHERE user_id = $2 RETURNING available_balance`,
      [sellValue, userId]
    );
    const newBalance = walletRes.rows[0].available_balance;

    const orderRes = await client.query(
      `INSERT INTO orders
       (user_id, stock_id, side, order_type, quantity, price,
        status, created_at, executed_at, updated_at, sell_type, category)
       VALUES ($1, $2, 'SELL', 'MARKET', $3, $4, 'EXECUTED',
               NOW() AT TIME ZONE 'Asia/Kolkata',
               NOW() AT TIME ZONE 'Asia/Kolkata',
               NOW() AT TIME ZONE 'Asia/Kolkata', $5, 'REGULAR')
       RETURNING id`,
      [userId, stockId, quantity, pricePerShare, finalProductType]
    );
    const orderId = orderRes.rows[0].id;

    const tradeRes = await client.query(
      `INSERT INTO trades
       (order_id, user_id, stock_id, side, quantity, price, realized_pnl, created_at)
       VALUES ($1, $2, $3, 'SELL', $4, $5, $6, NOW() AT TIME ZONE 'Asia/Kolkata')
       RETURNING id`,
      [orderId, userId, stockId, quantity, pricePerShare, totalRealizedPnL]
    );
    const tradeId = tradeRes.rows[0].id;

    await client.query(
      `INSERT INTO wallet_transactions
       (user_id, reference_type, reference_id, transaction_type, amount, balance_after, created_at)
       VALUES ($1, 'TRADE', $2, 'SELL', $3, $4, NOW() AT TIME ZONE 'Asia/Kolkata')`,
      [userId, tradeId, sellValue, newBalance]
    );

    const slOrdersRes = await client.query(
      `SELECT id, quantity, stop_trigger_price
       FROM orders
       WHERE user_id = $1 AND stock_id = $2 AND side = 'SELL' 
         AND status = 'PENDING' AND sell_type = $3
       ORDER BY created_at ASC
       FOR UPDATE`,
      [userId, stockId, finalProductType]
    );

    let remainingSellQty = quantity;
    const itemsToNotify = [];

    for (const slOrder of slOrdersRes.rows) {
      if (remainingSellQty <= 0) break;
      const slQty = Number(slOrder.quantity);
      const reduction = Math.min(slQty, remainingSellQty);
      const newSlQty = slQty - reduction;

      if (newSlQty <= 0) {
        await client.query(`DELETE FROM orders WHERE id = $1`, [slOrder.id]);
        itemsToNotify.push({ id: slOrder.id, action: "DELETE" });
      } else {
        await client.query(
          `UPDATE orders SET quantity = $1, updated_at = NOW() AT TIME ZONE 'Asia/Kolkata' WHERE id = $2`,
          [newSlQty, slOrder.id]
        );
        itemsToNotify.push({
          id: slOrder.id, action: "UPDATE",
          newQuantity: newSlQty, stopLoss: slOrder.stop_trigger_price
        });
      }
      remainingSellQty -= reduction;
    }

    await client.query("COMMIT");
    await redis.del(`wallet:balance:${uid}`);
    await redis.del(`ai_portfolio_v3_${userId}`);

    for (const item of itemsToNotify) {
      if (item.action === "DELETE") {
        await redis.publish("CANCEL_STOPLOSS", JSON.stringify({ orderId: item.id }));
      } else {
        await redis.publish("UPDATE_STOPLOSS", JSON.stringify({
          orderId: item.id, newQuantity: item.newQuantity, stopLoss: item.stopLoss
        }));
      }
    }

    const webhookData = {
      status: "EXECUTED",
      side: "SELL",
      order_type: "MARKET",
      product_type: finalProductType,
      sl_pending: false,
      symbol,
      quantity,
      PricePerShare: pricePerShare,
      totalValue: sellValue,
      walletBalance: newBalance,
      userId,
      orderId,
      tradeId,
      uid,
      email,
      name: userName || null,
      mobile: userMobile || null,
      subject:"PaperBull Order Execution",
    };

    try {
      console.log("Sending to n8n");
      await axios.post(
        "https://shashankjanagam.app.n8n.cloud/webhook/3714732e-5a5e-4934-ae3f-136680443064",
        webhookData
      );
    } catch (webhookErr) {
      console.error("Webhook notification failed:", webhookErr.message);
    }

    res.json({
      status: "EXECUTED", side: "SELL", order_type: "MARKET",
      product_type: finalProductType, sl_pending: false,
      symbol, quantity, sellPricePerShare: pricePerShare,
      totalValue: sellValue, walletBalance: newBalance,
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("SELL ERROR:", err);
    res.status(500).json({ error: "Sell failed" });
  } finally {
    client.release();
  }
});

export default router;
