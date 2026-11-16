/**
 * upstoxClient.js
 *
 * Owns the single Upstox Market Data WebSocket connection.
 * - Decodes protobuf binary frames
 * - Calls publishTick() for every live tick
 * - Exposes subscribe() / unsubscribe() helpers for the control listener
 * - Auto-reconnects and re-subscribes all active keys from the registry
 */

import WebSocket from "ws";
import protobuf from "protobufjs";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import { publishTick } from "./redisPublisher.js";
import { getAllActiveKeys } from "./symbolRegistry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTO_PATH = path.resolve(__dirname, "../../MarketDataFeed.proto");

let FeedResponseProto = null;
let _ws = null;
let _accessToken = null;

// stockMap is passed in from index.js (loaded from subscriptions.json)
let _stockMap = new Map();

// ── Throttled tick diagnostics ───────────────────────────────────────────────
let _tickCount = 0;
let _lastDiagLog = 0;
const DIAG_INTERVAL_MS = 5000; // log a sample tick summary every 5 s

export function setStockMap(map) {
  _stockMap = map;
}

export function setAccessToken(token) {
  _accessToken = token;
}

// ─── Protobuf ───────────────────────────────────────────────────────────────

export async function initProtobuf() {
  const root = await protobuf.load(PROTO_PATH);
  FeedResponseProto = root.lookupType(
    "com.upstox.marketdatafeeder.rpc.proto.FeedResponse"
  );
  console.log("✅ [upstoxClient] Protobuf schema loaded");
}

// ─── Upstox Auth ─────────────────────────────────────────────────────────────

async function getMarketFeedUrl() {
  const response = await axios.get(
    "https://api.upstox.com/v3/feed/market-data-feed/authorize",
    {
      headers: {
        Authorization: `Bearer ${_accessToken}`,
        Accept: "application/json",
      },
      timeout: 10000,
    }
  );
  return response.data.data.authorizedRedirectUri;
}

// ─── Subscribe / Unsubscribe helpers ─────────────────────────────────────────

const CHUNK_SIZE = 500;

export function subscribeKeys(instrumentKeys) {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) {
    console.warn("⚠️  [upstoxClient] WS not open — queuing keys for reconnect");
    return;
  }
  for (let i = 0; i < instrumentKeys.length; i += CHUNK_SIZE) {
    const batch = instrumentKeys.slice(i, i + CHUNK_SIZE);
    _ws.send(
      Buffer.from(
        JSON.stringify({
          guid: `sub_${Date.now()}_${Math.floor(i / CHUNK_SIZE)}`,
          method: "sub",
          data: { mode: "ltpc", instrumentKeys: batch },
        })
      )
    );
    console.log(
      `📡 [upstoxClient] Subscribed batch (${batch.length} keys): ${batch.slice(0, 3).join(", ")}…`
    );
  }
}

export function unsubscribeKeys(instrumentKeys) {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) return;
  for (let i = 0; i < instrumentKeys.length; i += CHUNK_SIZE) {
    const batch = instrumentKeys.slice(i, i + CHUNK_SIZE);
    _ws.send(
      Buffer.from(
        JSON.stringify({
          guid: `unsub_${Date.now()}_${Math.floor(i / CHUNK_SIZE)}`,
          method: "unsub",
          data: { mode: "ltpc", instrumentKeys: batch },
        })
      )
    );
    console.log(
      `📴 [upstoxClient] Unsubscribed batch (${batch.length} keys): ${batch.slice(0, 3).join(", ")}…`
    );
  }
}

// ─── Message decoder ─────────────────────────────────────────────────────────

function handleMessage(data) {
  try {
    const decoded = FeedResponseProto.decode(data);
    const parsed = FeedResponseProto.toObject(decoded, {
      longs: String,
      enums: String,
      bytes: String,
    });

    if (!parsed.feeds || Object.keys(parsed.feeds).length === 0) return;

    for (const [instrumentKey, feedData] of Object.entries(parsed.feeds)) {
      const stockInfo = _stockMap.get(instrumentKey) || {
        symbol: instrumentKey,
        name: instrumentKey,
      };

      const marketFF =
        feedData.ff?.marketFF || feedData.ff?.indexFF;
      const ltpData = marketFF?.ltpc || feedData.ltpc;
      const ohlc = marketFF?.marketOHLC;

      const ltp = ltpData?.ltp;
      const cp = ltpData?.cp;

      if (!ltp) continue;

      const tickPayload = {
        type: "LIVE_TICK",
        symbol: stockInfo.symbol,
        name: stockInfo.name,
        instrument_key: instrumentKey,
        ltp,
        prev_close: cp || null,
        open: ohlc?.ohlc?.[0]?.open || null,
        high: ohlc?.ohlc?.[0]?.high || null,
        low: ohlc?.ohlc?.[0]?.low || null,
        close: ohlc?.ohlc?.[0]?.close || null,
        timestamp: new Date().toISOString(),
      };

      publishTick(instrumentKey, tickPayload).catch((err) => {
        console.error(`❌ [upstoxClient] publishTick failed for ${instrumentKey}:`, err.message);
      });

      // Throttled diagnostic: log one sample tick every 5 s
      _tickCount++;
      const now = Date.now();
      if (now - _lastDiagLog >= DIAG_INTERVAL_MS) {
        _lastDiagLog = now;
        console.log(
          `📊 [upstoxClient] ${_tickCount} ticks received in last 5s | last: ${stockInfo.symbol} ₹${ltp}`
        );
        _tickCount = 0;
      }
    }
  } catch (err) {
    // ignore non-proto frames (Upstox sends text ping frames too)
    if (data?.length > 2) {
      console.warn(`⚠️ [upstoxClient] decode error (${data?.length} bytes):`, err.message);
    }
  }
}

// ─── Connect / Reconnect ─────────────────────────────────────────────────────

export async function startUpstoxFeed() {
  try {
    const wsUrl = await getMarketFeedUrl();
    console.log("🔑 [upstoxClient] Got authorized feed URL");

    _ws = new WebSocket(wsUrl);

    _ws.on("open", async () => {
      console.log("⚡ [upstoxClient] Connected to Upstox Market Data Feed");

      // Re-subscribe all keys currently in the Redis registry
      const activeKeys = await getAllActiveKeys();
      if (activeKeys.length > 0) {
        subscribeKeys(activeKeys);
        console.log(
          `📋 [upstoxClient] Restored ${activeKeys.length} subscriptions from registry`
        );
      } else {
        console.log("📋 [upstoxClient] No active subscriptions in registry — waiting for services");
      }
    });

    _ws.on("message", handleMessage);

    _ws.on("error", (err) =>
      console.error("❌ [upstoxClient] WS error:", err.message)
    );

    _ws.on("close", (code, reason) => {
      console.log(
        `🔌 [upstoxClient] Disconnected (${code}: ${reason || "none"}). Reconnecting in 5s…`
      );
      setTimeout(startUpstoxFeed, 5000);
    });
  } catch (err) {
    console.error("❌ [upstoxClient] Failed to start feed:", err.message);
    console.log("⏳ [upstoxClient] Retrying in 10s…");
    setTimeout(startUpstoxFeed, 10000);
  }
}
