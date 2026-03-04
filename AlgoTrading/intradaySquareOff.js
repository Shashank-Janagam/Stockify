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
          const uidRes = await db.query(
            `SELECT uid FROM users WHERE id = $1`,
            [userId]
          );
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

/* ════════════════════════════════════════════════════════
   SCHEDULER  —  fires at 15:15 IST every Mon–Fri
   node-cron interprets the expression in Asia/Kolkata
════════════════════════════════════════════════════════ */
cron.schedule('15 15 * * 1-5', () => {
    console.log("\n"); // newline so countdown doesn't overwrite the log
    performAutoSquareOff();
}, {
    timezone: "Asia/Kolkata"
});

// Show current IST time on startup
const startIST = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, day: "2-digit", month: "short", year: "numeric"
});
console.log(`[Auto Square-Off] 🚀 Started at: ${startIST} IST`);
console.log(`[Auto Square-Off] ⏰  Next trigger: 15:15 IST (Mon–Fri)`);

// Keep process alive so cron can fire
process.stdin.resume();

/* ════════════════════════════════════════════════════════
   LIVE COUNTDOWN  —  ticks every second on the same line
   Uses IST calendar date to find next 15:15 IST moment
════════════════════════════════════════════════════════ */
function getNextTriggerMs() {
    const now = new Date();

    // Get current date in IST (UTC+5:30 = +330 min)
    const istNow = new Date(now.getTime() + 330 * 60 * 1000);

    // Build "today 09:45:00 UTC" which equals "today 15:15:00 IST"
    const trigger = new Date(Date.UTC(
        istNow.getUTCFullYear(),
        istNow.getUTCMonth(),
        istNow.getUTCDate(),
        9, 45, 0   // 09:45 UTC ≡ 15:15 IST
    ));

    // If already past → roll to next calendar day
    if (now >= trigger) trigger.setUTCDate(trigger.getUTCDate() + 1);

    return trigger - now; // ms remaining
}

function printCountdown() {
    const ms  = getNextTriggerMs();
    const hh  = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
    const mm  = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0");
    const ss  = String(Math.floor((ms % 60_000) / 1_000)).padStart(2, "0");
    process.stdout.write(`\r⏳  Next auto square-off (15:15 IST) in: ${hh}h ${mm}m ${ss}s   `);
}

printCountdown();                          // show immediately
setInterval(printCountdown, 1_000);        // update every second
