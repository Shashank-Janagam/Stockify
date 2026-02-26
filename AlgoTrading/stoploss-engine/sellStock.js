import YahooFinance from "yahoo-finance2";
import redis from "../cache/redisClient.js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

// DB import
const { default: db } = await import("../db/sql.js");
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

async function sellStock(userId, stockId, quantity,symbol,positionId) {
    const client = await db.connect();
  try {

    if (!quantity || quantity <= 0) return { error: "Invalid qty" };

    // 1️⃣ Resolve IDs

    const stockRes = await client.query(`SELECT id FROM stocks WHERE symbol=$1`, [symbol]);
    if (stockRes.rows.length === 0) return { error: "Stock not found" };
    console.log("stock id",stockRes.rows[0].id)
    await client.query("BEGIN");

    // 2️⃣ Check Available Quantity (FIFO LOCK)
    const posRes = await client.query(
        `SELECT id, remaining_quantity, entry_price 
         FROM positions 
         WHERE user_id = $1 AND stock_id = $2 AND status = 'OPEN' 
         AND id = $3
         FOR UPDATE`,
        [userId, stockId,positionId]
    );
    if (posRes.rows.length === 0) {
        await client.query("ROLLBACK");
        console.log("no rowss")
        return { error: "Position not found" };
    }

    const available=posRes.rows[0].remaining_quantity;

    if (available < quantity) {
        await client.query("ROLLBACK");
        return { error: "Not enough shares" };
    }

    // 3️⃣ Live Price
    const { pricePerShare } = await getCurrentPrice(symbol);
    if (!pricePerShare) {
        await client.query("ROLLBACK");
        return { error: "Price Unavailable" };
    }
    const sellValue = pricePerShare * quantity;

    // 4️⃣ FIFO Consumption & PnL
    let qtyToSell = quantity;
    let totalRealizedPnL = 0;

    
    if (qtyToSell <= 0)     return { error: "Not enough shares" };

    const posQty = Number(posRes.rows[0].remaining_quantity);
    const consume = Math.min(posQty, qtyToSell);
    const pnl = (pricePerShare - Number(posRes.rows[0].entry_price)) * consume;
    totalRealizedPnL += pnl;

        const newRem = posQty - consume;
        const newStatus = newRem === 0 ? 'CLOSED' : 'OPEN';

        await client.query(
            `UPDATE positions SET remaining_quantity = $1, status = $2, updated_at = NOW() AT TIME ZONE 'Asia/Kolkata' WHERE id = $3`,
            [newRem, newStatus, posRes.rows[0].id]
        );

        qtyToSell -= consume;
    

    // 5️⃣ Update Wallet (Credit)
    const walletRes = await client.query(
        `UPDATE wallet_accounts SET available_balance = available_balance + $1 WHERE user_id = $2 RETURNING available_balance`,
        [sellValue, userId]
    );
    const newBalance = walletRes.rows[0].available_balance;

    // 6️⃣ Insert Order
    const orderRes = await client.query(
        `INSERT INTO orders (user_id, stock_id, side, order_type, quantity, price, created_at, executed_at, status,sell_type)
         VALUES ($1, $2, 'SELL', 'MARKET', $3, $4, NOW() AT TIME ZONE 'Asia/Kolkata', NOW() AT TIME ZONE 'Asia/Kolkata', 'EXECUTED','STOPLOSS')
         RETURNING id`,
        [userId, stockId, quantity, pricePerShare]
    );
    console.log("updated orders---")
    const orderId = orderRes.rows[0].id;

    // 7️⃣ Insert Trade
    const tradeRes = await client.query(
        `INSERT INTO trades (order_id, user_id, stock_id, side, quantity, price, realized_pnl,created_at)
         VALUES ($1, $2, $3, 'SELL', $4, $5, $6,NOW() AT TIME ZONE 'Asia/Kolkata')
         RETURNING id`,
        [orderId, userId, stockId, quantity, pricePerShare, totalRealizedPnL]
    );
    const tradeId = tradeRes.rows[0].id;
    console.log("updated teades")

    // Ledger (SELL CREDIT) - Moved after Trade
    await client.query(
        `INSERT INTO wallet_transactions (user_id, reference_type, reference_id, transaction_type, amount, balance_after, created_at)
         VALUES ($1, 'TRADE', $2, 'SELL', $3, $4, NOW() AT TIME ZONE 'Asia/Kolkata')`,
        [userId, tradeId, sellValue, newBalance]
    );
    console.log("updated wallet")


    await client.query("COMMIT");
    const user=await client.query(`SELECT * FROM users WHERE id=$1`,[userId])
    const uid=user.rows[0].uid;
    console.log("user id:",uid)
    await redis.del(`wallet:balance:${uid}`); // Invalidate cache
    console.log("invalidated redis balance");
    return {
        status: "EXECUTED",
        side: "SELL",
        symbol: symbol,
        quantity,
        sellPricePerShare: pricePerShare,
        totalValue: sellValue,
        walletBalance: newBalance
    };

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("SELL ERROR:", err);
    return { error: "Sell failed" };
  } finally {   
    client.release();
    console.log("sold the stock by stoploss engine",symbol,quantity)
  }
}

export default sellStock
