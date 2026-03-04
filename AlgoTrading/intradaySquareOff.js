import cron from "node-cron";
import YahooFinance from "yahoo-finance2";
import redis from "./cache/redisClient.js";
import db from "./db/sql.js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "./.env") });

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

/* ──────────────────────────────────────────────────────────
   INTRADAY AUTO SQUARE-OFF LOGIC
   Runs at 3:15 PM (15:15) IST every Monday to Friday.
   1. Finds all users with open 'Intraday' positions.
   2. Fetches live prices for those stocks.
   3. Sells all at market price (FIFO).
   4. Credits user wallets.
   5. Cancels associated pending stop-loss orders.
   6. Notifies stop-loss engine.
────────────────────────────────────────────────────────── */

export async function performAutoSquareOff() {
  console.log(`[Auto Square-Off] 🕒 Starting square-off process at ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`);

  try {
    // 1. Find all user-stock pairs with open Intraday positions
    const openPosRes = await db.query(
      `SELECT DISTINCT p.user_id, s.symbol, s.id as stock_id
       FROM positions p
       JOIN stocks s ON p.stock_id = s.id
       WHERE p.status = 'OPEN' 
         AND p.remaining_quantity > 0 
         AND p.sell_type = 'Intraday'`
    );

    if (openPosRes.rows.length === 0) {
      console.log("[Auto Square-Off] ✅ No intraday positions to square off today.");
      return;
    }

    console.log(`[Auto Square-Off] Found intraday positions across ${openPosRes.rows.length} user-stock pairs.`);

    // Group by user
    const userGroups = {};
    openPosRes.rows.forEach(r => {
      if (!userGroups[r.user_id]) userGroups[r.user_id] = [];
      userGroups[r.user_id].push(r);
    });

    for (const userId in userGroups) {
      console.log(`[Auto Square-Off] Processing User ID: ${userId}`);

      for (const group of userGroups[userId]) {
        const { symbol, stock_id } = group;

        // A. Get live price
        let pricePerShare = 0;
        try {
          const symStr = symbol.endsWith(".NS") ? symbol : `${symbol}.NS`;
          const quote = await yahoo.quote(symStr);
          pricePerShare = quote.regularMarketPrice;
        } catch (err) {
          console.error(`[Auto Square-Off] ❌ Failed to fetch price for ${symbol}:`, err.message);
          continue;
        }

        // B. Execute Square-off
        const client = await db.connect();
        try {
          await client.query("BEGIN");

          const posRes = await client.query(
            `SELECT id, remaining_quantity, entry_price
             FROM positions
             WHERE user_id = $1 AND stock_id = $2 AND status = 'OPEN' AND sell_type = 'Intraday'
             ORDER BY created_at ASC
             FOR UPDATE`,
            [userId, stock_id]
          );

          let totalQty = 0;
          let totalPnL = 0;
          
          for (const pos of posRes.rows) {
            const qty = Number(pos.remaining_quantity);
            totalQty += qty;
            const pnl = (pricePerShare - Number(pos.entry_price)) * qty;
            totalPnL += pnl;

            await client.query(
              `UPDATE positions 
               SET remaining_quantity = 0, status = 'CLOSED', updated_at = NOW() AT TIME ZONE 'Asia/Kolkata' 
               WHERE id = $1`,
              [pos.id]
            );
          }

          if (totalQty === 0) {
            await client.query("ROLLBACK");
            continue;
          }

          const sellValue = pricePerShare * totalQty;

          // 2. Credit wallet
          const walletRes = await client.query(
            `UPDATE wallet_accounts 
             SET available_balance = available_balance + $1 
             WHERE user_id = $2 
             RETURNING available_balance`,
            [sellValue, userId]
          );
          const newBalance = walletRes.rows[0].available_balance;

          // 3. Create historical order record
          const orderRes = await client.query(
            `INSERT INTO orders 
             (user_id, stock_id, side, order_type, quantity, price, status, sell_type, category, created_at, executed_at, updated_at)
             VALUES ($1, $2, 'SELL', 'MARKET', $3, $4, 'EXECUTED', 'Intraday', 'AUTO_SQUAREOFF', 
                     NOW() AT TIME ZONE 'Asia/Kolkata', NOW() AT TIME ZONE 'Asia/Kolkata', NOW() AT TIME ZONE 'Asia/Kolkata')
             RETURNING id`,
            [userId, stock_id, totalQty, pricePerShare]
          );
          const orderId = orderRes.rows[0].id;

          // 4. Trade record
          const tradeRes = await client.query(
            `INSERT INTO trades 
             (order_id, user_id, stock_id, side, quantity, price, realized_pnl, created_at)
             VALUES ($1, $2, $3, 'SELL', $4, $5, $6, NOW() AT TIME ZONE 'Asia/Kolkata')
             RETURNING id`,
            [orderId, userId, stock_id, totalQty, pricePerShare, totalPnL]
          );
          const tradeId = tradeRes.rows[0].id;

          // 5. Ledger
          await client.query(
            `INSERT INTO wallet_transactions
             (user_id, reference_type, reference_id, transaction_type, amount, balance_after, created_at)
             VALUES ($1, 'TRADE', $2, 'SELL', $3, $4, NOW() AT TIME ZONE 'Asia/Kolkata')`,
            [userId, tradeId, sellValue, newBalance]
          );

          // 6. Delete PENDING SL
          const slRes = await client.query(
            `UPDATE orders 
             SET status = 'CANCELLED', updated_at = NOW() AT TIME ZONE 'Asia/Kolkata' 
             WHERE user_id = $1 AND stock_id = $2 AND status = 'PENDING' AND sell_type = 'Intraday'
             RETURNING id`,
            [userId, stock_id]
          );

          await client.query("COMMIT");

          // Redis/Cache
          if (uidRes.rows[0]) {
            await redis.del(`wallet:balance:${uidRes.rows[0].uid}`);
            await redis.del(`ai_portfolio_v3_${userId}`);
          }

          for (const cancelled of slRes.rows) {
            await redis.publish("CANCEL_STOPLOSS", JSON.stringify({ orderId: cancelled.id }));
          }

          console.log(`[Auto Square-Off] ✅ ${symbol} | Qty: ${totalQty} @ ₹${pricePerShare} | User ID: ${userId} | PnL: ₹${totalPnL.toFixed(2)}`);

        } catch (err) {
          await client.query("ROLLBACK");
          console.error(`[Auto Square-Off] ❌ Failed ${symbol} for user ${userId}:`, err.message);
        } finally {
          client.release();
        }
      }
    }
  } catch (err) {
    console.error("[Auto Square-Off] 🚨 Critical error:", err.message);
  } finally {
    console.log(`[Auto Square-Off] 🏁 Completed.`);
  }
}

// Run every day at 15:15 IST (3:15 PM) -> '15 15 * * *'

// Uncommented below so it runs immediately when you execute `node intradaySquareOff.js`
performAutoSquareOff();
console.log("[Auto Square-Off] 🚀 Intraday Job scheduled for 15:15 IST (Mon-Fri)");
