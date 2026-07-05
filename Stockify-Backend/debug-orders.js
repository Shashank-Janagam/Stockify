
import "dotenv/config";
import { db } from "./db/sql.js";

async function debugLastOrder() {
  try {
    const res = await db.query(`SELECT o.id, o.user_id, s.symbol, o.side, o.quantity, o.status, o.created_at FROM orders o JOIN stocks s ON o.stock_id = s.id ORDER BY o.id DESC LIMIT 10`);
    if (res.rows.length > 0) {
        console.log("Last 10 Orders:");
        console.table(res.rows);
    } else {
        console.log("No orders found.");
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

debugLastOrder();
