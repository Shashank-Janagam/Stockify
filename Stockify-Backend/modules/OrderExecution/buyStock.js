import express from "express";
import { db } from "../../db/sql.js";
import { v4 as uuid } from "uuid";
import requireAuth from "../../Middleware/requireAuth.js";
import YahooFinance from "yahoo-finance2";
import redis from "../../cache/redisClient.js";

const router = express.Router();

const yahoo = new YahooFinance({
  suppressNotices: ["yahooSurvey"]
});

async function getCurrentPrice(symbol) {
  const finalSymbol = symbol.endsWith(".NS")
    ? symbol
    : `${symbol}.NS`;

  const quote = await yahoo.quote(finalSymbol);

  return {
    symbol: finalSymbol,
    pricePerShare: quote.regularMarketPrice,
    name: quote.shortName || quote.longName || finalSymbol
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
    const { symbol: finalSymbol, pricePerShare, name } =
      await getCurrentPrice(symbol);

    if (!pricePerShare) {
      return res.status(400).json({ error: "Price unavailable" });
    }

    const totalPrice = Number(pricePerShare) * quantity;

    /* =========================
       2️⃣ START TRANSACTION
    ========================= */
    await client.query("BEGIN");

    /* =========================
       3️⃣ LOCK + CHECK WALLET
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
      return res.status(400).json({
        error: "Insufficient wallet balance"
      });
    }

    const newBalance = balance - totalPrice;

    /* =========================
       4️⃣ UPDATE WALLET
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
       5️⃣ WALLET TRANSACTION (DEBIT)
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
       6️⃣ ENSURE STOCK EXISTS
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
       7️⃣ INSERT BUY TRADE
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
        source
      )
      VALUES ($1,$2,$3,'BUY',$4,$5,$6,'EXECUTED','MANUAL')
      `,
      [
        uuid(),
        firebaseUid,
        finalSymbol,
        pricePerShare,
        quantity,
        totalPrice
      ]
    );

    /* =========================
       8️⃣ COMMIT
    ========================= */
    await client.query("COMMIT");

    /* =========================
       9️⃣ REDIS INVALIDATION
    ========================= */
    await redis.del(`wallet:balance:${firebaseUid}`);

    res.json({
      status: "EXECUTED",
      side: "BUY",
      symbol: finalSymbol,
      quantity,
      buyPricePerShare: Number(pricePerShare),
      totalPrice: Number(totalPrice),
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
