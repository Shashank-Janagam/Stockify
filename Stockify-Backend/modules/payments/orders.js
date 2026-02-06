import { getDb } from "../../db/mongo.js";
import  redis  from "../../cache/redisClient.js"
import { ObjectId } from "mongodb";
import { db } from "../../db/sql.js";

export async function createOrderRecord({ orderId, userId, amount }) {
  await db.query(
    `
    INSERT INTO orders
    (order_id, firebase_uid, amount, status)
    VALUES ($1, $2, $3, 'CREATED')
    `,
    [orderId, userId, amount]
  );
}
export async function markOrderSuccess({ orderId, paymentId }) {
  const res = await db.query(
    `
    UPDATE orders
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
  const redisKey = `wallet:balance:${userId}`;

  await db.query("BEGIN");
  console.log(
    "Incrementing wallet balance for user:",
    userId,
    "by amount:",
    amount
  );

  // 1️⃣ Ensure wallet exists
  await db.query(
    `
    INSERT INTO wallets (firebase_uid, balance)
    VALUES ($1, 0)
    ON CONFLICT (firebase_uid) DO NOTHING
    `,
    [userId]
  );

  // 2️⃣ Update balance
  await db.query(
    `
    UPDATE wallets
    SET balance = balance + $1,
        updated_at = NOW()
    WHERE firebase_uid = $2
    `,
    [amount, userId]
  );

  await db.query("COMMIT");

  // 3️⃣ 🔥 Invalidate Redis cache (AFTER COMMIT)
  await redis.del(redisKey);
  console.log("🧹 Redis cache cleared:", redisKey);
}

import { v4 as uuid } from "uuid";

export async function addUserTransaction({
  userId,
  type,
  title,
  amount
}) {
  const txnId = uuid();

  await db.query(
    `
    INSERT INTO wallet_transactions
    (id, firebase_uid, type, title, amount)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [txnId, userId, type, title, amount]
  );

  return {
    id: txnId,
    userId,
    type,
    title,
    amount
  };
}
