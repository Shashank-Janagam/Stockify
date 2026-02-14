import { db } from "../db/sql.js";

export async function getUserId(uid, name = "Trader", email = null) {
  const res = await db.query(`SELECT id FROM users WHERE uid = $1`, [uid]);
  if (res.rows.length > 0) {
    return res.rows[0].id;
  }
  
  // Create User
  const insertRes = await db.query(
    `INSERT INTO users (uid, name, email) VALUES ($1, $2, $3) RETURNING id`,
    [uid, name, email]
  );
  const userId = insertRes.rows[0].id;

  // Create Wallet Account
  await db.query(
    `INSERT INTO wallet_accounts (user_id, available_balance, blocked_balance) VALUES ($1, 0, 0)`,
    [userId]
  );
  
  return userId;
}

export async function getStockId(symbol, client = db) {
    // Try find
    const res = await client.query(`SELECT id FROM stocks WHERE symbol = $1`, [symbol]);
    if (res.rows.length > 0) return res.rows[0].id;

    // We assume caller handles insertion if missing, OR we insert minimal record here.
    // However, insertion requires name/exchange.
    // We'll return null if not found, letting caller handle fetching info from Yahoo and inserting.
    return null;
}
