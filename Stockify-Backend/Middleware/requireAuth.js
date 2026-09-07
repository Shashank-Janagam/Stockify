import admin from "./admin.js";
import { db } from "../db/sql.js";

export default async function requireAuth(req, res, next) {
  try {
    // 1. Dev / MCP header authentication
    if (
      req.headers['x-bypass-auth'] === 'true' ||
      req.headers['x-user-id'] ||
      req.headers['x-user-uid'] ||
      req.headers['x-user-email'] ||
      req.body?.bypass_auth === true
    ) {
      const headerUserId = req.headers['x-user-id'] || req.headers['x-user-uid'] || req.query?.user_id;
      const headerEmail = req.headers['x-user-email'] || req.query?.user_email;

      let userRes = null;
      if (headerUserId) {
        if (!isNaN(headerUserId) && !headerUserId.toString().includes("-") && headerUserId.toString().length < 10) {
          userRes = await db.query(`SELECT id, uid, name, email FROM users WHERE id = $1`, [Number(headerUserId)]);
        } else {
          userRes = await db.query(`SELECT id, uid, name, email FROM users WHERE uid = $1`, [headerUserId]);
        }
      } else if (headerEmail) {
        userRes = await db.query(`SELECT id, uid, name, email FROM users WHERE email = $1`, [headerEmail]);
      } else {
        userRes = await db.query(`SELECT id, uid, name, email FROM users WHERE id = 3`);
      }

      if (userRes && userRes.rows.length > 0) {
        req.user = {
          uid: userRes.rows[0].uid,
          name: userRes.rows[0].name,
          email: userRes.rows[0].email
        };
      } else {
        req.user = {
          uid: headerUserId || "default_uid",
          name: "Trader",
          email: headerEmail || "trader@paperbull.com"
        };
      }
      return next();
    }

    const sessionCookie = req.cookies?.session;

    if (!sessionCookie) {
      return res.status(401).send("Unauthorized");
    }

    const decoded = await admin
      .auth()
      .verifySessionCookie(sessionCookie, true);

    req.user = decoded;
    next();

  } catch(err) {
    res.status(401).send("Unauthorized");
  }
}

