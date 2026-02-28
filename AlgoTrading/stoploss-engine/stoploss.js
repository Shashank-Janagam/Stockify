import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import { createClient } from "redis";
import { monitorPrice } from "./priceMonitor.js";
import { executeSell, executeBuy } from "./orderExecution.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const { default: db } = await import("../db/sql.js");

// ─────────────────────────────────────────────────────────
//  Redis
// ─────────────────────────────────────────────────────────
const subscriber = createClient({ url: process.env.REDIS_URL });
const publisher  = createClient({ url: process.env.REDIS_URL });

subscriber.on("error", (err) => console.error("[SL Engine] Subscriber error:", err));
publisher.on("error",  (err) => console.error("[SL Engine] Publisher error:", err));

await subscriber.connect();
await publisher.connect();
console.log("[SL Engine] ✅ Connected to Redis");

// ─────────────────────────────────────────────────────────
//  In-memory watch store
//  Map<symbol, Map<Number(orderId), descriptor>>
// ─────────────────────────────────────────────────────────
const activeOrders = new Map(); // symbol → Map<orderId, descriptor>

function registerOrder(descriptor) {
  const sym = descriptor.symbol.endsWith(".NS")
    ? descriptor.symbol
    : `${descriptor.symbol}.NS`;

  descriptor.symbol = sym;
  const targetId = Number(descriptor.orderId);

  if (!activeOrders.has(sym)) activeOrders.set(sym, new Map());
  const map = activeOrders.get(sym);

  if (map.has(targetId)) {
    console.log(`[SL Engine] Already tracking order #${targetId}`);
    return;
  }

  map.set(targetId, { ...descriptor, orderId: targetId });
  console.log(
    `[SL Engine] 📋 Registered ${descriptor.side} #${targetId}` +
    ` | ${sym} | trigger ₹${descriptor.stopLoss} | qty ${descriptor.quantity}`
  );
}

// ─────────────────────────────────────────────────────────
//  Load PENDING orders from DB
// ─────────────────────────────────────────────────────────
async function loadPendingOrders() {
  console.log("[SL Engine] 🔄 Loading PENDING orders from DB...");
  try {
    const result = await db.query(
      `SELECT o.id        AS order_id,
              o.user_id,
              o.stock_id,
              o.side,
              o.quantity,
              o.stop_trigger_price,
              o.sell_type AS product_type,
              s.symbol
       FROM orders o
       JOIN stocks s ON o.stock_id = s.id
       WHERE o.status = 'PENDING'`
    );

    console.log(`[SL Engine] Found ${result.rows.length} PENDING order(s)`);

    for (const row of result.rows) {
      registerOrder({
        orderId:      row.order_id,
        userId:       row.user_id,
        stockId:      row.stock_id,
        symbol:       row.symbol,
        stopLoss:     Number(row.stop_trigger_price),
        quantity:     Number(row.quantity),
        side:         row.side,
        product_type: row.product_type,
      });
    }
  } catch (err) {
    console.error("[SL Engine] Failed to load pending orders:", err.message);
  }
}

// ─────────────────────────────────────────────────────────
//  Execute a triggered order
// ─────────────────────────────────────────────────────────
async function executeTrigger(descriptor, currentPrice) {
  const { orderId, symbol, side } = descriptor;

  console.log(
    `[SL Engine] 🔔 TRIGGER: ${side} #${orderId} | ${symbol}` +
    ` | current ₹${currentPrice} | trigger ₹${descriptor.stopLoss}`
  );

  let result;
  if (side === "SELL") {
    result = await executeSell(descriptor, currentPrice);
  } else if (side === "BUY") {
    result = await executeBuy(descriptor, currentPrice);
  }

  if (result && !result.error) {
    await publisher.publish(
      "STOPLOSS_TRIGGERED",
      JSON.stringify({
        orderId, side, symbol, price: currentPrice, status: "EXECUTED",
      })
    );
  } else {
    console.error(`[SL Engine] ❌ Execution failed for #${orderId}:`, result?.error || "Unknown error");
  }
}

