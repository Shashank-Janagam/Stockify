import pkg from "pg";
const { Pool } = pkg;
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  try {
    const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'orders'");
    console.log("Current Columns in 'orders':", res.rows.map(r => r.column_name));
  } catch (err) {
    console.error(err.message);
  } finally {
    pool.end();
  }
}

check();
