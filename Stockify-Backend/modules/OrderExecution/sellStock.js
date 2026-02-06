import express from "express";
import requireAuth from "../../Middleware/requireAuth.js";
import { db } from "../../db/sql.js";
import YahooFinance from "yahoo-finance2";
import { v4 as uuid } from "uuid";
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
router.get("/holding/:symbol", requireAuth, async (req, res) => {
  try {
    const firebaseUid = req.user.uid;
    const symbol = req.params.symbol.endsWith(".NS")
      ? req.params.symbol
      : `${req.params.symbol}.NS`;

    /* =========================
       1️⃣ NET HOLDING QUANTITY
    ========================= */
    const { rows: qtyRows } = await db.query(
      `
      SELECT
        COALESCE(SUM(
          CASE
            WHEN side = 'BUY' THEN quantity
            WHEN side = 'SELL' THEN -quantity
          END
        ), 0) AS total_quantity
      FROM user_stocks
      WHERE firebase_uid = $1
        AND symbol = $2
        AND status = 'EXECUTED'
      `,
      [firebaseUid, symbol]
    );

    const totalQuantity = Number(qtyRows[0].total_quantity);

    /* =========================
       2️⃣ RAW EXECUTED TRADES
    ========================= */
    const { rows: trades } = await db.query(
      `
      SELECT
        side,
        quantity,
        buy_price_per_share,
        created_at
      FROM user_stocks
      WHERE firebase_uid = $1
        AND symbol = $2
        AND status = 'EXECUTED'
      ORDER BY created_at ASC
      `,
      [firebaseUid, symbol]
    );

    res.json({
      symbol,
      totalQuantity,
      trades
    });

  } catch (err) {
    console.error("Holding fetch error:", err);
    res.status(500).json({ error: "Failed to fetch holding" });
  }
});


router.post("/sell", requireAuth, async (req, res) => {
  const client = await db.connect();

  try {
    const firebaseUid = req.user.uid;
    const { symbol, quantity } = req.body;

    if (!symbol || !Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ error: "Invalid input" });
    }

    await client.query("BEGIN");

    /* =========================
       1️⃣ CHECK AVAILABLE QTY
    ========================= */
    const { rows } = await client.query(
      `
      SELECT
        COALESCE(SUM(
          CASE
            WHEN side = 'BUY' THEN quantity
            WHEN side = 'SELL' THEN -quantity
          END
        ), 0) AS total_quantity
      FROM user_stocks
      WHERE firebase_uid = $1
        AND symbol = $2
        AND status = 'EXECUTED'
      `,
      [firebaseUid, symbol]
    );

    const availableQty = Number(rows[0].total_quantity);

    if (quantity > availableQty) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "Not enough shares to sell"
      });
    }

    /* =========================
       2️⃣ LIVE PRICE
    ========================= */
    const {pricePerShare: sellPricePerShare,name} = await getCurrentPrice(symbol);

    if (!sellPricePerShare) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Price unavailable" });
    }

    const totalSellValue = sellPricePerShare * quantity;

    /* =========================
       3️⃣ INSERT SELL TRADE
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
      VALUES ($1,$2,$3,'SELL',$4,$5,$6,'EXECUTED','MANUAL')
      `,
      [
        uuid(),
        firebaseUid,
        symbol,
        sellPricePerShare,
        quantity,
        totalSellValue
      ]
    );

    /* =========================
       4️⃣ CREDIT WALLET
    ========================= */
    await client.query(
      `
      UPDATE wallets
      SET balance = balance + $1,
          updated_at = NOW()
      WHERE firebase_uid = $2
      `,
      [totalSellValue, firebaseUid]
    );

    /* =========================
       5️⃣ WALLET TRANSACTION
    ========================= */
    await client.query(
      `
      INSERT INTO wallet_transactions
      (id, firebase_uid, type, title, amount)
      VALUES ($1,$2,'CREDIT',$3,$4)
      `,
      [uuid(), firebaseUid,`Sold ${name} ${quantity} shares` ,totalSellValue]
    );

    await client.query("COMMIT");

    /* =========================
       6️⃣ REDIS INVALIDATION
    ========================= */
    await redis.del(`wallet:balance:${firebaseUid}`);

    res.json({
      status: "EXECUTED",
      side: "SELL",
      symbol,
      quantity,
      sellPricePerShare: Number(sellPricePerShare),
      totalValue: Number(totalSellValue.toFixed(2))
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("SELL ERROR:", err);
    res.status(500).json({ error: "Sell failed" });
  } finally {
    client.release();
  }
});


export default router;
