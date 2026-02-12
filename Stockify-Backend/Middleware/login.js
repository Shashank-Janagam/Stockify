import express from "express"
import admin from "./admin.js"
const router=express.Router()
router.post("/", async (req, res) => {
  try {
    console.log("login called------------------");

    const { token } = req.body;

    console.log("token received:", token ? "YES" : "NO");

    const expiresIn = 60 * 60 * 1000;

    const sessionCookie = await admin
      .auth()
      .createSessionCookie(token, { expiresIn });

    res.cookie("session", sessionCookie, {
      httpOnly: true,
      secure: true, // CHANGE THIS FOR LOCALHOST
      sameSite: "none"
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
    console.log("Logout error:", err);

    // still clear cookie even if verification fails
    res.clearCookie("session");
    res.send({ status: "Logged out" });
  }
});
export default router