import express from "express"
import admin from "./admin.js"
const router=express.Router()
router.post("/", async (req, res) => {
  try {
    console.log("login called------------------");

    const { token } = req.body;

    console.log("token received:", token ? "YES" : "NO");

    const expiresIn = 5000*60*60;

    // Verify token to get UID
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Check if user exists in the SQL database
    const { db } = await import("../db/sql.js");
    const userRes = await db.query(`SELECT id FROM users WHERE uid = $1`, [decodedToken.uid]);
    
    if (userRes.rows.length === 0) {
      console.warn(`User ${decodedToken.uid} not found in database. Auto-creating user...`);
      const email = decodedToken.email || "";
      const name = decodedToken.name || email.split("@")[0] || "User";
      
      const insertRes = await db.query(
        `INSERT INTO users (uid, email, name) VALUES ($1, $2, $3) RETURNING id`,
        [decodedToken.uid, email, name]
      );
      
      const newUserId = insertRes.rows[0].id;
      
      // Initialize wallets
      await db.query(`INSERT INTO wallet_accounts (user_id, available_balance, account_type) VALUES ($1, 0, 'LIVE')`, [newUserId]);
      await db.query(`INSERT INTO wallet_accounts (user_id, available_balance, account_type) VALUES ($1, 1000000, 'SIM')`, [newUserId]);
    }

    const sessionCookie = await admin
      .auth()
      .createSessionCookie(token, { expiresIn });

    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("session", sessionCookie, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax"
    });

    res.send({ status: "logged in" });

  } catch (err) {
    console.log("LOGIN ERROR:", err); // 👈 IMPORTANT
    res.status(401).send("Unauthorized");
  }
});

router.post("/logout", async (req, res) => {
  try {
    const sessionCookie = req.cookies?.session;

    if (!sessionCookie) {
      return res.send({ status: "Already logged out" });
    }

    // 🔐 Decode session
    const decoded = await admin.auth().verifySessionCookie(sessionCookie);

    // ⭐ OPTIONAL — revoke all refresh tokens for this user
    await admin.auth().revokeRefreshTokens(decoded.uid);

    // 🧹 Clear cookie
    res.clearCookie("session", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax"
    });

    res.send({ status: "Logged out" });

  } catch (err) {
        // still clear cookie even if verification fails

    res.clearCookie("session");
    res.send({ status: "Logged out" });
  }
});

router.get("/checkLogin", async (req, res) => {
  const sessionCookie = req.cookies.session || "";
  if (!sessionCookie) {
    return res.status(401).json({ status: "inactive" });
  }
  try {
    const decodedClaims = await admin.auth().verifySessionCookie(sessionCookie, true);
    res.json({ status: "active", user: decodedClaims });
  } catch (error) {
    res.status(401).json({ status: "inactive" });
  }
});

export default router
