import { getDb } from "../../db/mongo.js";
import  redis  from "../../cache/redisClient.js"
import { ObjectId } from "mongodb";

export async function createOrderRecord({ orderId, userId, amount }) {
  const db = getDb();

  await db.collection("orders").insertOne({
    orderId,
    userId,
    amount,
    status: "CREATED",
    createdAt: new Date(),
  });
}

export async function markOrderSuccess({ orderId, paymentId ,session}) {
  const db = getDb();

  const order = await db.collection("orders").findOne({ orderId },{session});

  if (!order ) return null;

  if (order.status === "SUCCESS") {
    return order; // already processed
  }

  await db.collection("orders").updateOne(
    { orderId },
    {
      $set: {
        status: "SUCCESS",
        paymentId,
        updatedAt: new Date(),
      },
    },
    {session}
  );

  return { ...order, status: "SUCCESS", paymentId };
}


export async function incrementWalletBalance(userId, amount,session) {
  const db = getDb();
  console.log("UPDATING WALLET");
console.log("INCREMENT PID:", process.pid);

  // 1️⃣ Update MongoDB and get updated wallet
  const result = await db.collection("wallets").findOneAndUpdate(
    { userId },
    {
      $inc: { cash: amount },
      $set: { updatedAt: new Date() },
      $setOnInsert: {
        blocked: 0,
        currency: "INR",
        createdAt: new Date(),
      },
    },
    {
      upsert: true,
      returnDocument: "after",
      session
    }
  );
  const redisKey = `wallet:balance:${userId}`;
  console.log("redis fromorders:",redisKey)

  redis.del(redisKey)

}
export async function addUserTransaction({
  userId,
  type,            // "CREDIT" | "DEBIT"
  title,           // "Wallet Deposit", "Paid for Stocks"
  amount,
  session,
}) {
  const db = getDb();

  const txn = {
    _id: new ObjectId(),
    type,
    title,
    amount,
    createdAt: new Date(),
  };

  await db.collection("users").updateOne(
    { _id: userId },
    {
      $push: {
        transactions: {
          $each: [txn],
          $slice: -1000, // keep last 1000 txns
        },
      },
    },
    {session}
  );

  return txn;
}