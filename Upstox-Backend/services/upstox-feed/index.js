/**
 * index.js  —  upstox-feed service entry point
 *
 * Responsibilities:
 *  1. Load stock subscriptions from subscriptions.json (symbol map)
 *  2. Connect to MongoDB and read the Upstox access token
 *  3. Init protobuf, start the Upstox feed WebSocket
 *  4. Start the Redis control listener (services subscribe/unsubscribe)
 *  5. Start the heartbeat reaper (culls dead-service subscriptions)
 *  6. Expose a small Express REST API for symbol resolution (backward-compat)
 *
 * Start: node services/upstox-feed/index.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import express from "express";
import http from "http";
import mongoose from "mongoose";

import { Token } from "../../TokenModel.js";
import { runAutoLogin } from "../../autoLogin.js";
import { initProtobuf, startUpstoxFeed, subscribeKeys, setStockMap, setAccessToken } from "./upstoxClient.js";
import { startControlListener, setStockMap as setControlStockMap } from "./controlListener.js";
import { startHeartbeatReaper } from "./heartbeatReaper.js";
import { getLatestTick } from "./redisPublisher.js";
import { addSubscriptions } from "./symbolRegistry.js";
import { getPubClient } from "./redisClient.js";
import { downloadAndSaveSubscriptions } from "../../update_subscriptions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Multi-candidate .env discovery
const envCandidates = [
  path.resolve(__dirname, "../../.env"),
  path.resolve(__dirname, "../../../Stockify-Backend/.env"),
  path.resolve(__dirname, "../../../.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "Upstox-Backend/.env"),
  path.resolve(process.cwd(), "Stockify-Backend/.env"),
];
for (const p of envCandidates) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
  }
}

// ─── Load subscriptions.json ──────────────────────────────────────────────────

const stockMap = new Map();      // instrument_key → { symbol, name, instrument_key }
const instrumentKeys = [];

function loadSubscriptions(filePath) {
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(resolved)) {
    console.error(`❌ Subscriptions file not found: ${resolved}`);
    process.exit(1);
  }

  const json = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  let items = Array.isArray(json) ? json : json.instruments || json.stocks || [];

  instrumentKeys.length = 0;
  stockMap.clear();

  items.forEach((item) => {
    if (typeof item === "string") {
      instrumentKeys.push(item);
      stockMap.set(item, { symbol: item, name: item, instrument_key: item });
    } else if (item && typeof item === "object") {
      const key = item.instrument_key || item.instrumentKey || item.key;
      const symbol = item.symbol || item.stockName || key;
      const name = item.name || symbol;
      if (key) {
        instrumentKeys.push(key);
        stockMap.set(key, { symbol, name, instrument_key: key });
      }
    }
  });

  console.log(`📋 [index] Loaded ${stockMap.size} symbols from ${path.basename(filePath)}`);
}

// ─── Symbol resolver ──────────────────────────────────────────────────────────

function resolveInstrumentKey(query) {
  if (!query) return null;
  const raw = Array.isArray(query) ? query.join("/") : String(query);
  const q = raw.trim();
  if (!q) return null;

  // Direct instrument_key match
  if (stockMap.has(q)) return q;

  const clean = q.replace(/\.NS$/i, "").replace(/\.BO$/i, "").toUpperCase();

  for (const [key, info] of stockMap.entries()) {
    const sym = (info.symbol || "").toUpperCase();
    const nm = (info.name || "").toUpperCase();
    if (sym === clean || nm === clean) return key;
  }

  for (const [key, info] of stockMap.entries()) {
    const sym = (info.symbol || "").toUpperCase();
    const nm = (info.name || "").toUpperCase();
    if (sym.includes(clean) || nm.includes(clean) || key.toUpperCase().includes(clean)) {
      return key;
    }
  }

  return null;
}

// ─── Express REST API (backward-compat) ───────────────────────────────────────

const app = express();
const PORT = process.env.PORT_4141 || 4141;
const server = http.createServer(app);

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  next();
});
app.use(express.json());

/** GET /api/resolve/:symbol — resolve a symbol to instrument_key */
app.get("/api/resolve/:symbol", (req, res) => {
  const key = resolveInstrumentKey(req.params.symbol);
  if (!key) return res.status(404).json({ found: false, symbol: req.params.symbol });
  const info = stockMap.get(key);
  res.json({ found: true, instrument_key: key, symbol: info?.symbol, name: info?.name });
});

/** GET /api/stocks — list all loaded symbols */
app.get("/api/stocks", (req, res) => {
  const list = Array.from(stockMap.entries()).map(([k, v]) => ({
    instrument_key: k,
    symbol: v.symbol,
    name: v.name,
  }));
  res.json({ count: list.length, stocks: list });
});

/**
 * POST /api/subscribe
 * Body: { symbol, instrument_key, name, serviceId? }
 * Dynamically adds a symbol and registers it in Redis for a serviceId.
 */
app.post("/api/subscribe", async (req, res) => {
  const { symbol, instrument_key, name, serviceId = "rest-api" } = req.body;
  if (!symbol || !instrument_key) {
    return res.status(400).json({ error: "symbol and instrument_key are required" });
  }

  const sym = symbol.toUpperCase().replace(".NS", "");

  if (!stockMap.has(instrument_key)) {
    stockMap.set(instrument_key, { symbol: sym, name: name || sym, instrument_key });
    instrumentKeys.push(instrument_key);
    // Keep controlListener's map in sync
    setStockMap(stockMap);
    setControlStockMap(stockMap);
    console.log(`➕ [REST] Dynamically added: ${sym} → ${instrument_key}`);
  }

  const newKeys = await addSubscriptions(serviceId, [instrument_key]);
  if (newKeys.length > 0) subscribeKeys(newKeys);

  res.json({ ok: true, symbol: sym, instrument_key });
});

