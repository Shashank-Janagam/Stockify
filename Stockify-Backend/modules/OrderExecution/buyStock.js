import express from "express";
import { db } from "../../db/sql.js";
import requireAuth from "../../Middleware/requireAuth.js";
import YahooFinance from "yahoo-finance2";
import redis from "../../cache/redisClient.js";
import { publishOrderToQueue } from "./orderProducer.js";

const router = express.Router();

function normalizeYahooTime(t) {
  if (typeof t === "string") {
    const d = new Date(t);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof t === "number" && t > 0 && t < 1e12) {
    return new Date(t * 1000).toISOString();
  }
  if (typeof t === "number" && t >= 1e12) {
    return new Date(t).toISOString();
  }
  return new Date().toISOString();
}

const yahoo = new YahooFinance({
  suppressNotices: ["yahooSurvey"]
});

async function getCurrentPrice(symbol) {
  const finalSymbol = symbol.endsWith(".NS") ? symbol : `${symbol}.NS`;
  const cleanSymbol = symbol.replace(".NS", "");

  // 1. Check live Upstox ticks from Redis cache (sub-millisecond)
  try {
    const rawTick = await redis.hget("ticks:latest", cleanSymbol);
    if (rawTick) {
      const tick = JSON.parse(rawTick);
      if (tick && tick.price && tick.price > 0) {
        return {
          symbol: finalSymbol,
          pricePerShare: Number(tick.price),
          name: tick.name || cleanSymbol,
          exchange: "NSE",
          tickSize: 0.05,
          createdAt: new Date().toISOString(),
        };
      }
    }
  } catch (_) {}

  // 2. Fallback to Yahoo Finance
  const quote = await yahoo.quote(finalSymbol);
  const createdAt = normalizeYahooTime(quote.regularMarketTime);
  return {
    symbol: finalSymbol,
    pricePerShare: quote.regularMarketPrice,
    name: quote.shortName || quote.longName || finalSymbol,
    exchange: quote.exchange || "NSE",
    tickSize: quote.dayHigh - quote.dayLow || 0.05,
    createdAt,
  };
}

