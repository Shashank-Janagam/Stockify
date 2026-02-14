import express from "express";
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
    name: quote.shortName || quote.longName || finalSymbol
  };
}

// 📌 HOLDING DETAILS (AGGREGATED) for Dashboard/OrderPanel
router.get("/holding/:symbol", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const symbol = req.params.symbol.endsWith(".NS") ? req.params.symbol : `${req.params.symbol}.NS`;

    // 1️⃣ Resolve IDs
    const userRes = await db.query(`SELECT id FROM users WHERE uid=$1`, [uid]);
    if (userRes.rows.length === 0) return res.json({ totalQuantity: 0, trades: [] });
    const userId = userRes.rows[0].id;

    const stockRes = await db.query(`SELECT id FROM stocks WHERE symbol=$1`, [symbol]);
    if (stockRes.rows.length === 0) return res.json({ totalQuantity: 0, trades: [] });
    const stockId = stockRes.rows[0].id;

    // 2️⃣ Aggregate Quantity (from OPEN positions)
    const posRes = await db.query(
        `SELECT SUM(remaining_quantity) as total_qty, SUM(remaining_quantity * entry_price) as invested_val 
         FROM positions 
         WHERE user_id = $1 AND stock_id = $2 AND status = 'OPEN'`,
        [userId, stockId]
    );
    const totalQuantity = Number(posRes.rows[0]?.total_qty || 0);
    const investedVal = Number(posRes.rows[0]?.invested_val || 0);
    const avgPrice = totalQuantity > 0 ? investedVal / totalQuantity : 0;

    // 3️⃣ Trade History (Simulated from Positions for Frontend PnL)
    // Frontend OrderPanel expects 'trades' to calculate PnL.
    // We construct a synthetic "BUY" trade representing the weighted average holding.
    const syntheticTrade = {
        id: 'holding_agg',
        side: 'BUY', 
        quantity: totalQuantity,
        pricePerShare: avgPrice,
        totalPrice: Number(investedVal),
        createdAtIST: new Date().toISOString() // Timestamp doesn't matter for single aggregated lot
    };

    res.json({
        symbol,
        totalQuantity,
        trades: totalQuantity > 0 ? [syntheticTrade] : [] 
    });




  } catch (err) {
    console.error("Holding fetch error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/sell", requireAuth, async (req, res) => {
  const client = await db.connect();
  try {
    const { uid } = req.user;
    const { symbol, quantity, sl_enabled, sl_price } = req.body;

    if (!quantity || quantity <= 0) return res.status(400).json({ error: "Invalid qty" });

    // 1️⃣ Resolve IDs
    const userRes = await client.query(`SELECT id FROM users WHERE uid=$1`, [uid]);
    if (userRes.rows.length === 0) return res.status(400).json({ error: "User not found" });
    const userId = userRes.rows[0].id;

    const stockRes = await client.query(`SELECT id FROM stocks WHERE symbol=$1`, [symbol]);
    if (stockRes.rows.length === 0) return res.status(400).json({ error: "Stock not found" });
    const stockId = stockRes.rows[0].id; // Must exist if selling

    await client.query("BEGIN");

    // 2️⃣ Check Available Quantity (FIFO LOCK)
    const posRes = await client.query(
        `SELECT id, remaining_quantity, entry_price 
         FROM positions 
         WHERE user_id = $1 AND stock_id = $2 AND status = 'OPEN' 
         ORDER BY created_at ASC 
         FOR UPDATE`,
        [userId, stockId]
    );

    let available = 0;
    posRes.rows.forEach(r => available += Number(r.remaining_quantity));

    if (available < quantity) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Not enough shares" });
    }

    // 3️⃣ Live Price
    const { pricePerShare } = await getCurrentPrice(symbol);
    if (!pricePerShare) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Price Unavailable" });
    }
    const sellValue = pricePerShare * quantity;

    // 4️⃣ FIFO Consumption & PnL
    let qtyToSell = quantity;
    let totalRealizedPnL = 0;

    for (const pos of posRes.rows) {
        if (qtyToSell <= 0) break;

        const posQty = Number(pos.remaining_quantity);
        const consume = Math.min(posQty, qtyToSell);
        const pnl = (pricePerShare - Number(pos.entry_price)) * consume;
        totalRealizedPnL += pnl;

        const newRem = posQty - consume;
        const newStatus = newRem === 0 ? 'CLOSED' : 'OPEN';

        await client.query(
            `UPDATE positions SET remaining_quantity = $1, status = $2, updated_at = NOW() AT TIME ZONE 'Asia/Kolkata' WHERE id = $3`,
            [newRem, newStatus, pos.id]
        );

        qtyToSell -= consume;
    }

    // 5️⃣ Update Wallet (Credit)
    const walletRes = await client.query(
        `UPDATE wallet_accounts SET available_balance = available_balance + $1 WHERE user_id = $2 RETURNING available_balance`,
        [sellValue, userId]
    );
    const newBalance = walletRes.rows[0].available_balance;

    // 6️⃣ Insert Order
    const orderRes = await client.query(
        `INSERT INTO orders (user_id, stock_id, side, order_type, quantity, price, created_at, executed_at, status)
         VALUES ($1, $2, 'SELL', 'MARKET', $3, $4, NOW() AT TIME ZONE 'Asia/Kolkata', NOW() AT TIME ZONE 'Asia/Kolkata', 'EXECUTED')
         RETURNING id`,
        [userId, stockId, quantity, pricePerShare]
    );
    const orderId = orderRes.rows[0].id;

    // 7️⃣ Insert Trade
    const tradeRes = await client.query(
        `INSERT INTO trades (order_id, user_id, stock_id, side, quantity, price, realized_pnl)
         VALUES ($1, $2, $3, 'SELL', $4, $5, $6)
         RETURNING id`,
        [orderId, userId, stockId, quantity, pricePerShare, totalRealizedPnL]
    );
    const tradeId = tradeRes.rows[0].id;

    // Ledger (SELL CREDIT) - Moved after Trade
    await client.query(
        `INSERT INTO wallet_transactions (user_id, reference_type, reference_id, transaction_type, amount, balance_after, created_at)
         VALUES ($1, 'TRADE', $2, 'SELL', $3, $4, NOW() AT TIME ZONE 'Asia/Kolkata')`,
        [userId, tradeId, sellValue, newBalance]
    );


    await client.query("COMMIT");
    await redis.del(`wallet:balance:${uid}`); // Invalidate cache

    res.json({
        status: "EXECUTED",
        side: "SELL",
        symbol: symbol,
        quantity,
        sellPricePerShare: pricePerShare,
        totalValue: sellValue,
        walletBalance: newBalance
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
