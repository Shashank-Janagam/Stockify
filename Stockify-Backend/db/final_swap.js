import pkg from "pg";
const { Pool } = pkg;
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  try {
    console.log("Starting final column swap for 'orders' table...");

    // 1. Ensure 'category' exists (it might be 'order_category' or 'category' depending on previous steps)
    // Check if 'order_category' exists and rename to 'category'
    const checkOrderCat = await pool.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'order_category'");
    if (checkOrderCat.rows.length > 0) {
        await pool.query("ALTER TABLE orders RENAME COLUMN order_category TO category");
        console.log("Renamed order_category to category.");
    }

    // 2. Swapping logic
    // Current: sell_type (Product), category (Execution)
    // Target: sell_type (Execution), category (Product)
    
    await pool.query("ALTER TABLE orders RENAME COLUMN sell_type TO product_type_tmp");
    await pool.query("ALTER TABLE orders RENAME COLUMN category TO sell_type");
    await pool.query("ALTER TABLE orders RENAME COLUMN product_type_tmp TO category");

    // 3. Set Defaults
    await pool.query("ALTER TABLE orders ALTER COLUMN category SET DEFAULT 'Delivery'");
    await pool.query("ALTER TABLE orders ALTER COLUMN sell_type SET DEFAULT 'REGULAR'");

    console.log("✅ Column swap successful!");
    console.log("   - 'category' now stores Product Type (Intraday/Delivery)");
    console.log("   - 'sell_type' now stores Execution Type (REGULAR/STOPLOSS/AUTO_SQUAREOFF)");

  } catch (err) {
    console.error("❌ Migration failed:", err.message);
  } finally {
    await pool.end();
  }
}

migrate();
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
