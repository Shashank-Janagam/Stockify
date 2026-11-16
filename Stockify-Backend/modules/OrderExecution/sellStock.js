import express from "express";
import requireAuth from "../../Middleware/requireAuth.js";
import { db } from "../../db/sql.js";
import YahooFinance from "yahoo-finance2";
import redis from "../../cache/redisClient.js";
import { publishOrderToQueue } from "./orderProducer.js";

const router = express.Router();

const yahoo = new YahooFinance({
  suppressNotices: ["yahooSurvey"]
});

async function getCurrentPrice(symbol) {
  const finalSymbol = symbol.endsWith(".NS") ? symbol : `${symbol}.NS`;
  const cleanSymbol = symbol.replace(".NS", "");

  // 1. Check live Upstox ticks from Redis cache
  try {
    const rawTick = await redis.hget("ticks:latest", cleanSymbol);
    if (rawTick) {
      const tick = JSON.parse(rawTick);
      if (tick && tick.price && tick.price > 0) {
        return {
          symbol: finalSymbol,
          pricePerShare: Number(tick.price),
          name: tick.name || cleanSymbol,
        };
      }
    }
  } catch (_) {}

  // 2. Fallback to Yahoo Finance
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
      `SELECT t.id, t.side, t.quantity, t.price, t.created_at
       FROM trades t
       LEFT JOIN orders o ON t.order_id = o.id
       WHERE t.user_id = $1 AND t.stock_id = $2
         AND (o.category IS NULL OR (o.category != 'ALGO' AND o.category != 'ALGO_SESSION'))
       ORDER BY t.created_at ASC`,
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

    const { symbol, quantity, sl_enabled, sl_price, product_type, category } = req.body;
    const finalProductType =
      product_type === "Intraday" ? "Intraday" : "Delivery";

    if (!quantity || quantity <= 0)
      return res.status(400).json({ error: "Invalid qty" });

    const userRes = await client.query(`SELECT id, "Mobile", telegram_chat_id, notify_email, notify_whatsapp, notify_telegram FROM users WHERE uid=$1`, [uid]);
    if (userRes.rows.length === 0) return res.status(400).json({ error: "User not found" });
    const userId = userRes.rows[0].id;
    const userMobile = userRes.rows[0].Mobile;
    const telegramChatId = userRes.rows[0].telegram_chat_id;
    const notifyEmail = userRes.rows[0].notify_email;
    const notifyWhatsapp = userRes.rows[0].notify_whatsapp;
    const notifyTelegram = userRes.rows[0].notify_telegram;

    const stockRes = await client.query(`SELECT id, stock_name FROM stocks WHERE symbol=$1`, [symbol]);
    if (stockRes.rows.length === 0) return res.status(400).json({ error: "Stock not found" });
    const stockId = stockRes.rows[0].id;
    const stockName = stockRes.rows[0].stock_name;

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
    //  PATH B: REGULAR MARKET SELL (Produced to Kafka)
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

    const orderRes = await client.query(
      `INSERT INTO orders
       (user_id, stock_id, side, order_type, quantity, price,
        status, created_at, updated_at, sell_type, category)
       VALUES ($1, $2, 'SELL', 'MARKET', $3, $4, 'PENDING',
               NOW() AT TIME ZONE 'Asia/Kolkata',
               NOW() AT TIME ZONE 'Asia/Kolkata', $5, $6)
       RETURNING id`,
      [userId, stockId, quantity, pricePerShare, finalProductType, category || 'REGULAR']
    );
    const orderId = orderRes.rows[0].id;
    await client.query("COMMIT");

    // Publish order to Kafka queue using the dedicated Kafka producer
    try {
      await publishOrderToQueue({
        orderId,
        userId,
        userUid: uid,
        symbol,
        side: "SELL",
        quantity,
        productType: finalProductType,
        category: category || "REGULAR",
        executionPrice: pricePerShare,
      });
    } catch (kafkaErr) {
      console.error(`[SellRoute] ❌ Failed to publish SELL #${orderId} to Kafka queue:`, kafkaErr.message);
      await db.query(`UPDATE orders SET status = 'FAILED', updated_at = NOW() AT TIME ZONE 'Asia/Kolkata' WHERE id = $1`, [orderId]);
      return res.status(500).json({ error: "Failed to queue order to execution pipeline" });
    }

    res.json({
      status: "PENDING",
      orderId,
      side: "SELL",
      order_type: "MARKET",
      product_type: finalProductType,
      sl_pending: false,
      symbol,
      quantity,
      sellPricePerShare: pricePerShare,
      totalValue: sellValue,
      message: "Order placed and queued for execution via Kafka",
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
