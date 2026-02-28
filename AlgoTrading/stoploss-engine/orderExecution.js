import YahooFinance from "yahoo-finance2";
import redis from "../cache/redisClient.js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const { default: db } = await import("../db/sql.js");

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

async function getCurrentPrice(symbol) {
  const sym = symbol.endsWith(".NS") ? symbol : `${symbol}.NS`;
  const quote = await yahoo.quote(sym);
  return {
    symbol: sym,
    pricePerShare: quote.regularMarketPrice,
  };
}

// ──────────────────────────────────────────────────────────
//  SELL execution — called by engine on SELL SL trigger
//  orderId = the PENDING orders row created by sellStock.js
// ──────────────────────────────────────────────────────────
export async function executeSell({ orderId, userId, stockId, symbol, quantity, product_type }, executionPrice) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    // FIFO lock open positions
    const posRes = await client.query(
      `SELECT id, remaining_quantity, entry_price
       FROM positions
       WHERE user_id = $1 AND stock_id = $2 AND status = 'OPEN' AND sell_type = $3
       ORDER BY created_at ASC
       FOR UPDATE`,
      [userId, stockId, product_type]
    );

    let available = 0;
    posRes.rows.forEach((r) => (available += Number(r.remaining_quantity)));

    if (available < quantity) {
      await client.query("ROLLBACK");
      console.warn(`[SL Engine] ⚠️  SELL #${orderId}: only ${available} of ${quantity} available. Cancelling.`);
      await client.query(
        `UPDATE orders SET status='CANCELLED', updated_at=NOW() AT TIME ZONE 'Asia/Kolkata' WHERE id=$1`,
        [orderId]
      );
      await client.query("COMMIT");
      return { error: "Not enough shares" };
    }

    // FIFO close
    let qtyToSell = quantity;
    let totalRealizedPnL = 0;

    for (const pos of posRes.rows) {
      if (qtyToSell <= 0) break;
      const posQty = Number(pos.remaining_quantity);
      const consume = Math.min(posQty, qtyToSell);
      const pnl = (executionPrice - Number(pos.entry_price)) * consume;
      totalRealizedPnL += pnl;
      const newRem = posQty - consume;

      await client.query(
        `UPDATE positions SET remaining_quantity=$1, status=$2,
         updated_at=NOW() AT TIME ZONE 'Asia/Kolkata' WHERE id=$3`,
        [newRem, newRem === 0 ? "CLOSED" : "OPEN", pos.id]
      );
      qtyToSell -= consume;
    }

    const sellValue = executionPrice * quantity;

    // Credit wallet
    const walletRes = await client.query(
      `UPDATE wallet_accounts SET available_balance = available_balance + $1
       WHERE user_id = $2 RETURNING available_balance`,
      [sellValue, userId]
    );
    const newBalance = walletRes.rows[0].available_balance;

    // Insert trade linked to the PENDING order row
    const tradeRes = await client.query(
      `INSERT INTO trades (order_id, user_id, stock_id, side, quantity, price, realized_pnl, created_at)
       VALUES ($1, $2, $3, 'SELL', $4, $5, $6, NOW() AT TIME ZONE 'Asia/Kolkata')
       RETURNING id`,
      [orderId, userId, stockId, quantity, executionPrice, totalRealizedPnL]
    );
    const tradeId = tradeRes.rows[0].id;

    // Ledger credit
    await client.query(
      `INSERT INTO wallet_transactions
       (user_id, reference_type, reference_id, transaction_type, amount, balance_after, created_at)
       VALUES ($1, 'TRADE', $2, 'SELL', $3, $4, NOW() AT TIME ZONE 'Asia/Kolkata')`,
      [userId, tradeId, sellValue, newBalance]
    );

    // Mark PENDING order as EXECUTED
    await client.query(
      `UPDATE orders SET status='EXECUTED', price=$1,
       executed_at=NOW() AT TIME ZONE 'Asia/Kolkata',
       updated_at=NOW() AT TIME ZONE 'Asia/Kolkata',
       category='STOPLOSS'
       WHERE id=$2`,
      [executionPrice, orderId]
    );

    await client.query("COMMIT");

    // Invalidate wallet cache
    const uidRes = await db.query(`SELECT uid FROM users WHERE id=$1`, [userId]);
    if (uidRes.rows[0]) await redis.del(`wallet:balance:${uidRes.rows[0].uid}`);

    console.log(`[SL Engine] ✅ SELL #${orderId} EXECUTED | ${symbol} | qty ${quantity} @ ₹${executionPrice} | PnL ₹${totalRealizedPnL.toFixed(2)}`);

    return {
      status: "EXECUTED",
      side: "SELL",
      symbol,
      quantity,
      sellPricePerShare: executionPrice,
      totalValue: sellValue,
      walletBalance: newBalance,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`[SL Engine] ❌ SELL #${orderId} failed:`, err.message);
    return { error: "Sell failed" };
  } finally {
    client.release();
  }
}

