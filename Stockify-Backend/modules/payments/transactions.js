import express from "express";
import requireAuth from "../../Middleware/requireAuth.js";
import { getDb } from "../../db/mongo.js";

const router = express.Router();

/**
 * GET /api/transactions
 * Returns latest transactions for logged-in user
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.uid;

    const user = await db.collection("users").findOne(
      { _id: userId },
      {
        projection: {
          transactions: { $slice: -50 }, // latest 50
        },
      }
    );

    res.json(user?.transactions.reverse() ??[]);
  } catch (err) {
    console.error("Fetch transactions error:", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

export default router;
