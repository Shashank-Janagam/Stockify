require('dotenv').config();
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  try {
    await db.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS notify_email BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS notify_whatsapp BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS notify_telegram BOOLEAN DEFAULT TRUE;
    `);
    console.log('Columns added to users table');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
run();
