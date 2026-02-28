import pkg from "pg";
const { Pool } = pkg;
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  try {
    console.log("Starting column cleanup and swap for 'orders' table...");

    // 1. Drop redundant 'order_category' if it exists
    await pool.query("ALTER TABLE orders DROP COLUMN IF EXISTS order_category CASCADE");
    console.log("- Dropped order_category.");

    // 2. Perform swap
    // Sell_type (Product) -> temp
    // Category (Execution) -> Sell_type
    // Temp (Product) -> Category
    await pool.query("ALTER TABLE orders RENAME COLUMN sell_type TO product_type_tmp");
    await pool.query("ALTER TABLE orders RENAME COLUMN category TO sell_type");
    await pool.query("ALTER TABLE orders RENAME COLUMN product_type_tmp TO category");
    console.log("- Swapped Sell_type and Category.");

    // 3. Update defaults
    await pool.query("ALTER TABLE orders ALTER COLUMN category SET DEFAULT 'Delivery'");
    await pool.query("ALTER TABLE orders ALTER COLUMN sell_type SET DEFAULT 'REGULAR'");
    
    console.log("✅ Swap complete! category=Product, sell_type=Execution.");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
  } finally {
    await pool.end();
  }
}

migrate();
