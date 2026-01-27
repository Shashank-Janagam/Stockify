import express from "express";
import crypto from "crypto";
import { getDb } from "../../db/mongo.js";
import {
  markOrderSuccess,
  incrementWalletBalance,
  addUserTransaction,
} from "../payments/orders.js";

const router = express.Router();

router.post("/razorpay", async (req, res) => {
  const db = getDb();
  const session = db.client.startSession();

  try {
    /* =========================
       1️⃣ VERIFY WEBHOOK SIGNATURE
    ========================= */
    console.log("verifying from webhooks")
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    const expected = crypto
      .createHmac("sha256", webhookSecret)
      .update(req.body) // 🔥 RAW BUFFER
      .digest("hex");

    if (expected !== signature) {
      return res.status(400).send("Invalid signature");
    }

    const event = JSON.parse(req.body.toString());

    if (event.event !== "payment.captured") {
      return res.json({ ok: true });
    }

    const payment = event.payload.payment.entity;
    const orderId = payment.order_id;
    const amount = payment.amount / 100;

    /* =========================
       2️⃣ START TRANSACTION
    ========================= */
    session.startTransaction();

    const order = await db.collection("orders").findOne(
      { orderId },
      { session }
    );

    // Idempotency
    if (!order || order.status === "SUCCESS") {
      await session.abortTransaction();
      return res.json({ ok: true });
    }

    /* =========================
       3️⃣ ATOMIC OPERATIONS
    ========================= */

    await markOrderSuccess(
      {
        orderId,
        paymentId: payment.id,
      },
      session
    );

    await incrementWalletBalance(
      order.userId,
      amount,
      session
    );

    await addUserTransaction(
      {
        userId: order.userId,
        type: "CREDIT",
        title: "Wallet Deposit",
        amount,
      },
      session
    );

    /* =========================
       4️⃣ COMMIT
    ========================= */
    await session.commitTransaction();

    /* =========================
       5️⃣ POST-COMMIT SIDE EFFECTS
    ========================= */
    // Redis invalidation MUST be after commit

    console.log("✅ Wallet credited via webhook");

    res.json({ success: true });

  } catch (err) {
    /* =========================
       🔥 ROLLBACK
    ========================= */
    if (session.inTransaction()) {
    await session.abortTransaction(); // ✅ only abort if active
  }
    console.error("Webhook rollback:", err);

    res.status(500).json({ success: false });
  } finally {
    await session.endSession();
  }
});

export default router;
