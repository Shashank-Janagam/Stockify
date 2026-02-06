// routes/payment.routes.js
import express from "express";
import { razorpay } from "./razorpay.js";
import requireAuth from "../../Middleware/requireAuth.js";
const router = express.Router();
// modules/payments/payment.js
import { createOrderRecord ,incrementWalletBalance,markOrderSuccess,addUserTransaction} from "./orders.js";

router.post("/create-order",requireAuth, async (req, res) => {
  const { amount } = req.body;
  const userId = req.user.uid;

  const order = await razorpay.orders.create({
    amount: amount * 100,
    currency: "INR",
    receipt: `rcpt_${Date.now()}`,
  });

  // 🔥 THIS IS WHERE orders.js IS CALLED
  await createOrderRecord({
    orderId: order.id,
    userId,
    amount, // store rupees
  });

  res.json(order);
});

router.post("/verify", requireAuth,async (req, res) => {

  
  res.json({ success: true });

//   const session =getDb().client.startSession();

//   try{
//     session.startTransaction();
//   const {
//     razorpay_order_id,
//     razorpay_payment_id,
//     razorpay_signature,
//   } = req.body;

//   const body = `${razorpay_order_id}|${razorpay_payment_id}`;

//   const expectedSignature = createHmac(
//     "sha256",
//     process.env.RAZORPAY_KEY_SECRET
//   )
//     .update(body)
//     .digest("hex");

//   if (expectedSignature !== razorpay_signature) {
//     return res.status(400).json({ success: false });
//   }

//  const order = await markOrderSuccess({
//   orderId: razorpay_order_id,
//   paymentId: razorpay_payment_id,
// });



//  if (!order) {
//   return res.status(400).json({ success: false });
// }
//   await incrementWalletBalance(order.userId, order.amount);
//   await addUserTransaction({
//     userId: order.userId,
//     type: "CREDIT",
//     title: "Wallet Deposit",
//     amount: order.amount,
//   });


//   return res.json({ success: true });


//   }catch(err){
//     await session.abortTransaction();
//     console.error("Payment rollback:", err);
//     res.status(500).json({ success: false });

//   }finally {
//     await session.endSession();
//   }
});


export default router;
