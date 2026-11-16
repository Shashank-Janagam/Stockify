/**
 * redisPublisher.js
 *
 * Publishes decoded tick payloads to Redis:
 *   - Per-instrument channel:  ticks:<instrument_key>  (Pub/Sub)
 *   - Snapshot cache:          HSET ticks:latest <instrument_key> <json>
 *
 * PUBLISH uses a dedicated pub client.
 * HSET uses the general-purpose client.
 * Both fire concurrently (Promise.all) for minimal latency.
 */

import { getPubClient, getRedis } from "./redisClient.js";

const LATEST_KEY = "ticks:latest";

/**
 * Publish a tick payload to its instrument channel and update the snapshot cache.
 * Runs PUBLISH + HSET concurrently — both fire in parallel, not sequentially.
 * @param {string} instrumentKey
 * @param {object} tickPayload
 */
export async function publishTick(instrumentKey, tickPayload) {
  const json = JSON.stringify(tickPayload);
  const pub   = getPubClient();
  const redis = getRedis();

  await Promise.all([
    pub.publish(`ticks:${instrumentKey}`, json),
    redis.hset(LATEST_KEY, instrumentKey, json),
  ]);
}

/**
 * Returns the latest cached tick for an instrument key (or null).
 */
export async function getLatestTick(instrumentKey) {
  const redis = getRedis();
  const raw = await redis.hget(LATEST_KEY, instrumentKey);
  return raw ? JSON.parse(raw) : null;
}

/**
 * Removes a stale snapshot from the cache (called when a key becomes unsubscribed).
 */
export async function evictSnapshot(instrumentKey) {
  const redis = getRedis();
  await redis.hdel(LATEST_KEY, instrumentKey);
}

