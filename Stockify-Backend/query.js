import 'dotenv/config';
import { db } from './db/sql.js';

async function test() {
  try {
    const users = await db.query('SELECT * FROM users ORDER BY id DESC LIMIT 10');
    console.log('USERS:', users.rows);
    const wallets = await db.query('SELECT * FROM wallet_accounts ORDER BY id ASC LIMIT 5');
    console.log('WALLETS:', wallets.rows);
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
test();
