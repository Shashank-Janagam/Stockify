import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";

dotenv.config({ path: '../Stockify-Backend/.env' });

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function check() {
  try {
    const res = await db.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
    `);
    console.log("Tables:", res.rows.map(r => r.table_name));
    for (const row of res.rows) {
        const colRes = await db.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1`, [row.table_name]);
        console.log(`Table ${row.table_name}:`, colRes.rows);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await db.end();
  }
}

check();
