
import "dotenv/config";
import { db } from "./db/sql.js";

async function debugLastOrder() {
  try {
    const res = await db.query(`SELECT * FROM orders ORDER BY id DESC LIMIT 1`);
    if (res.rows.length > 0) {
        console.log("Last Order:", res.rows[0]);
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
