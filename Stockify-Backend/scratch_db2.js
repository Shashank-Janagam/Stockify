import 'dotenv/config';
import { db } from './db/sql.js';
const client = await db.connect();
const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'");
console.log(res.rows);
client.release();
process.exit(0);
