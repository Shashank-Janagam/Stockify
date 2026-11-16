/**
 * symbolRegistry.js
 *
 * Redis-backed symbol registry.
 * Tracks which serviceIds are subscribed to which instrument_keys.
 *
 * Redis schema:
 *   registry:symbols  → Hash { instrument_key: JSON.stringify([...serviceIds]) }
 *   ticks:latest      → Hash { instrument_key: JSON.stringify(tickPayload) }
 */

import { getRedis } from "./redisClient.js";

const REGISTRY_KEY = "registry:symbols";

/**
 * Add serviceId → [instrument_keys] mapping.
 * Returns the NEW instrument keys that now have at least one subscriber
 * (i.e., keys that the Upstox feed should start subscribing to).
 */
export async function addSubscriptions(serviceId, instrumentKeys) {
  const redis = getRedis();
  const newKeys = [];

  for (const key of instrumentKeys) {
    const raw = await redis.hget(REGISTRY_KEY, key);
    const services = raw ? JSON.parse(raw) : [];

    if (!services.includes(serviceId)) {
      services.push(serviceId);
    }

    const wasEmpty = !raw || JSON.parse(raw).length === 0;
    await redis.hset(REGISTRY_KEY, key, JSON.stringify(services));

    if (wasEmpty) {
      newKeys.push(key); // first subscriber → Upstox needs to sub
    }
  }

  return newKeys;
}

/**
 * Remove serviceId → [instrument_keys] mapping.
 * Returns the instrument keys that now have ZERO subscribers
 * (i.e., keys the Upstox feed should unsubscribe from).
 */
export async function removeSubscriptions(serviceId, instrumentKeys) {
  const redis = getRedis();
  const orphanKeys = [];

  for (const key of instrumentKeys) {
    const raw = await redis.hget(REGISTRY_KEY, key);
    if (!raw) continue;

    let services = JSON.parse(raw);
    services = services.filter((s) => s !== serviceId);

    if (services.length === 0) {
      await redis.hdel(REGISTRY_KEY, key);
      orphanKeys.push(key); // last subscriber gone → Upstox needs to unsub
    } else {
      await redis.hset(REGISTRY_KEY, key, JSON.stringify(services));
    }
  }

  return orphanKeys;
}

/**
 * Remove ALL subscriptions for a serviceId.
 * Returns orphan keys (zero remaining subscribers).
 */
export async function removeAllForService(serviceId) {
  const redis = getRedis();
  const all = await redis.hgetall(REGISTRY_KEY);
  if (!all) return [];

  const orphanKeys = [];

  for (const [key, raw] of Object.entries(all)) {
    let services = JSON.parse(raw);
    if (!services.includes(serviceId)) continue;

    services = services.filter((s) => s !== serviceId);

    if (services.length === 0) {
      await redis.hdel(REGISTRY_KEY, key);
      orphanKeys.push(key);
    } else {
      await redis.hset(REGISTRY_KEY, key, JSON.stringify(services));
    }
  }

  return orphanKeys;
}

/**
 * Returns all instrument keys currently in the registry (at least one subscriber).
 */
export async function getAllActiveKeys() {
  const redis = getRedis();
  const all = await redis.hgetall(REGISTRY_KEY);
  if (!all) return [];
  return Object.keys(all);
}

/**
 * Returns every unique serviceId referenced anywhere in the registry.
 */
export async function getAllServiceIds() {
  const redis = getRedis();
  const all = await redis.hgetall(REGISTRY_KEY);
  if (!all) return [];
  const ids = new Set();
  for (const raw of Object.values(all)) {
    for (const id of JSON.parse(raw)) ids.add(id);
  }
  return [...ids];
}

/**
 * Returns all serviceIds subscribed to a given instrument key.
 */
export async function getServicesForKey(instrumentKey) {
  const redis = getRedis();
  const raw = await redis.hget(REGISTRY_KEY, instrumentKey);
  return raw ? JSON.parse(raw) : [];
}

/**
 * Reap subscriptions belonging to dead services (not in aliveServiceIds).
 * Returns orphan keys that now have zero subscribers.
 */
export async function reapDeadServices(aliveServiceIds) {
  const redis = getRedis();
  const all = await redis.hgetall(REGISTRY_KEY);
  if (!all) return [];

  const aliveSet = new Set(aliveServiceIds);
  const orphanKeys = [];

  for (const [key, raw] of Object.entries(all)) {
    let services = JSON.parse(raw);
    const before = services.length;
    services = services.filter((s) => aliveSet.has(s));

    if (services.length === 0) {
      await redis.hdel(REGISTRY_KEY, key);
      orphanKeys.push(key);
    } else if (services.length !== before) {
      await redis.hset(REGISTRY_KEY, key, JSON.stringify(services));
    }
  }

  return orphanKeys;
}
