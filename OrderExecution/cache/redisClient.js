import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
export const redis = new Redis(url, {
  lazyConnect: false,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 5000);
    return delay;
  },
});

redis.on("connect", () => {
  console.log("✅ [OrderExecution/Redis] Connected.");
});

redis.on("error", (err) => {
  console.error("❌ [OrderExecution/Redis] Error:", err.message);
});

export default redis;
