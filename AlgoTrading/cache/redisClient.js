import Redis from "ioredis";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });
console.log("redis url  :",process.env.REDIS_URL)

const redis = new Redis(process.env.REDIS_URL);

redis.on("connect", () => {
  console.log("✅ Redis connected:", process.env.REDIS_URL);
});

redis.on("error", (err) => {
  console.error("❌ Redis error:", err);
});

export default redis;