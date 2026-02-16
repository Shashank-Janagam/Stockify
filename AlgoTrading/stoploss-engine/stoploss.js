import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import { createClient } from "redis";
import { monitorPrice } from "./priceMonitor.js";
import sellStock from "./sellStock.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

// DB import
const { default: db } = await import("../db/sql.js");

// =============================
// Redis Setup
// =============================

console.log("redis url stoploss:",process.env.REDIS_URL)
const subscriber = createClient({
    url: process.env.REDIS_URL
});

const publisher = createClient({
    url: process.env.REDIS_URL
});

subscriber.on("error", (err) => {
    console.error("Redis error:", err);
});

await subscriber.connect();
await publisher.connect();

console.log("Connected to Redis Cloud");


// =============================
// In-Memory Store
// =============================
const activeStops = new Map();

/*
Structure:
Map {
   "RELIANCE.NS" => [
        { positionId: 1, userId: 10, stopLoss: 2450 }
   ]
}
*/

// =============================
// Load Active Stops From DB
// =============================
async function loadActiveStops() {

    console.log("Loading active stoplosses from DB...");

    const result = await db.query(`
        SELECT p.id AS position_id,
               p.user_id,
               p.stop_loss,
               p.stock_id,
               s.symbol,
               p.remaining_quantity
        FROM positions p
        JOIN stocks s ON p.stock_id = s.id
        WHERE p.status = 'OPEN'
        AND p.stoploss_enabled = true
    `);

    activeStops.clear();

    for (const row of result.rows) {

        const symbol = row.symbol;

        if (!activeStops.has(symbol)) {
            activeStops.set(symbol, []);
        }

        activeStops.get(symbol).push({
            positionId: row.position_id,
            userId: row.user_id,
            stockId: row.stock_id,
            stopLoss: Number(row.stop_loss),
            quantity: Number(row.remaining_quantity)  
        });
    }

    console.log("Active Stops Loaded:", activeStops);
}

// =============================
// Execute StopLoss
// =============================
async function executeStopLoss(order, symbol, currentPrice) {

    console.log(`STOPLOSS HIT → ${symbol} | Position ${order.positionId}`);

    try {
        console.log("Closing position in DB...", order,symbol,currentPrice);
        // Close position in DB
        const res=await sellStock(order.userId, order.stockId, order.quantity,symbol,order.positionId);

        if(res.error || res.status!="EXECUTED"){
            console.log("Failed to close position in DB:", res.error);
            
            // If the position is gone or invalid, we MUST remove it from memory to stop the loop
            if (res.error === "Position not found" || res.error === "Not enough shares" || res.error === "Stock not found") {
                console.log("⚠️ Removing invalid/stale stoploss from memory.");
            } else {
                 // For other errors (e.g. DB connection), we might want to retry, so we return early
                return;
            }
        }

        // Remove from memory
        console.log("removing from local data---")
        const updatedList = activeStops.get(symbol)
            .filter(o => o.positionId !== order.positionId);

        if (updatedList.length === 0) {
            activeStops.delete(symbol);
        } else {
            activeStops.set(symbol, updatedList);
        }

        // Optional: Notify main server
        if (!res.error) {
            await publisher.publish(
                "STOPLOSS_TRIGGERED",
                JSON.stringify({
                    positionId: order.positionId,
                    symbol,
                    price: currentPrice
                })
            );
        }

    } catch (err) {
        console.error("Stoploss execution failed:", err);
    }
}

// =============================
// Price Checking Loop
// =============================
async function checkPrices() {

    if (activeStops.size === 0) return;

    const symbols = Array.from(activeStops.keys());

    const prices = await monitorPrice(symbols);
    console.log("new prices ",prices);

    for (const symbol of symbols) {

        const currentPrice = prices[symbol];
        if (!currentPrice) continue;

        const orders = activeStops.get(symbol);
        if (!orders) continue;

        for (const order of [...orders]) {
            console.log("Checking order",order)

            if (currentPrice <= order.stopLoss) {
                console.log("Executing order",order)
                await executeStopLoss(order, symbol, currentPrice);
            }
        }
    }
}

// =============================
// Redis Subscriber (NEW STOPLOSS)
// =============================
await subscriber.subscribe("NEW_STOPLOSS", (message) => {

    try {
        const data = JSON.parse(message);
        const symbol = data.symbol;

        if (!activeStops.has(symbol)) {
            activeStops.set(symbol, []);
        }

        const list = activeStops.get(symbol);
        const exists = list.some(o => o.positionId === data.positionId);

        if (!exists) {
            list.push({
                positionId: data.positionId,
                userId: data.userId,
                stopLoss: Number(data.stopLoss),
                stockId: data.stockId, // Ensure we pass this if available, though trigger usually has it
                quantity: Number(data.quantity || 0) // Should ideally come from event
            });
            console.log("New stoploss added:", symbol, data.positionId);
        } else {
            console.log("Stoploss already being tracked:", symbol, data.positionId);
        }
    } catch(err) {
        console.error("Redis sub error:", err);
    }
});

// =============================
// Engine Start
// =============================
await loadActiveStops();

// Poll every 5 seconds
setInterval(async () => {
    try {
        await checkPrices();
    } catch (err) {
        console.error("Engine error:", err);
    }
}, 5000);

console.log("StopLoss Engine Running...");