// ──────────────────────────────────────────────────────────
//  BUY — two paths:
//  PATH A: sl_enabled = true  → PENDING order, NO debit, NO trade,
//                               NO position — stoploss engine handles it
//  PATH B: sl_enabled = false → execute immediately at market
// ──────────────────────────────────────────────────────────
router.post("/buy", requireAuth, async (req, res) => {
  const client = await db.connect();
  console.log("Executing buy order");

  try {
    const { uid, name: userName, email } = req.user;

    // Always MARKET — ignore order_type / limit_price from frontend
    const { symbol, quantity, sl_enabled, sl_price, product_type, category } = req.body;
    const finalProductType =
      product_type === "Intraday" ? "Intraday" : "Delivery";

    if (!symbol || !quantity || quantity <= 0) {
      return res.status(400).json({ error: "Invalid input" });
    }

    // ── Resolve / create user ──
    let userRes = await client.query(
      `SELECT id, "Mobile", telegram_chat_id, notify_email, notify_whatsapp, notify_telegram FROM users WHERE uid = $1`,
      [uid]
    );
    let userId;
    let userMobile;
    let telegramChatId;
    let notifyEmail = true;
    let notifyWhatsapp = true;
    let notifyTelegram = true;
    if (userRes.rows.length === 0) {
      await client.query("BEGIN");
      try {
        const ins = await client.query(
          `INSERT INTO users (uid, name, email) VALUES ($1, $2, $3) RETURNING id, "Mobile"`,
          [uid, userName || "Trader", email]
        );
        userId = ins.rows[0].id;
        userMobile = ins.rows[0].Mobile;
        await client.query(
          `INSERT INTO wallet_accounts (user_id, available_balance, account_type) VALUES ($1, 0, 'LIVE')`,
          [userId]
        );
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    } else {
      userId = userRes.rows[0].id;
      userMobile = userRes.rows[0].Mobile;
      telegramChatId = userRes.rows[0].telegram_chat_id;
      notifyEmail = userRes.rows[0].notify_email;
      notifyWhatsapp = userRes.rows[0].notify_whatsapp;
      notifyTelegram = userRes.rows[0].notify_telegram;
    }

    // ── Resolve / create stock ──
    const { symbol: finalSymbol, pricePerShare, name, exchange, tickSize } =
      await getCurrentPrice(symbol);
    if (!pricePerShare)
      return res.status(400).json({ error: "Price unavailable" });

    await client.query("BEGIN");

    let stockRes = await client.query(
      `SELECT id FROM stocks WHERE symbol = $1`,
      [finalSymbol]
    );
    let stockId;
    if (stockRes.rows.length === 0) {
      const ins = await client.query(
        `INSERT INTO stocks (symbol, stock_name, exchange, tick_size, lot_size)
         VALUES ($1, $2, $3, $4, 1) RETURNING id`,
        [finalSymbol, name, exchange, tickSize]
      );
      stockId = ins.rows[0].id;
    } else {
      stockId = stockRes.rows[0].id;
    }

    // ══════════════════════════════════════════════════════
    //  PATH A: STOPLOSS BUY
    // ══════════════════════════════════════════════════════
    if (sl_enabled && sl_price) {
      const orderRes = await client.query(
        `INSERT INTO orders
         (user_id, stock_id, side, order_type, quantity, price,
          stop_trigger_price, status, created_at, sell_type, category)
         VALUES ($1, $2, 'BUY', 'MARKET', $3, NULL, $4, 'PENDING',
                 NOW() AT TIME ZONE 'Asia/Kolkata', $5, 'STOPLOSS')
         RETURNING id`,
        [userId, stockId, quantity, sl_price, finalProductType]
      );
      const orderId = orderRes.rows[0].id;

      await client.query("COMMIT");

      await redis.publish(
        "NEW_STOPLOSS",
        JSON.stringify({
          orderId,
          userId,
          stockId,
          symbol: finalSymbol,
          stopLoss: sl_price,
          quantity,
          side: "BUY",
          product_type: finalProductType,
        })
      );

      return res.json({
        status: "PENDING",
        side: "BUY",
        order_type: "MARKET",
        product_type: finalProductType,
        sl_pending: true,
        sl_price,
        symbol: finalSymbol,
        quantity,
        message: "Stoploss buy order registered — will execute when trigger price is hit",
      });
    }

    // ══════════════════════════════════════════════════════
    //  PATH B: REGULAR MARKET BUY (Produced to Kafka)
    // ══════════════════════════════════════════════════════
    const totalPrice = pricePerShare * quantity;

    const walletRes = await client.query(
      `SELECT available_balance FROM wallet_accounts WHERE user_id = $1 AND (account_type = 'LIVE' OR account_type IS NULL) FOR UPDATE`,
      [userId]
    );
    const balance = Number(walletRes.rows[0]?.available_balance ?? 0);
    if (balance < totalPrice) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const orderRes = await client.query(
      `INSERT INTO orders
       (user_id, stock_id, side, order_type, quantity, price,
        status, created_at, updated_at, sell_type, category)
       VALUES ($1, $2, 'BUY', 'MARKET', $3, $4, 'PENDING',
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
        symbol: finalSymbol,
        side: "BUY",
        quantity,
        productType: finalProductType,
        category: category || "REGULAR",
        executionPrice: pricePerShare,
      });
    } catch (kafkaErr) {
      console.error(`[BuyRoute] ❌ Failed to publish BUY #${orderId} to Kafka queue:`, kafkaErr.message);
      await db.query(`UPDATE orders SET status = 'FAILED', updated_at = NOW() AT TIME ZONE 'Asia/Kolkata' WHERE id = $1`, [orderId]);
      return res.status(500).json({ error: "Failed to queue order to execution pipeline" });
    }

    res.json({
      status: "PENDING",
      orderId,
      side: "BUY",
      order_type: "MARKET",
      product_type: finalProductType,
      sl_pending: false,
      symbol: finalSymbol,
      quantity,
      buyPricePerShare: pricePerShare,
      totalPrice,
      walletBalance: balance - totalPrice,
      message: "Order placed and queued for execution via Kafka",
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("BUY ERROR:", err);
    res.status(500).json({ error: "Buy failed" });
  } finally {
    client.release();
  }
});

export default router;
