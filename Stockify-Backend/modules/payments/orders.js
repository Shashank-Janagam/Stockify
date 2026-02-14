import { db } from "../../db/sql.js";
import redis from "../../cache/redisClient.js";

export async function createOrderRecord({ orderId, userId, amount }) {
  await db.query(
    `
    INSERT INTO payment_orders (order_id, user_id, amount, status)
    VALUES ($1, $2, $3, 'CREATED')
    `,
    [orderId, userId, amount]
  );
}

export async function markOrderSuccess({ orderId, paymentId }) {
  const res = await db.query(
    `
    UPDATE payment_orders
    SET status = 'SUCCESS',
        payment_id = $2,
        updated_at = NOW()
    WHERE order_id = $1
      AND status != 'SUCCESS'
    RETURNING *
    `,
    [orderId, paymentId]
  );
  return res.rows[0] || null;
}

export async function incrementWalletBalance(userId, amount) {
  // 1️⃣ Update Balance (wallet_accounts)
  console.log("Crediting wallet for user:", userId, "amount:", amount);
  await db.query(
    `UPDATE wallet_accounts SET available_balance = available_balance + $1, updated_at = NOW() AT TIME ZONE 'Asia/Kolkata' WHERE user_id = $2`,
    [amount, userId]
  );

  // 2️⃣ Invalidate Redis Cache (using UID)
  const userRes = await db.query(`SELECT uid FROM users WHERE id=$1`, [userId]);
  if (userRes.rows.length > 0) {
      const uid = userRes.rows[0].uid;
      await redis.del(`wallet:balance:${uid}`);
      console.log(`✅ Invalidated cache for uid: ${uid}`);
  }
}

export async function addUserTransaction({
  userId,
  type, // 'DEPOSIT' usually
  title, // 'Wallet Deposit'
  amount
}) {
  // Use wallet_transactions schema with explicit UTC timestamp
  await db.query(
    `
    INSERT INTO wallet_transactions
    (user_id, reference_type, transaction_type, amount, balance_after, created_at)
    VALUES 
    ($1, 'DEPOSIT', 'DEPOSIT', $2, (SELECT available_balance FROM wallet_accounts WHERE user_id=$1), NOW() AT TIME ZONE 'Asia/Kolkata')
    `,
    [userId, amount]
  );
}
