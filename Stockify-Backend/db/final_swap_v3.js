import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  try {
    console.log("Starting column swap (Reversal) for 'orders' table...");
    console.log("Goal: sell_type = Product, category = Execution.");

    // 1. Rename to temp
    await pool.query("ALTER TABLE orders RENAME COLUMN sell_type TO execution_tmp");
    await pool.query("ALTER TABLE orders RENAME COLUMN category TO product_tmp");
    
    // 2. Rename back to target
    await pool.query("ALTER TABLE orders RENAME COLUMN product_tmp TO sell_type");
    await pool.query("ALTER TABLE orders RENAME COLUMN execution_tmp TO category");
    
    // 3. Update defaults
    await pool.query("ALTER TABLE orders ALTER COLUMN sell_type SET DEFAULT 'Delivery'");
    await pool.query("ALTER TABLE orders ALTER COLUMN category SET DEFAULT 'REGULAR'");
    
    console.log("✅ Swap complete! sell_type=Product, category=Execution.");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
  } finally {
    await pool.end();
  }
}

migrate();
