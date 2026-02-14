import express from "express";
import crypto from "crypto";
import { db } from "../../db/sql.js";
import {
  markOrderSuccess,
  incrementWalletBalance,
  addUserTransaction,
} from "./orders.js";

const router = express.Router();

router.post("/razorpay", async (req, res) => {
  try {
    /* =========================
       1️⃣ VERIFY WEBHOOK SIGNATURE
    ========================= */
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    const expected = crypto
      .createHmac("sha256", webhookSecret)
      .update(req.body) // RAW BUFFER (important)
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
       2️⃣ START SQL TRANSACTION
    ========================= */
    await db.query("BEGIN");

    // Fetch order (FOR UPDATE for idempotency + lock)
    const orderRes = await db.query(
      `
      SELECT order_id, user_id, status
      FROM payment_orders
      WHERE order_id = $1
      FOR UPDATE
      `,
      [orderId]
    );

    if (orderRes.rowCount === 0) {
      await db.query("ROLLBACK");
      return res.json({ ok: true });
    }

    const order = orderRes.rows[0];

    // Idempotency: already processed
    if (order.status === "SUCCESS") {
      await db.query("ROLLBACK");
      return res.json({ ok: true });
    }

    /* =========================
       3️⃣ ATOMIC OPERATIONS
    ========================= */

    // Mark order success
    await markOrderSuccess({
      orderId,
      paymentId: payment.id,
    });

    // Credit wallet
    console.log("Crediting wallet for user:", order.user_id, "amount:", amount);
    await incrementWalletBalance(order.user_id, amount);

    // Add wallet transaction
    await addUserTransaction({
      userId: order.user_id,
      type: "CREDIT",
      title: "Wallet Deposit",
      amount,
    });

    /* =========================
       4️⃣ COMMIT
    ========================= */
    await db.query("COMMIT");

    /* =========================
       5️⃣ POST-COMMIT SIDE EFFECTS
    ========================= */
    // (optional) Redis cache invalidation here

    console.log("✅ Wallet credited via Razorpay webhook");
    res.json({ success: true });

  } catch (err) {
    console.error("Webhook error:", err);
    await db.query("ROLLBACK");
    res.status(500).json({ success: false });
  }
});

export default router;
