import express from "express";
import crypto from "crypto";
import { razorpay } from "./razorpay.js";
import requireAuth from "../../Middleware/requireAuth.js";
import { createOrderRecord } from "./orders.js";
import { getUserId } from "../dbUtils.js"; // Import helper

const router = express.Router();

router.post("/create-order",requireAuth, async (req, res) => {
  const { amount } = req.body;
  const { uid, name, email } = req.user;

  try {
    // Resolve User ID (Int)
    const userId = await getUserId(uid, name, email);

    const order = await razorpay.orders.create({
        amount: amount * 100,
        currency: "INR",
        receipt: `rcpt_${Date.now()}`,
    });

    // Store in payment_orders
    await createOrderRecord({
        orderId: order.id,
        userId: userId, // Int
        amount, 
    });

    res.json(order);
  } catch (error) {
    console.error("Create Order Error:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

router.post("/verify", requireAuth, async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, error: "Missing payment fields" });
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      console.error("RAZORPAY_KEY_SECRET is not configured");
      return res.status(500).json({ success: false, error: "Payment config error" });
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature);
    const receivedBuffer = Buffer.from(razorpay_signature);

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      return res.status(400).json({ success: false, error: "Invalid signature" });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Payment verify error:", err);
    return res.status(500).json({ success: false });
  }
});

export default router;
