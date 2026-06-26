import express from "express";
import { db } from "../../db/sql.js";
import requireAuth from "../../Middleware/requireAuth.js";

const router = express.Router();

// ── GET USER PROFILE ──
router.get("/profile", requireAuth, async (req, res) => {
  try {
    const { uid, name, email } = req.user;
    let userRes = await db.query(
      `SELECT id, name, email, "Mobile" FROM users WHERE uid = $1`,
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
        mobile: insert.rows[0].Mobile || null
      });
    }

    const user = userRes.rows[0];
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      mobile: user.Mobile || null
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

export default router;
