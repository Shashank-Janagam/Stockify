/**
 * priceMonitor.js (Redis Pub/Sub Edition)
 *
 * Replaces the direct Upstox WebSocket (ws://localhost:4141) with Redis pub/sub.
 *
 * Responsibilities:
 *  1. Subscribes to Redis pattern `ticks:*` for real-time Upstox ticks.
 *  2. Sends `subscribe` / `unsubscribe` / `heartbeat` control commands to `upstox:control`.
 *  3. Dispatches ticks immediately to `onTickCallback(cleanSymbol, price)` for sub-millisecond SL evaluation.
 *  4. Provides Yahoo Finance fallback polling when market is closed or Redis is unavailable.
 */

import Redis from "ioredis";
import YahooFinance from "yahoo-finance2";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const REDIS_URL       = process.env.REDIS_URL;
const FEED_API_URL    = process.env.FEED_API_URL || "http://localhost:4141";
const CONTROL_CHANNEL = "upstox:control";
const SERVICE_ID      = "stoploss-engine";
const HEARTBEAT_TTL   = 15_000; // ms

let pubClient = null;
let subClient = null;
let priceCache = {};
let isConnected = false;

// Event callback for live ticks
let onTickCallback = null;
let fallbackInterval = null;
let activeSymbols = new Set();
let heartbeatInterval = null;

export function setTickListener(callback) {
  onTickCallback = callback;
}

function initRedis() {
  if (!REDIS_URL) {
    console.error("[PriceMonitor] ❌ REDIS_URL not configured. Ticks will rely on Yahoo fallback only.");
    return;
  }

  try {
    console.log("[PriceMonitor] 🔌 Connecting to Redis for live ticks...");

    pubClient = new Redis(REDIS_URL);

    // enableReadyCheck: false is critical for subscriber clients so ioredis
    // does not send INFO/PING commands on an already-subscribed socket
    subClient = new Redis(REDIS_URL, {
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    });

    pubClient.on("error", (err) => console.error("[PriceMonitor/pub] ❌ Redis error:", err.message));
    subClient.on("error", (err) => console.error("[PriceMonitor/sub] ❌ Redis error:", err.message));

    // Register event listeners ONCE (never inside connect/ready handlers)
    subClient.on("pmessage", (pattern, channel, message) => {
      handleIncomingTick(message);
    });

    subClient.on("message", (channel, message) => {
      if (channel.startsWith("ticks:")) {
        handleIncomingTick(message);
      }
    });

    // Pattern subscribe once
    subClient.psubscribe("ticks:*", (err) => {
      if (err) console.error("[PriceMonitor] ❌ psubscribe error:", err.message);
      else console.log("[PriceMonitor] 📡 Pattern subscribed to ticks:*");
    });

    subClient.on("ready", () => {
      console.log("[PriceMonitor] ✅ Connected to Redis (ticks feed)!");
      isConnected = true;

      // Start periodic heartbeat
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_TTL);
      sendHeartbeat();

      // Subscribe any symbols already queued
      if (activeSymbols.size > 0) {
        subscribe([...activeSymbols]);
      }
    });

    subClient.on("close", () => {
      isConnected = false;
      console.warn("[PriceMonitor] 🔌 Redis subscription connection closed.");
    });
  } catch (err) {
    console.error("[PriceMonitor] ❌ Failed to init Redis clients:", err.message);
  }
}

function handleIncomingTick(message) {
  try {
    const parsed = JSON.parse(message);
    const rawSymbol = parsed.symbol || "";
    const ltp = parsed.ltp != null ? Number(parsed.ltp) : null;
    if (!rawSymbol || ltp == null) return;

    const cleanSymbol = rawSymbol.replace(/\.NS$/, "").toUpperCase();

    priceCache[cleanSymbol] = ltp;
    priceCache[`${cleanSymbol}.NS`] = ltp;

    // Immediately trigger tick event for real-time stoploss
    if (onTickCallback) {
      onTickCallback(cleanSymbol, ltp);
    }
  } catch (err) {
    // Ignore JSON parse errors on malformed messages
  }
}

