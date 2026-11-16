import cron from "node-cron";
import YahooFinance from "yahoo-finance2";
import redis from "./cache/redisClient.js";
import db from "./db/sql.js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import { sendOrder } from "./kafka/index.js";

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
    // 1. Query open intraday positions grouped by user and symbol
    const openPosRes = await db.query(
      `SELECT p.user_id, s.symbol, SUM(p.remaining_quantity) as total_quantity
       FROM positions p
       JOIN stocks s ON p.stock_id = s.id
       WHERE p.status = 'OPEN' 
         AND p.remaining_quantity > 0 
         AND p.sell_type = 'Intraday'
       GROUP BY p.user_id, s.symbol`
    );

    if (openPosRes.rows.length === 0) {
      console.log("[Auto Square-Off] ✅ No intraday positions to square off today.");
      return;
    }

    console.log(`[Auto Square-Off] Found intraday positions across ${openPosRes.rows.length} user-stock pairs.`);

    // 2. Delegate execution to centralized Kafka OrderExecution service
    for (const row of openPosRes.rows) {
      const { user_id, symbol, total_quantity } = row;
      const qty = Number(total_quantity);
      if (qty <= 0) continue;

      try {
        await sendOrder({
          userId: Number(user_id),
          symbol,
          side: "SELL",
          quantity: qty,
          productType: "Intraday",
          category: "AUTO_SQUAREOFF",
        });
        console.log(`[Auto Square-Off] 📤 Produced square-off SELL to Kafka: User ${user_id} | ${qty} ${symbol}`);
      } catch (err) {
        console.error(`[Auto Square-Off] ❌ Failed to produce order for User ${user_id} (${symbol}):`, err.message);
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
