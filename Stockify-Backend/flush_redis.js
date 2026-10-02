import redis from "./cache/redisClient.js";
async function flush() {
    await redis.flushall();
    console.log("Redis cache cleared!");
    process.exit(0);
}
flush();
