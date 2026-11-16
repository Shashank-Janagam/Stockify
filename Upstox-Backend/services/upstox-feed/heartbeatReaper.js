/**
 * heartbeatReaper.js
 *
 * Periodically checks which consumer services are still alive
 * (their heartbeat key still has a TTL in Redis).
 *
 * Any service whose heartbeat has expired is considered dead —
 * its symbol subscriptions are removed from the registry and
 * orphan keys are unsubscribed from the Upstox feed.
 *
 * Services MUST publish a heartbeat every ~15 s:
 *   PUBLISH upstox:control {"action":"heartbeat","serviceId":"my-service"}
 */

import { getRedis } from "./redisClient.js";
import { getAllServiceIds, reapDeadServices } from "./symbolRegistry.js";
import { unsubscribeKeys } from "./upstoxClient.js";
import { evictSnapshot } from "./redisPublisher.js";

const REAP_INTERVAL_MS = 20_000; // run every 20 seconds

async function reap() {
  const redis = getRedis();

  const allServiceIds = await getAllServiceIds();
  if (allServiceIds.length === 0) return;

  // Check which ones still have a heartbeat key
  const pipeline = redis.pipeline();
  for (const id of allServiceIds) {
    pipeline.exists(`service:heartbeat:${id}`);
  }
  const results = await pipeline.exec(); // [[null, 0|1], ...]

  const aliveIds = allServiceIds.filter((_, i) => results[i][1] === 1);
  const deadIds  = allServiceIds.filter((_, i) => results[i][1] === 0);

  if (deadIds.length === 0) return;

  console.log(`💀 [heartbeatReaper] Dead services: ${deadIds.join(", ")}`);

  const orphanKeys = await reapDeadServices(aliveIds);

  if (orphanKeys.length > 0) {
    unsubscribeKeys(orphanKeys);
    orphanKeys.forEach(evictSnapshot);
    console.log(
      `🧹 [heartbeatReaper] Released ${orphanKeys.length} orphan keys from dead services`
    );
  }
}

export function startHeartbeatReaper() {
  console.log(
    `💓 [heartbeatReaper] Starting — scanning every ${REAP_INTERVAL_MS / 1000}s`
  );
  setInterval(() => {
    reap().catch((err) =>
      console.error("❌ [heartbeatReaper] Error:", err.message)
    );
  }, REAP_INTERVAL_MS);
}