async function sendControl(msg) {
  if (!pubClient) return;
  try {
    await pubClient.publish(CONTROL_CHANNEL, JSON.stringify(msg));
  } catch (err) {
    console.error("[PriceMonitor] Control publish error:", err.message);
  }
}

function sendHeartbeat() {
  sendControl({ action: "heartbeat", serviceId: SERVICE_ID });
}

function subscribe(symbols) {
  if (!Array.isArray(symbols) || symbols.length === 0) return;
  const cleanSymbols = symbols.map((s) => s.replace(/\.NS$/, "").toUpperCase());
  console.log(`[PriceMonitor] 📡 Subscribing to Upstox feed via Redis: ${cleanSymbols.join(", ")}`);

  sendControl({
    action: "subscribe",
    serviceId: SERVICE_ID,
    symbols: cleanSymbols,
  });

  // Attempt snapshot fetch for instant price on register
  cleanSymbols.forEach(async (sym) => {
    try {
      const res = await fetch(`${FEED_API_URL}/api/resolve/${encodeURIComponent(sym)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.found && data.instrument_key) {
          const snapRes = await fetch(`${FEED_API_URL}/api/snapshot/${encodeURIComponent(data.instrument_key)}`);
          if (snapRes.ok) {
            const snap = await snapRes.json();
            if (snap && snap.ltp) handleIncomingTick(JSON.stringify(snap));
          }
        }
      }
    } catch {}
  });
}

function unsubscribe(symbols) {
  if (!Array.isArray(symbols) || symbols.length === 0) return;
  const cleanSymbols = symbols.map((s) => s.replace(/\.NS$/, "").toUpperCase());
  console.log(`[PriceMonitor] 📴 Unsubscribing from Upstox feed via Redis: ${cleanSymbols.join(", ")}`);

  sendControl({
    action: "unsubscribe",
    serviceId: SERVICE_ID,
    symbols: cleanSymbols,
  });
}

export function updateTrackedSymbols(symbols = []) {
  const newSymbols = new Set(symbols.map((s) => s.replace(/\.NS$/, "").toUpperCase()));
  const removed = [...activeSymbols].filter((sym) => !newSymbols.has(sym));
  const added = [...newSymbols].filter((sym) => !activeSymbols.has(sym));

  activeSymbols = newSymbols;

  if (isConnected) {
    if (added.length > 0) subscribe(added);
    if (removed.length > 0) unsubscribe(removed);
  }
}

// Check if market is live
function isMarketLive() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 3600000 * 5.5);
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;

  const timeInMinutes = ist.getHours() * 60 + ist.getMinutes();
  const startMinutes = 9 * 60 + 15;
  const endMinutes = 15 * 60 + 30;

  return timeInMinutes >= startMinutes && timeInMinutes <= endMinutes;
}

// Fallback polling loop when Redis is down or market is offline
async function fallbackPolling() {
  if (activeSymbols.size === 0) return;
  if (isConnected && isMarketLive()) return; // Live Redis ticks are flowing, skip Yahoo polling

  try {
    const symbolsArray = [...activeSymbols].map((s) => (s.endsWith(".NS") ? s : `${s}.NS`));
    const quotes = await yahoo.quote(symbolsArray);
    const results = Array.isArray(quotes) ? quotes : [quotes];

    for (const quote of results) {
      if (!quote || !quote.symbol || !quote.regularMarketPrice) continue;
      const price = quote.regularMarketPrice;
      const cleanSymbol = quote.symbol.replace(/\.NS$/, "").toUpperCase();

      priceCache[cleanSymbol] = price;
      priceCache[`${cleanSymbol}.NS`] = price;

      if (onTickCallback) {
        onTickCallback(cleanSymbol, price);
      }
    }
  } catch (err) {
    console.error("[PriceMonitor] Fallback polling error:", err.message);
  }
}

// Start Redis connection and fallback timer
initRedis();
fallbackInterval = setInterval(fallbackPolling, 5000);
