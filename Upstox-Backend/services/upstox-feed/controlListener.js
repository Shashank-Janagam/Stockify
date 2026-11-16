/**
 * controlListener.js
 *
 * Subscribes to the Redis "upstox:control" channel.
 * Processes commands sent by any consumer service:
 *
 *   subscribe        → add serviceId's keys to registry → sub new keys to Upstox
 *   unsubscribe      → remove serviceId's keys → unsub orphan keys from Upstox
 *   unsubscribe_all  → graceful shutdown of a service
 *   heartbeat        → renew liveness key (TTL 30s)
 *
 * Symbol resolution: symbols can be instrument_key OR display symbol (e.g. "RELIANCE").
 */

import { getSubClient, getRedis } from "./redisClient.js";
import {
  addSubscriptions,
  removeSubscriptions,
  removeAllForService,
} from "./symbolRegistry.js";
import { subscribeKeys, unsubscribeKeys } from "./upstoxClient.js";
import { evictSnapshot } from "./redisPublisher.js";

const CONTROL_CHANNEL = "upstox:control";
const HEARTBEAT_TTL = 30; // seconds

let _stockMap = new Map(); // set from index.js

export function setStockMap(map) {
  _stockMap = map;
}

/**
 * Resolve a list of mixed symbols / instrument_keys to instrument_keys.
 */
function resolveKeys(rawList) {
  const resolved = [];
  for (const item of rawList) {
    if (!item) continue;
    const raw = Array.isArray(item) ? item.join("/") : String(item);
    const q = raw.trim();
    if (!q) continue;

    // Direct instrument_key match (contains "|")
    if (_stockMap.has(q)) {
      resolved.push(q);
      continue;
    }

    // Clean .NS and .BO suffix
    const clean = q.replace(/\.NS$/i, "").replace(/\.BO$/i, "").toUpperCase();

    // Exact match by symbol or name
    let found = null;
    for (const [key, info] of _stockMap.entries()) {
      const sym = (info.symbol || "").toUpperCase();
      const nm = (info.name || "").toUpperCase();
      if (sym === clean || nm === clean) {
        found = key;
        break;
      }
    }

    // Partial match fallback
    if (!found) {
      for (const [key, info] of _stockMap.entries()) {
        const sym = (info.symbol || "").toUpperCase();
        const nm = (info.name || "").toUpperCase();
        if (sym.includes(clean) || nm.includes(clean) || key.toUpperCase().includes(clean)) {
          found = key;
          break;
        }
      }
    }

    if (found) {
      resolved.push(found);
    } else {
      console.warn(`⚠️  [controlListener] Cannot resolve symbol: "${q}"`);
    }
  }
  return resolved;
}

async function handleMessage(message) {
  let msg;
  try {
    msg = JSON.parse(message);
  } catch {
    console.warn("⚠️  [controlListener] Non-JSON control message ignored");
    return;
  }

  const { action, serviceId, symbols = [], mode = "ltpc" } = msg;

  if (!action) return;

  // ── Heartbeat ─────────────────────────────────────────────────────────────
  if (action === "heartbeat") {
    if (!serviceId) return;
    const redis = getRedis();
    await redis.set(`service:heartbeat:${serviceId}`, "1", "EX", HEARTBEAT_TTL);
    return;
  }

  if (!serviceId) {
    console.warn("⚠️  [controlListener] Control message missing serviceId:", msg);
    return;
  }

  // ── Subscribe ──────────────────────────────────────────────────────────────
  if (action === "subscribe") {
    const instrumentKeys = resolveKeys(symbols);
    if (instrumentKeys.length === 0) return;

    const newKeys = await addSubscriptions(serviceId, instrumentKeys);

    if (newKeys.length > 0) {
      subscribeKeys(newKeys); // only actually subscribe new keys
      console.log(
        `➕ [controlListener] ${serviceId} subscribed ${instrumentKeys.length} symbols` +
          ` (${newKeys.length} new Upstox sub)`
      );
    } else {
      console.log(
        `➕ [controlListener] ${serviceId} subscribed ${instrumentKeys.length} symbols (all already active)`
      );
    }
    return;
  }

  // ── Unsubscribe ───────────────────────────────────────────────────────────
  if (action === "unsubscribe") {
    const instrumentKeys = resolveKeys(symbols);
    if (instrumentKeys.length === 0) return;

    const orphanKeys = await removeSubscriptions(serviceId, instrumentKeys);

    if (orphanKeys.length > 0) {
      unsubscribeKeys(orphanKeys);
      orphanKeys.forEach(evictSnapshot);
      console.log(
        `➖ [controlListener] ${serviceId} unsubscribed — ${orphanKeys.length} orphan keys released`
      );
    }
    return;
  }

  // ── Unsubscribe All ───────────────────────────────────────────────────────
  if (action === "unsubscribe_all") {
    const orphanKeys = await removeAllForService(serviceId);

    if (orphanKeys.length > 0) {
      unsubscribeKeys(orphanKeys);
      orphanKeys.forEach(evictSnapshot);
    }

    console.log(
      `🗑️  [controlListener] ${serviceId} unsubscribed all — ${orphanKeys.length} keys released`
    );
    return;
  }

  console.warn(`⚠️  [controlListener] Unknown action: "${action}"`);
}

export async function startControlListener() {
  const sub = getSubClient();
  await sub.subscribe(CONTROL_CHANNEL);
  console.log(`📻 [controlListener] Listening on Redis channel "${CONTROL_CHANNEL}"`);

  sub.on("message", (channel, message) => {
    if (channel !== CONTROL_CHANNEL) return;
    handleMessage(message).catch((err) =>
      console.error("❌ [controlListener] Error handling message:", err.message)
    );
  });
}
