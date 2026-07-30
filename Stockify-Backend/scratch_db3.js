import 'dotenv/config';
import { db } from './db/sql.js';
const client = await db.connect();
const res = await client.query("SELECT name, email, telegram_chat_id FROM users");
console.log(res.rows);
client.release();
process.exit(0);
