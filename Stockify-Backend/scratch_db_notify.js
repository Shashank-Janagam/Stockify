import 'dotenv/config';
import { db } from './db/sql.js';

async function updateSchema() {
  const client = await db.connect();
  try {
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_email BOOLEAN DEFAULT TRUE;");
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_whatsapp BOOLEAN DEFAULT TRUE;");
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_telegram BOOLEAN DEFAULT TRUE;");
    console.log("Database schema updated successfully with notification preferences.");
  } catch (err) {
    console.error("Error updating schema:", err);
  } finally {
    client.release();
    process.exit(0);
  }
}

updateSchema();
