import express from "express";
import { db } from "../../db/sql.js";
import { v4 as uuid } from "uuid";
import requireAuth from "../../Middleware/requireAuth.js";
import YahooFinance from "yahoo-finance2";
import redis from "../../cache/redisClient.js";

const router = express.Router();
function normalizeYahooTime(t) {
  // ISO string (e.g. "2024-06-10T09:15:00.000Z")
  if (typeof t === "string") {
    const d = new Date(t);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // seconds since epoch
  if (typeof t === "number" && t > 0 && t < 1e12) {
    return new Date(t * 1000).toISOString();
  }

  // milliseconds since epoch
  if (typeof t === "number" && t >= 1e12) {
    return new Date(t).toISOString();
  }

  // 🚨 FINAL GUARANTEE (never return null)
  return new Date().toISOString();
}

const yahoo = new YahooFinance({
  suppressNotices: ["yahooSurvey"]
});
async function getCurrentPrice(symbol) {
  const finalSymbol = symbol.endsWith(".NS")
    ? symbol
    : `${symbol}.NS`;

  const quote = await yahoo.quote(finalSymbol);

const createdAt = normalizeYahooTime(quote.regularMarketTime);

  

  return {
    symbol: finalSymbol,
    pricePerShare: quote.regularMarketPrice,
    name: quote.shortName || quote.longName || finalSymbol,
    createdAt
  };
}


router.post("/buy", requireAuth, async (req, res) => {
  const client = await db.connect();

  try {
    const firebaseUid = req.user.uid;
    const { symbol, quantity } = req.body;

    if (!symbol || !Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ error: "Invalid input" });
    }

    /* =========================
       1️⃣ LIVE PRICE
    ========================= */
    const {
      symbol: finalSymbol,
      pricePerShare,
      name,
      createdAt
    } = await getCurrentPrice(symbol);

    if (!pricePerShare) {
      return res.status(400).json({ error: "Price unavailable" });
    }

    const totalPrice = pricePerShare * quantity;

    await client.query("BEGIN");

    /* =========================
       2️⃣ LOCK WALLET
    ========================= */
    const walletRes = await client.query(
      `
      SELECT balance
      FROM wallets
      WHERE firebase_uid = $1
      FOR UPDATE
      `,
      [firebaseUid]
    );

    const balance = Number(walletRes.rows[0]?.balance ?? 0);

    if (balance < totalPrice) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Insufficient wallet balance" });
    }

    const newBalance = balance - totalPrice;

    /* =========================
       3️⃣ UPDATE WALLET
    ========================= */
    await client.query(
      `
      UPDATE wallets
      SET balance = $1,
          updated_at = NOW()
      WHERE firebase_uid = $2
      `,
      [newBalance, firebaseUid]
    );

    /* =========================
       4️⃣ WALLET TRANSACTION
    ========================= */
    await client.query(
      `
      INSERT INTO wallet_transactions
      (
        id,
        firebase_uid,
        type,
        title,
        amount,
        balance_after
      )
      VALUES ($1, $2, 'DEBIT', $3, $4, $5)
      `,
      [
        uuid(),
        firebaseUid,
        `Bought ${name} ${quantity} shares`,
        totalPrice,
        newBalance
      ]
    );

    /* =========================
       5️⃣ ENSURE STOCK
    ========================= */
    await client.query(
      `
      INSERT INTO stocks (symbol, name, exchange)
      VALUES ($1, $2, 'NSE')
      ON CONFLICT (symbol) DO NOTHING
      `,
      [finalSymbol, name]
    );

    /* =========================
       6️⃣ INSERT BUY TRADE ✅
    ========================= */
    await client.query(
      `
      INSERT INTO user_stocks
      (
        id,
        firebase_uid,
        symbol,
        side,
        buy_price_per_share,
        quantity,
        total_price,
        status,
        source,
        created_at
      )
      VALUES ($1,$2,$3,'BUY',$4,$5,$6,'EXECUTED','MANUAL',$7)
      `,
      [
        uuid(),
        firebaseUid,
        finalSymbol,
        pricePerShare,
        quantity,
        totalPrice,
        createdAt // ✅ ISO UTC
      ]
    );

    await client.query("COMMIT");

    await redis.del(`wallet:balance:${firebaseUid}`);

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