// ─────────────────────────────────────────────────────────
//  Price polling loop
// ─────────────────────────────────────────────────────────
async function checkPrices() {
  if (activeOrders.size === 0) return;
  const symbols = [...activeOrders.keys()];
  const prices  = await monitorPrice(symbols);

  for (const sym of symbols) {
    const currentPrice = prices[sym];
    if (!currentPrice) continue;
    const orderMap = activeOrders.get(sym);
    if (!orderMap) continue;

    for (const [orderId, descriptor] of orderMap) {
      const { stopLoss, side } = descriptor;
      const triggered = side === "SELL" ? currentPrice <= stopLoss : currentPrice >= stopLoss;

      if (triggered) {
        orderMap.delete(orderId);
        if (orderMap.size === 0) activeOrders.delete(sym);
        executeTrigger(descriptor, currentPrice).catch(err => console.error(err));
      }
    }
  }
}

// ─────────────────────────────────────────────────────────
//  Subscriptions
// ─────────────────────────────────────────────────────────
await subscriber.subscribe("NEW_STOPLOSS", (message) => {
  try {
    const data = JSON.parse(message);
    registerOrder({
      orderId: data.orderId,
      userId: data.userId,
      stockId: data.stockId,
      symbol: data.symbol,
      stopLoss: Number(data.stopLoss),
      quantity: Number(data.quantity),
      side: data.side,
      product_type: data.product_type,
    });
  } catch (err) {
    console.error("[SL Engine] NEW_STOPLOSS Error:", err.message);
  }
});

// ── UPDATE_STOPLOSS: trigger price OR quantity changes ──
await subscriber.subscribe("UPDATE_STOPLOSS", (message) => {
  try {
    const data = JSON.parse(message);
    const targetId = Number(data.orderId);
    
    // Check both possible property names for trigger price and quantity
    const newPrice = Number(data.stop_trigger_price ?? data.stopLoss);
    const newQty = data.newQuantity != null ? Number(data.newQuantity) : null;

    let found = false;
    for (const [, orderMap] of activeOrders) {
      if (orderMap.has(targetId)) {
        const descriptor = orderMap.get(targetId);
        if (!isNaN(newPrice)) descriptor.stopLoss = newPrice;
        if (newQty !== null) descriptor.quantity = newQty;
        
        orderMap.set(targetId, descriptor);
        console.log(`[SL Engine] ✏️  Updated #${targetId}: trigger ₹${descriptor.stopLoss}, qty ${descriptor.quantity}`);
        found = true;
        break;
      }
    }
    if (!found) console.warn(`[SL Engine] UPDATE_STOPLOSS: order #${targetId} not in watch map`);
  } catch (err) {
    console.error("[SL Engine] UPDATE_STOPLOSS Error:", err.message);
  }
});

await subscriber.subscribe("CANCEL_STOPLOSS", (message) => {
  try {
    const { orderId } = JSON.parse(message);
    const targetId = Number(orderId);
    let found = false;
    for (const [sym, orderMap] of activeOrders) {
      if (orderMap.has(targetId)) {
        orderMap.delete(targetId);
        if (orderMap.size === 0) activeOrders.delete(sym);
        console.log(`[SL Engine] 🗑  Removed order #${targetId} from watch map`);
        found = true;
        break;
      }
    }
    if (!found) console.log(`[SL Engine] CANCEL_STOPLOSS: order #${targetId} not found`);
  } catch (err) {
    console.error("[SL Engine] CANCEL_STOPLOSS Error:", err.message);
  }
});

await loadPendingOrders();
setInterval(async () => {
  try { await checkPrices(); } catch (err) {}
}, 5000);

console.log("[SL Engine] 🚀 Running — polling every 5s");
