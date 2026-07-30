import express from "express";
import { db } from "../../db/sql.js";
import { getDb } from "../../db/mongo.js";
import requireAuth from "../../Middleware/requireAuth.js";

const router = express.Router();

// ── GET USER PROFILE ──
router.get("/profile", requireAuth, async (req, res) => {
  try {
    const { uid, name, email } = req.user;
    let userRes = await db.query(
      `SELECT id, name, email, "Mobile", telegram_chat_id, notify_email, notify_whatsapp, notify_telegram FROM users WHERE uid = $1`,
      [uid]
    );

    if (userRes.rows.length === 0) {
      // Lazy initialize user if not present in the DB
      await db.query("BEGIN");
      const insert = await db.query(
        `INSERT INTO users (uid, name, email) VALUES ($1, $2, $3) RETURNING id, name, email, "Mobile"`,
        [uid, name || 'Trader', email]
      );
      const userId = insert.rows[0].id;
      // Default Wallet Setup
      await db.query(`INSERT INTO wallet_accounts (user_id, available_balance) VALUES ($1, 0)`, [userId]);
      await db.query("COMMIT");
      
      return res.json({
        id: userId,
        name: insert.rows[0].name,
        email: insert.rows[0].email,
        mobile: insert.rows[0].Mobile || null,
        telegram_chat_id: null,
        notify_email: true,
        notify_whatsapp: true,
        notify_telegram: true
      });
    }

    const user = userRes.rows[0];
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.Mobile || null,
      telegram_chat_id: user.telegram_chat_id || null,
      notify_email: user.notify_email,
      notify_whatsapp: user.notify_whatsapp,
      notify_telegram: user.notify_telegram
    });
  } catch (err) {
    console.error("Get profile error:", err);
    res.status(500).json({ error: "Failed to get profile" });
  }
});

// ── UPDATE USER MOBILE NUMBER ──
router.post("/mobile", requireAuth, async (req, res) => {
  try {
    const { uid, name, email } = req.user;
    const { mobile } = req.body;

    if (mobile === undefined) {
      return res.status(400).json({ error: "Mobile number is required" });
    }

    // Lazy check user, create if doesn't exist, else update
    let userRes = await db.query(`SELECT id FROM users WHERE uid = $1`, [uid]);
    if (userRes.rows.length === 0) {
      await db.query("BEGIN");
      const insert = await db.query(
        `INSERT INTO users (uid, name, email, "Mobile") VALUES ($1, $2, $3, $4) RETURNING id`,
        [uid, name || 'Trader', email, mobile || null]
      );
      const userId = insert.rows[0].id;
      await db.query(`INSERT INTO wallet_accounts (user_id, available_balance) VALUES ($1, 0)`, [userId]);
      await db.query("COMMIT");
    } else {
      await db.query(
        `UPDATE users SET "Mobile" = $1 WHERE uid = $2`,
        [mobile || null, uid]
      );
    }

    res.json({
      success: true,
      mobile: mobile || null
    });
  } catch (err) {
    console.error("Update mobile error:", err);
    res.status(500).json({ error: "Failed to update mobile number" });
  }
});

// ── UPDATE NOTIFICATION PREFERENCES ──
router.post("/notifications", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const { type, value } = req.body;

    if (!['notify_email', 'notify_whatsapp', 'notify_telegram'].includes(type) || typeof value !== 'boolean') {
      return res.status(400).json({ error: "Invalid notification type or value" });
    }

    await db.query(
      `UPDATE users SET ${type} = $1 WHERE uid = $2`,
      [value, uid]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Update notifications error:", err);
    res.status(500).json({ error: "Failed to update notification preferences" });
  }
});

// ── FOLLOW STOCK ──
router.post("/follow", requireAuth, async (req, res) => {
  try {
    const { symbol, name } = req.body;
    const userId = req.user.uid;

    if (!symbol) return res.status(400).json({ error: "Symbol is required" });

    const dbMongo = getDb();
    const users = dbMongo.collection("users");

    const user = await users.findOne({ _id: userId }, { projection: { followedStocks: 1 } });
    const isFollowed = (user?.followedStocks || []).some(s => s.symbol === symbol);

    if (isFollowed) {
      // Unfollow
      await users.updateOne({ _id: userId }, { $pull: { followedStocks: { symbol } } });
      res.json({ isFollowed: false });
    } else {
      // Follow
      await users.updateOne(
        { _id: userId },
        { $push: { followedStocks: { symbol, name, followedAt: new Date() } } },
        { upsert: true }
      );
      res.json({ isFollowed: true });
    }
  } catch (err) {
    console.error("Follow stock error:", err);
    res.status(500).json({ error: "Failed to follow stock" });
  }
});

// ── CHECK FOLLOW STATUS ──
router.get("/follow/check", requireAuth, async (req, res) => {
  try {
    const { symbol } = req.query;
    const userId = req.user.uid;

    if (!symbol) return res.status(400).json({ error: "Symbol is required" });

    const dbMongo = getDb();
    const users = dbMongo.collection("users");

    const user = await users.findOne({ _id: userId }, { projection: { followedStocks: 1 } });
    const isFollowed = (user?.followedStocks || []).some(s => s.symbol === symbol);

    res.json({ isFollowed });
  } catch (err) {
    console.error("Check follow status error:", err);
    res.status(500).json({ error: "Failed to check follow status" });
  }
});

export default router;