/**
 * GET /api/snapshot/*key
 * Returns the latest cached tick for an instrument or symbol (from Redis).
 */
app.get("/api/snapshot/*key", async (req, res) => {
  let rawKey = req.params.key;
  if (Array.isArray(rawKey)) {
    rawKey = rawKey.join("/");
  } else if (typeof rawKey !== "string") {
    rawKey = String(rawKey || "");
  }
  rawKey = rawKey.trim();
  if (!rawKey) return res.status(400).json({ error: "Key is required" });

  const instrumentKey = resolveInstrumentKey(rawKey) || rawKey;

  const tick = await getLatestTick(instrumentKey);
  if (!tick) return res.status(404).json({ error: "No snapshot available" });
  res.json(tick);
});

/**
 * POST /api/reload-subscriptions
 * Downloads freshest NSE instruments from Upstox CDN, saves to subscriptions.json,
 * and updates in-memory symbol registry dynamically.
 */
app.post("/api/reload-subscriptions", async (req, res) => {
  try {
    const list = await downloadAndSaveSubscriptions();
    const subsFile = process.env.SUBSCRIPTIONS_FILE || "subscriptions.json";
    loadSubscriptions(subsFile);
    setStockMap(stockMap);
    setControlStockMap(stockMap);
    res.json({ ok: true, count: list.length, message: `Loaded ${list.length} fresh symbols from Upstox` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/control
 * Proxy endpoint: forward a JSON control message to Redis (for HTTP-only services).
 * Body: { action, serviceId, symbols, mode }
 */
app.post("/api/control", async (req, res) => {
  try {
    const pub = getPubClient();
    await pub.publish("upstox:control", JSON.stringify(req.body));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://shashijanagam2004_db_user:hg00fvxTmkNkOdj8@stocks.ugz3urv.mongodb.net/?appName=stocks";

mongoose
  .connect(MONGO_URI)
  .then(async () => {
    console.log("📦 [index] Connected to MongoDB");

    // ── 1. Auto-Login Check & Execution before Feed Starts ─────────
    const existingDoc = await Token.findOne({ name: "upstox_access" });
    const forceLogin = process.env.FORCE_LOGIN === "true" || process.argv.includes("--force-login");
    const skipLogin = process.env.SKIP_AUTOLOGIN === "true" || process.argv.includes("--skip-login");

    const tokenAgeMs = existingDoc?.updatedAt
      ? Date.now() - new Date(existingDoc.updatedAt).getTime()
      : Infinity;
    const isRecentLogin = tokenAgeMs < 5 * 60 * 1000; // Refreshed less than 5 minutes ago

    if (skipLogin) {
      console.log("⏭️ [index] SKIP_AUTOLOGIN is set, skipping automated login.");
    } else if (isRecentLogin && !forceLogin) {
      console.log(
        `ℹ️ [index] Upstox token was refreshed ${Math.round(tokenAgeMs / 1000)}s ago. Skipping duplicate login.`
      );
    } else {
      console.log("🔐 [index] Running Upstox auto-login before starting feed...");
      try {
        const loginSuccess = await runAutoLogin();
        if (loginSuccess) {
          console.log("✅ [index] Auto-login completed successfully! Starting feed with fresh token.");
        } else {
          console.warn("⚠️ [index] Auto-login did not complete. Falling back to existing MongoDB token if available...");
        }
      } catch (loginErr) {
        console.warn("⚠️ [index] Auto-login error:", loginErr.message);
      }
    }

    // ── 2. Retrieve Access Token from MongoDB ──────────────────────
    const tokenDoc = await Token.findOne({ name: "upstox_access" });
    if (!tokenDoc?.access_token) {
      console.error("❌ Upstox access token missing in MongoDB. Auto-login failed and no token found.");
      process.exit(1);
    }

    // Auto-fetch fresh symbols from Upstox CDN if --fetch-subs flag is passed
    if (process.argv.includes("--fetch-subs") || process.env.FETCH_SUBS === "true") {
      await downloadAndSaveSubscriptions();
    }

    // Load symbols
    const subsFile = process.env.SUBSCRIPTIONS_FILE || "subscriptions.json";
    loadSubscriptions(subsFile);

    // Share the stockMap with other modules
    setStockMap(stockMap);
    setControlStockMap(stockMap);
    setAccessToken(tokenDoc.access_token);

    // Start Redis control listener
    await startControlListener();

    // Start heartbeat reaper
    startHeartbeatReaper();

    // Init protobuf + connect to Upstox
    await initProtobuf();
    await startUpstoxFeed();

    // Start REST API
    server.listen(PORT, () => {
      console.log(`🚀 [index] upstox-feed service running on port ${PORT}`);
      console.log(`   REST API:  http://localhost:${PORT}/api/stocks`);
      console.log(`   Control:   PUBLISH upstox:control {...}`);
      console.log(`   Ticks:     SUBSCRIBE ticks:<instrument_key>`);
    });
  })
  .catch((err) => {
    console.error("❌ [index] MongoDB connection error:", err.message);
    process.exit(1);
  });