// ──────────────────────────────────────────────────────────
//  BUY execution — called by engine on BUY SL trigger
//  orderId = the PENDING orders row created by buyStock.js
// ──────────────────────────────────────────────────────────
export async function executeBuy({ orderId, userId, stockId, symbol, quantity, product_type }, executionPrice) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const totalPrice = executionPrice * quantity;

    // Check wallet balance
    const walletRes = await client.query(
      `SELECT available_balance FROM wallet_accounts WHERE user_id=$1 FOR UPDATE`,
      [userId]
    );
    const balance = Number(walletRes.rows[0]?.available_balance ?? 0);

    if (balance < totalPrice) {
      await client.query("ROLLBACK");
      console.warn(`[SL Engine] ⚠️  BUY #${orderId}: insufficient balance ₹${balance} < ₹${totalPrice}. Cancelling.`);
      await client.query(
        `UPDATE orders SET status='CANCELLED', updated_at=NOW() AT TIME ZONE 'Asia/Kolkata' WHERE id=$1`,
        [orderId]
      );
      await client.query("COMMIT");
      return { error: "Insufficient balance" };
    }

    // Debit wallet
    const newBalance = balance - totalPrice;
    await client.query(
      `UPDATE wallet_accounts SET available_balance=$1,
       updated_at=NOW() AT TIME ZONE 'Asia/Kolkata' WHERE user_id=$2`,
      [newBalance, userId]
    );

    // Insert trade linked to the PENDING order row
    const tradeRes = await client.query(
      `INSERT INTO trades (order_id, user_id, stock_id, side, quantity, price, created_at)
       VALUES ($1, $2, $3, 'BUY', $4, $5, NOW() AT TIME ZONE 'Asia/Kolkata')
       RETURNING id`,
      [orderId, userId, stockId, quantity, executionPrice]
    );
    const tradeId = tradeRes.rows[0].id;

    // Ledger debit
    await client.query(
      `INSERT INTO wallet_transactions
       (user_id, reference_type, reference_id, transaction_type, amount, balance_after, created_at)
       VALUES ($1, 'TRADE', $2, 'BUY', $3, $4, NOW() AT TIME ZONE 'Asia/Kolkata')`,
      [userId, tradeId, totalPrice, newBalance]
    );

    // Open a new FIFO position
    await client.query(
      `INSERT INTO positions
       (user_id, stock_id, position_type, entry_price, total_quantity,
        remaining_quantity, stop_loss, status, stoploss_enabled, sell_type, created_at)
       VALUES ($1, $2, 'LONG', $3, $4, $5, NULL, 'OPEN', false, $6,
               NOW() AT TIME ZONE 'Asia/Kolkata')`,
      [userId, stockId, executionPrice, quantity, quantity, product_type]
    );

    // Mark PENDING order as EXECUTED
    await client.query(
      `UPDATE orders SET status='EXECUTED', price=$1,
       executed_at=NOW() AT TIME ZONE 'Asia/Kolkata',
       updated_at=NOW() AT TIME ZONE 'Asia/Kolkata',
       category='STOPLOSS'
       WHERE id=$2`,
      [executionPrice, orderId]
    );

    await client.query("COMMIT");

    // Invalidate wallet cache
    const uidRes = await db.query(`SELECT uid FROM users WHERE id=$1`, [userId]);
    if (uidRes.rows[0]) await redis.del(`wallet:balance:${uidRes.rows[0].uid}`);

    console.log(`[SL Engine] ✅ BUY #${orderId} EXECUTED | ${symbol} | qty ${quantity} @ ₹${executionPrice}`);

    return {
      status: "EXECUTED",
      side: "BUY",
      symbol,
      quantity,
      buyPricePerShare: executionPrice,
      totalPrice,
      walletBalance: newBalance,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`[SL Engine] ❌ BUY #${orderId} failed:`, err.message);
    return { error: "Buy failed" };
  } finally {
    client.release();
  }
}

export { getCurrentPrice };
