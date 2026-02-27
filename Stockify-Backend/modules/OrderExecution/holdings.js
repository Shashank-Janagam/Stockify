import express from "express";
import requireAuth from "../../Middleware/requireAuth.js";
import admin from "../../Middleware/admin.js";
import { db } from "../../db/sql.js";
import YahooFinance from "yahoo-finance2";

const router = express.Router();
const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

/* ─────────────────────────────────────────────
   HELPER 1 — fetch positions from DB
   Called ONCE per SSE connection (or per REST request).
───────────────────────────────────────────── */
async function fetchPositions(userId) {
  const { rows: positions } = await db.query(
    `
    SELECT
      s.symbol,
      s.stock_name as name,
      SUM(p.remaining_quantity) as quantity,
      SUM(p.remaining_quantity * p.entry_price) / NULLIF(SUM(p.remaining_quantity), 0) as avg_price,
      MIN(p.created_at) as created_at
    FROM positions p
    JOIN stocks s ON p.stock_id = s.id
    WHERE p.user_id = $1
      AND p.status = 'OPEN'
    GROUP BY s.symbol, s.stock_name
    HAVING SUM(p.remaining_quantity) > 0
    `,
    [userId]
  );
  return positions;
}

/* ─────────────────────────────────────────────
   HELPER 2 — fetch live prices + compute PnL
   Called on EVERY tick — NO database queries.
───────────────────────────────────────────── */
async function computePayload(positions) {
  if (positions.length === 0) {
    return {
      summary: {
        investedValue: 0,
        currentValue: 0,
        totalReturns: 0,
        totalReturnsPercent: 0,
        dayReturns: 0,
        dayReturnsPercent: 0
      },
      holdings: []
    };
  }

  const symbols = positions.map(r => r.symbol);
  const quotesRaw = await yahoo.quote(symbols);
  const quotes = Array.isArray(quotesRaw) ? quotesRaw : [quotesRaw];
  const quoteMap = {};
  for (const q of quotes) {
    if (q?.symbol) quoteMap[q.symbol] = q;
  }

  let investedValue = 0;
  let currentValue = 0;
  let dayReturns = 0;
  const holdings = [];

  for (const pos of positions) {
    const symbol = pos.symbol;
    const quantity = Number(pos.quantity);
    const avgPrice = Number(pos.avg_price);

    const quote = quoteMap[symbol] || quoteMap[`${symbol}.NS`]; // Fallback
    const currentPrice = quote?.regularMarketPrice ?? 0;
    const dayChangePercent = quote?.regularMarketChangePercent ?? 0;
    const dayChangePerShare = quote?.regularMarketChange ?? 0;
    const name = pos.name;

    const invested = quantity * avgPrice;
    const current = quantity * currentPrice;
    const pnl = current - invested;

    investedValue += invested;
    currentValue += current;
    dayReturns += quantity * dayChangePerShare;

    holdings.push({
      symbol,
      name,
      datetime: pos.created_at,
      quantity,
      currentPrice,
      dayChangePercent: Number(dayChangePercent.toFixed(2)),
      invested: Number(invested.toFixed(2)),
      current: Number(current.toFixed(2)),
      pnl: Number(pnl.toFixed(2)),
      pnlPercent: invested > 0 ? Number(((pnl / invested) * 100).toFixed(2)) : 0
    });
  }

  const totalReturns = currentValue - investedValue;
  const previousValue = currentValue - dayReturns;

  return {
    summary: {
      investedValue: Number(investedValue.toFixed(2)),
      currentValue: Number(currentValue.toFixed(2)),
      totalReturns: Number(totalReturns.toFixed(2)),
      totalReturnsPercent:
        investedValue > 0
          ? Number(((totalReturns / investedValue) * 100).toFixed(2))
          : 0,
      dayReturns: Number(dayReturns.toFixed(2)),
      dayReturnsPercent:
        previousValue > 0
          ? Number(((dayReturns / previousValue) * 100).toFixed(2))
          : 0
    },
    holdings
  };
}

/* ─────────────────────────────────────────────
   REST — one-shot snapshot (kept for compat)
───────────────────────────────────────────── */
router.get("/stocks", async (req, res) => {
  try {
     const token = req.query.token;
  if (!token) return res.status(401).end();

  const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;

    // 1️⃣ Resolve User
    const userRes = await db.query(`SELECT id FROM users WHERE uid=$1`, [uid]);
    if (userRes.rows.length === 0)
      return res.json({
        summary: { investedValue: 0, currentValue: 0, totalReturns: 0, totalReturnsPercent: 0 },
        holdings: []
      });
    const userId = userRes.rows[0].id;

    // 2️⃣ DB + prices in one shot
    const positions = await fetchPositions(userId);
    const payload = await computePayload(positions);
    res.json(payload);
  } catch (err) {
    console.error("Holdings error:", err);
    res.status(500).json({ error: "Failed to load holdings" });
  }
});

/* ─────────────────────────────────────────────
   SSE — live stream, pushes every 30 seconds
   ✅ DB queried ONCE on connect
   ✅ Only Yahoo prices re-fetched on each tick
───────────────────────────────────────────── */
router.get("/stocks/stream", async (req, res) => {
  // ── Inline token auth (EventSource can't send headers) ──
  const token = req.query.token;
  if (!token) {
    res.status(401).end("Unauthorized");
    return;
  }

  let uid;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    uid = decoded.uid;
  } catch (err) {
    console.error("SSE auth failed:", err.message);
    res.status(401).end("Unauthorized");
    return;
  }

  // ── Resolve user & load positions from DB — happens only ONCE ──
  const userRes = await db.query(`SELECT id FROM users WHERE uid=$1`, [uid]);
  if (userRes.rows.length === 0) {
    res.status(404).end();
    return;
  }
  const positions = await fetchPositions(userRes.rows[0].id);

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // ── Each tick: only fetch live prices, no DB call ──
  const send = async () => {
    try {
      const payload = await computePayload(positions);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (err) {
      console.error("SSE holdings error:", err);
    }
  };

  // Send immediately on connect, then every 1.5 s
  await send();
  const interval = setInterval(send, 3500);

  // Cleanup when client disconnects
  req.on("close", () => {
    clearInterval(interval);
    res.end();
  });
});

router.get("/orders", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Resolve User
    const userRes = await db.query(`SELECT id FROM users WHERE uid=$1`, [uid]);
    if (userRes.rows.length === 0) return res.json([]);
    const userId = userRes.rows[0].id;

    const { rows } = await db.query(
      `
      SELECT
        o.id,
        s.symbol,
        s.stock_name as name,
        o.side,
        o.quantity,
        o.price,
        o.status,
        o.created_at,
        o.sell_type,
        t.realized_pnl
      FROM orders o
      JOIN stocks s ON o.stock_id = s.id
      LEFT JOIN trades t ON o.id = t.order_id
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [userId, limit, offset]
    );

    const enrichedRows = rows.map(r => ({
        ...r,
        name: r.name || r.symbol,
        total_price: Number(r.quantity) * Number(r.price),
        sell_type: r.sell_type || 'REGULAR',
        created_at_ist: r.created_at // Frontend expects this key
    }));

    res.json(enrichedRows);
  } catch (err) {
    console.error("Orders error:", err);
    res.status(500).json({ error: "Failed to load orders" });
  }
});

export default router;
