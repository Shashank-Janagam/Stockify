import pkg from "pg";
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fix() {
  try {
    await db.query(`
      ALTER TABLE sim_positions DROP CONSTRAINT IF EXISTS sim_positions_user_id_stock_id_product_type_key;
      ALTER TABLE sim_positions DROP CONSTRAINT IF EXISTS sim_positions_user_stock_product_session_key;
      ALTER TABLE sim_positions ADD CONSTRAINT sim_positions_user_stock_product_session_key UNIQUE (user_id, stock_id, product_type, replay_session_id);
    `);
    console.log('Constraint updated successfully');
  } catch (err) {
    console.error(err);
  } finally {
    db.end();
  }
}
fix();
