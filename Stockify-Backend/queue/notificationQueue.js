// queue/notificationQueue.js
// Shared BullMQ Queue — imported by any backend module that needs to trigger notifications.
// The Notification Service Worker consumes jobs from this same queue via the same Redis URL.

import { Queue } from "bullmq";

const connection = {
  // Parse the Redis URL already used by the rest of the backend
  // ioredis-compatible object derived from REDIS_URL env var
  // BullMQ accepts a full URL string via { connection: { url: ... } }
  // but ioredis-style host/port/password is more reliable across versions.
};

const notificationQueue = new Queue("notifications", {
  connection: {
    // BullMQ v5+ accepts a URL string directly
    url: process.env.REDIS_URL,
  },
  defaultJobOptions: {
    attempts: 3,                        // auto-retry up to 3 times on failure
    backoff: { type: "exponential", delay: 5000 }, // 5s → 10s → 20s
    removeOnComplete: { count: 100 },   // keep last 100 completed jobs for debugging
    removeOnFail: { count: 50 },        // keep last 50 failed jobs for inspection
  },
});

notificationQueue.on("error", (err) => {
  console.error("❌ Notification queue error:", err.message);
});

export default notificationQueue;
