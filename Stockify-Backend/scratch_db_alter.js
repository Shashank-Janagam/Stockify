import 'dotenv/config';
import { db } from './db/sql.js';
const client = await db.connect();
try {
  await client.query("ALTER TABLE users ADD COLUMN telegram_chat_id VARCHAR(50);");
  console.log("Column added successfully!");
} catch(err) {
  console.error("Error altering table:", err.message);
} finally {
  client.release();
  process.exit(0);
}
