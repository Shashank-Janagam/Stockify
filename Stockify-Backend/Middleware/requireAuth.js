import admin from "./admin.js";
export default async function requireAuth(req, res, next) {
  try {
    const sessionCookie = req.cookies.session;

    if (!sessionCookie) {
      return res.status(401).send("Unauthorized");
    }

    const decoded = await admin
      .auth()
      .verifySessionCookie(sessionCookie, true);

    req.user = decoded;
    next();

  } catch(err) {
    console.log("Unauthorised-------------------------------------",err)
    res.status(401).send("Unauthorized");
  }
}

