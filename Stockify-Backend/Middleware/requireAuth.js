import admin from "./admin.js";

export default async function requireAuth(req, res, next) {
  try {
    // ✅ Allow CORS preflight
    if (req.method === "OPTIONS") {
      return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing auth token" });
    }

    // console.log("verified user")

    const token = authHeader.split("Bearer ")[1].trim();

    const decoded = await admin.auth().verifyIdToken(token);

    req.user = {
      uid: decoded.uid,
      name: decoded.name,
      email: decoded.email
    };

    // console.log("authorised", decoded.name);

    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    return res.status(401).json({ error: "Unauthorized" });
  }
}
