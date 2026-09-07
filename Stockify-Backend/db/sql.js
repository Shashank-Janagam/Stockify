import pkg from "pg";
const { Pool } = pkg;

// Create connection pool with keep-alive and error resilience
export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

db.on("error", (err) => {
  console.warn("⚠️ [Postgres Pool] Idle client connection reset/dropped:", err.message);
});

