// routes/explore.routes.js
import express from "express";
import { MultiStockYahoo } from "./multiStockIndia.js";
import admin from "../../Middleware/admin.js";
import crypto from "crypto";
import {  getNSETopGainers} from "./multiCurrentMovers.js";
const router = express.Router();

let clients = new Map();
let pollingInterval = null;
let isStopped = false; // 🔒 GUARD FLAG

/* -------------------------
   HARD STOP SSE (ONCE)
------------------------- */
function stopSSE(finalData = null) {
  isStopped = true;

  console.log("🛑 Stopping SSE completely");

  for (const [, res] of clients) {
    try {
      // ✅ SEND FINAL DATA ONCE
      if (finalData) {
        res.write(`data: ${JSON.stringify(finalData)}\n\n`);
      }
        isStopped = false;


      // ❌ HARD CLOSE
      res.end();
    } catch {}
  }

  clients.clear();

  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }

  console.log("✅ SSE fully stopped");
}


/* -------------------------
   ROUTE
------------------------- */
router.get("/", async (req, res) => {
    isStopped = false
    console.log("explore sse called")

 const mostTradedList = [
  "HDFCBANK.NS",
  "TCS.NS",
  "INFY.NS",
  "ITC.NS"
];
// const moversList = await getNSETopGainers();
const moversList = [
  "ADANIENT.NS",
  "TATAMOTORS.NS",
  "ONGC.NS",
  "RELIANCE.NS",
    "TCS.NS",
    "INFY.NS",
    "HDFCBANK.NS",
    "ICICIBANK.NS",
    "SBIN.NS",
    "ITC.NS",

];

console.log("most traded-------------------------:", moversList);
    const token = req.query.token;
    if (!token) return res.status(401).end();
    const decodedToken = await admin.auth().verifyIdToken(token);

  try {
    console.log("user verified for explore sse")
    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const clientId = crypto.randomUUID();
    clients.set(clientId, res);
    console.log("🟢 Client connected:", clientId);


    if (!pollingInterval && !isStopped) {
      pollingInterval = setInterval(async () => {
        try {
          // 🔥 FETCH IN PARALLEL
          const [mostTraded, movers] = await Promise.all([
            MultiStockYahoo(mostTradedList),
            MultiStockYahoo(moversList)
          ]);

          const payload = { mostTraded, movers };

          const marketState = mostTraded[0]?.marketState;

          // ❌ MARKET CLOSED → SEND ONCE & STOP
          if (marketState !== "REGULAR") {

            console.log("🛑 Market closed — stopping SSE");
            stopSSE(payload);
            return;
          }

          // 🔄 Broadcast
          for (const [, c] of clients) {
            c.write(`data: ${JSON.stringify(payload)}\n\n`);
          }
        } catch (err) {
          console.error("Polling error:", err);
          stopSSE();
        }
      }, 1000);
    }

    req.on("close", () => {
      clients.delete(clientId);
      console.log("❌ Client disconnected:", clientId);

      if (clients.size === 0) stopSSE();
    });
  } catch {
    res.status(401).end();
  }
});



// routes/recent.routes.js
import { getDb } from "../../db/mongo.js";
router.get("/recent", async (req, res) => {
  console.log("🟢 recent sse called");

  const token = req.query.token;
  if (!token) return res.status(401).end();

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log("✅ user verified for recent SSE");

    /* -------------------------
       FETCH USER RECENTS
    ------------------------- */
    const db = getDb();
    const users = db.collection("users");

    const user = await users.findOne(
      { _id: decodedToken.uid },
      { projection: { recentlyViewed: 1 } }
    );

    const recent = user?.recentlyViewed || [];

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    // 🔥 ROUTE-LOCAL STATE (KEY FIX)
    let interval = null;
    let stopped = false;

    res.write(`event: connected\ndata: {}\n\n`);

    // 🟡 No recents → send once & close
    if (recent.length === 0) {
      res.write(`data: ${JSON.stringify({ recent: [] })}\n\n`);
      res.end();
      return;
    }

    const symbols = recent.map(r => r.symbol);

    interval = setInterval(async () => {
      if (stopped) return;

      try {
        const quotes = await MultiStockYahoo(symbols);
        if (!quotes || quotes.length === 0) return;

        const marketState = quotes[0]?.marketState;

        // ❌ MARKET CLOSED → SEND ONCE & STOP
        if (marketState !== "REGULAR") {
          console.log("🛑 market closed — stopping recent SSE");
          res.write(`data: ${JSON.stringify({ recent: quotes })}\n\n`);
          res.end();
          stopped = true;
          clearInterval(interval);
          return;
        }

        // 🔄 STREAM
        res.write(`data: ${JSON.stringify({ recent: quotes })}\n\n`);

      } catch (err) {
        console.error("recent polling error:", err);
        stopped = true;
        clearInterval(interval);
        res.end();
      }
    }, 1000);

    req.on("close", () => {
      console.log("❌ recent client disconnected");
      stopped = true;
      clearInterval(interval);
    });

  } catch (err) {
    console.error("recent auth error:", err);
    res.status(401).end();
  }
});




export default router;
