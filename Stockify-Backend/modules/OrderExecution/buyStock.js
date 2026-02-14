import express from "express";
import { db } from "../../db/sql.js";
import { v4 as uuid } from "uuid";
import requireAuth from "../../Middleware/requireAuth.js";
import YahooFinance from "yahoo-finance2";
import redis from "../../cache/redisClient.js";

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
  const quote = await yahoo.quote(finalSymbol);
  const createdAt = normalizeYahooTime(quote.regularMarketTime);

  return {
    symbol: finalSymbol,
    pricePerShare: quote.regularMarketPrice,
    name: quote.shortName || quote.longName || finalSymbol,
    exchange: quote.exchange || 'NSE',
    tickSize: quote.dayHigh - quote.dayLow || 0.05,
    createdAt
  };
}

router.post("/buy", requireAuth, async (req, res) => {
  const client = await db.connect();

  try {
    const { uid, name: userName, email } = req.user; // Firebase Middleware
    const { symbol, quantity, sl_enabled, sl_price } = req.body;

    if (!symbol || !quantity || quantity <= 0) {
      return res.status(400).json({ error: "Invalid input" });
    }

    // 1️⃣ Resolve User (Int)
    let userRes = await client.query(`SELECT id FROM users WHERE uid = $1`, [uid]);
    let userId;
    if (userRes.rows.length === 0) {
        // Create User
        await client.query("BEGIN"); // Wrap creation
        try {
            const insert = await client.query(
                `INSERT INTO users (uid, name, email) VALUES ($1, $2, $3) RETURNING id`,
                [uid, userName || 'Trader', email]
            );
            userId = insert.rows[0].id;
            await client.query(`INSERT INTO wallet_accounts (user_id, available_balance) VALUES ($1, 0)`, [userId]);
            await client.query("COMMIT");
        } catch(e) {
            await client.query("ROLLBACK");
            throw e;
        }
    } else {
        userId = userRes.rows[0].id;
    }

    // 2️⃣ Live Price & Stock Exists
    const { symbol: finalSymbol, pricePerShare, name, exchange, tickSize } = await getCurrentPrice(symbol);
    if (!pricePerShare) return res.status(400).json({ error: "Price unavailable" });

    const totalPrice = pricePerShare * quantity;

    await client.query("BEGIN");

    // Resolve Stock ID
    let stockRes = await client.query(`SELECT id FROM stocks WHERE symbol = $1`, [finalSymbol]);
    let stockId;
    if (stockRes.rows.length === 0) {
        const insertStock = await client.query(
            `INSERT INTO stocks (symbol, stock_name, exchange, tick_size, lot_size) VALUES ($1, $2, $3, $4, 1) RETURNING id`,
            [finalSymbol, name, exchange, tickSize]
        );
        stockId = insertStock.rows[0].id;
    } else {
        stockId = stockRes.rows[0].id;
    }

    // 3️⃣ Balance Check
    const walletRes = await client.query(
        `SELECT available_balance FROM wallet_accounts WHERE user_id = $1 FOR UPDATE`,
        [userId]
    );
    const balance = Number(walletRes.rows[0]?.available_balance ?? 0);

    if (balance < totalPrice) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Insufficient balance" });
    }

    // 4️⃣ Execute Transaction
    const newBalance = balance - totalPrice;
    await client.query(
        `UPDATE wallet_accounts SET available_balance = $1, updated_at = NOW() AT TIME ZONE 'Asia/Kolkata' WHERE user_id = $2`,
        [newBalance, userId]
    );

    // 5️⃣ Insert Order
    const orderRes = await client.query(
        `INSERT INTO orders 
         (user_id, stock_id, side, order_type, quantity, price, stop_trigger_price, status, executed_at, created_at)
         VALUES ($1, $2, 'BUY', 'MARKET', $3, $4, $5, 'EXECUTED', NOW() AT TIME ZONE 'Asia/Kolkata', NOW() AT TIME ZONE 'Asia/Kolkata')
         RETURNING id`,
        [userId, stockId, quantity, pricePerShare, sl_enabled ? sl_price : null]
    );
    const orderId = orderRes.rows[0].id;

    // 6️⃣ Insert Trade
    const tradeRes = await client.query(
        `INSERT INTO trades
         (order_id, user_id, stock_id, side, quantity, price)
         VALUES ($1, $2, $3, 'BUY', $4, $5)
         RETURNING id`,
        [orderId, userId, stockId, quantity, pricePerShare]
    );
    const tradeId = tradeRes.rows[0].id;

    // Ledger (DEBIT) - Moved after Trade
    // Ledger (DEBIT) - Moved after Trade
    await client.query(
        `INSERT INTO wallet_transactions 
         (user_id, reference_type, reference_id, transaction_type, amount, balance_after, created_at)
         VALUES ($1, 'TRADE', $2, 'BUY', $3, $4, NOW() AT TIME ZONE 'Asia/Kolkata')`,
        [userId, tradeId, totalPrice, newBalance]
    );

    
    // 7️⃣ Create Position (FIFO Open Lot)
    await client.query(
        `INSERT INTO positions
         (user_id, stock_id, position_type, entry_price, total_quantity, remaining_quantity, stop_loss, status)
         VALUES ($1, $2, 'LONG', $3, $4, $5, $6, 'OPEN')`,
        [userId, stockId, pricePerShare, quantity, quantity, sl_enabled ? sl_price : null]
    );

    await client.query("COMMIT");
    await redis.del(`wallet:balance:${uid}`); // using uid as cache key

    res.json({
        status: "EXECUTED",
        side: "BUY",
        symbol: finalSymbol,
        quantity,
        buyPricePerShare: pricePerShare,
        totalPrice,
        walletBalance: newBalance
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("BUY ERROR:", err);
    res.status(500).json({ error: "Buy failed" });
  } finally {
    client.release();
  }
});

export default router;
