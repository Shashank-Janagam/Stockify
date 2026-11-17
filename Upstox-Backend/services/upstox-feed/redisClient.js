/**
 * redisClient.js
 *
 * Singleton ioredis client shared across the feed service.
 * Separate instances are used for pub and sub because a subscribing
 * client can't issue regular commands in ioredis.
 */

import Redis from "ioredis";

let _redis = null;   // general-purpose client (GET / SET / HSET …)
let _sub = null;     // dedicated subscriber client
let _pub = null;     // dedicated publisher client

function makeClient(options = {}) {
  const url =
    process.env.REDIS_URL ||
    "redis://default:AUd9F1nNtQX86sRpLPQdHut91bOR8B3G@redis-11499.c264.ap-south-1-1.ec2.cloud.redislabs.com:11499";
  const client = new Redis(url, {
    lazyConnect: false,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5000);
      console.log(`⏳ [Redis] Reconnecting in ${delay}ms (attempt ${times})…`);
      return delay;
    },
    ...options,
  });

  client.on("connect", () => console.log("✅ [Redis] Connected"));
  client.on("error", (err) => console.error("❌ [Redis] Error:", err.message));

  return client;
}

export function getRedis() {
  if (!_redis) _redis = makeClient();
  return _redis;
}

export function getSubClient() {
  if (!_sub) _sub = makeClient({ enableReadyCheck: false });
  return _sub;
}

export function getPubClient() {
  if (!_pub) _pub = makeClient();
  return _pub;
}
