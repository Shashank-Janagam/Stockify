// routes/explore.routes.js
import express from "express";
import { MultiStockYahoo } from "./multiStockIndia.js";
import admin from "../../Middleware/admin.js";
import crypto from "crypto";
import {  getNSETopGainers} from "./multiCurrentMovers.js";
import {db} from "../../db/sql.js";
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
// const moversList = await getNSETopGainers();
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

    /* =========================
       DB + USER DATA
    ========================= */
    const dbMongo = getDb();
    const users = dbMongo.collection("users");

    const user = await users.findOne(
      { _id: decodedToken.uid },
      { projection: { recentlyViewed: 1 } }
    );

    const recentlyViewed = user?.recentlyViewed || [];

    /* =========================
       INVESTED SYMBOLS (NET QTY > 0)
    ========================= */
    const { rows: investedRows } = await db.query(
      `
      SELECT
        symbol
      FROM user_stocks
      WHERE firebase_uid = $1
        AND status = 'EXECUTED'
      GROUP BY symbol
      HAVING SUM(
        CASE
          WHEN side = 'BUY' THEN quantity
          WHEN side = 'SELL' THEN -quantity
        END
      ) > 0
      `,
      [decodedToken.uid]
    );

    const investedSymbols = investedRows.map(r => r.symbol);

    /* =========================
       SSE HEADERS
    ========================= */
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    let interval = null;
    let stopped = false;

    res.write(`event: connected\ndata: {}\n\n`);

    // 🟡 nothing to stream
    if (recentlyViewed.length === 0 && investedSymbols.length === 0) {
      res.write(
        `data: ${JSON.stringify({
          recentlyViewed: [],
          invested: []
        })}\n\n`
      );
      res.end();
      return;
    }

    const recentSymbols = recentlyViewed.map(r => r.symbol);
    const allSymbols = [...new Set([...recentSymbols, ...investedSymbols])];
    /* =========================
       POLLING LOOP
    ========================= */
    const fetchAndEmit = async () => {
      if (stopped) return;

      const quotes = await MultiStockYahoo(allSymbols);
      if (!quotes || quotes.length === 0) return;

      const marketState = quotes.find(q => q?.marketState)?.marketState;

      const recentQuotes = quotes.filter(q =>
        recentSymbols.includes(q.symbol)
      );

      const investedQuotes = quotes.filter(q =>
        investedSymbols.includes(q.symbol)
      );

      res.write(
        `data: ${JSON.stringify({
          recentlyViewed: recentQuotes,
          invested: investedQuotes
        })}\n\n`
      );

      // ❌ if market not regular, emit once and stop SSE
      if (marketState && marketState !== "REGULAR") {
        console.log("🛑 market not regular — sent snapshot once, stopping recent SSE");
        stopped = true;
        clearInterval(interval);
        res.end();
      }
    };

    try {
      await fetchAndEmit();
    } catch (err) {
      console.error("recent SSE error:", err);
      stopped = true;
      clearInterval(interval);
      res.end();
      return;
    }

    if (!stopped) {
      interval = setInterval(async () => {
        try {
          await fetchAndEmit();
        } catch (err) {
          console.error("recent SSE error:", err);
          stopped = true;
          clearInterval(interval);
          res.end();
        }
      }, 1000);
    }

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
