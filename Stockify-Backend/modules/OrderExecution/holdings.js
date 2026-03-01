import express from "express";
import requireAuth from "../../Middleware/requireAuth.js";
import admin from "../../Middleware/admin.js";
import { db } from "../../db/sql.js";
import YahooFinance from "yahoo-finance2";
import redis from "../../cache/redisClient.js";

const router = express.Router();
const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

/* ──────────────────────────────────────────────────────────
   HOLDINGS (AGGREGATED BY SYMBOL)
────────────────────────────────────────────────────────── */

async function fetchHoldings(userId) {
  const { rows: positions } = await db.query(
    `SELECT
      s.symbol,
      s.stock_name as name,
      SUM(p.remaining_quantity) as quantity,
      SUM(p.remaining_quantity * p.entry_price) / NULLIF(SUM(p.remaining_quantity), 0) as avg_price,
      MIN(p.created_at) as created_at,
      COALESCE((
        SELECT SUM(o.quantity) 
        FROM orders o 
        WHERE o.user_id = $1 AND o.stock_id = s.id AND o.status = 'PENDING' AND o.side = 'SELL' AND o.sell_type = 'Delivery'
      ), 0) as allocated_qty,
      (
        SELECT MAX(o.stop_trigger_price)
        FROM orders o
        WHERE o.user_id = $1 AND o.stock_id = s.id AND o.status = 'PENDING' AND o.side = 'SELL' AND o.sell_type = 'Delivery'
      ) as stop_loss
    FROM positions p
    JOIN stocks s ON p.stock_id = s.id
    WHERE p.user_id = $1
      AND p.status = 'OPEN'
      AND p.sell_type = 'Delivery'
    GROUP BY s.symbol, s.stock_name, s.id
    HAVING SUM(p.remaining_quantity) > 0`,
    [userId]
  );
  return positions;
}

async function computeHoldingsPayload(holdings) {
  if (holdings.length === 0) {
    return {
      summary: { investedValue: 0, currentValue: 0, totalReturns: 0, totalReturnsPercent: 0, dayReturns: 0, dayReturnsPercent: 0 },
      holdings: []
    };
  }

  const symbols = holdings.map(r => r.symbol);
  const quotesRaw = await yahoo.quote(symbols);
  const quotes = Array.isArray(quotesRaw) ? quotesRaw : [quotesRaw];
  const quoteMap = {};
  quotes.forEach(q => { if (q?.symbol) quoteMap[q.symbol] = q; });

  let investedValue = 0, currentValue = 0, dayReturns = 0;
  const enriched = holdings.map(pos => {
    const symbol = pos.symbol;
    const qty = Number(pos.quantity);
    const avg = Number(pos.avg_price);
    const quote = quoteMap[symbol] || quoteMap[`${symbol}.NS`];
    const ltp = quote?.regularMarketPrice ?? 0;
    const dayChangePerc = quote?.regularMarketChangePercent ?? 0;
    const dayChange = quote?.regularMarketChange ?? 0;

    const invested = qty * avg;
    const current = qty * ltp;
    const pnl = current - invested;

    investedValue += invested;
    currentValue += current;
    dayReturns += qty * dayChange;

    return {
      symbol, name: pos.name, datetime: pos.created_at, quantity: qty,
      avgPrice: avg,
      currentPrice: ltp, dayChangePercent: Number(dayChangePerc.toFixed(2)),
      invested: Number(invested.toFixed(2)), current: Number(current.toFixed(2)),
      pnl: Number(pnl.toFixed(2)), pnlPercent: invested > 0 ? Number(((pnl / invested) * 100).toFixed(2)) : 0,
      allocatedQty: Number(pos.allocated_qty || 0),
      stopLoss: pos.stop_loss ? Number(pos.stop_loss) : null
    };
  });

  const totalPnL = currentValue - investedValue;
  const prevValue = currentValue - dayReturns;

  const finalHoldings = enriched.map(h => ({
    ...h,
    allocationPercent: currentValue > 0 ? Number(((h.current / currentValue) * 100).toFixed(2)) : 0
  }));

  return {
    summary: {
      investedValue: Number(investedValue.toFixed(2)),
      currentValue: Number(currentValue.toFixed(2)),
      totalReturns: Number(totalPnL.toFixed(2)),
      totalReturnsPercent: investedValue > 0 ? Number(((totalPnL / investedValue) * 100).toFixed(2)) : 0,
      dayReturns: Number(dayReturns.toFixed(2)),
      dayReturnsPercent: prevValue > 0 ? Number(((dayReturns / prevValue) * 100).toFixed(2)) : 0
    },
    holdings: finalHoldings
  };
}

/* ──────────────────────────────────────────────────────────
   POSITIONS (DETAILED LOTS)
────────────────────────────────────────────────────────── */

async function fetchDetailedPositions(userId) {
  const { rows } = await db.query(
    `SELECT
      p.id, s.symbol, s.stock_name as name,
      p.sell_type as product_type, p.position_type,
      p.remaining_quantity as quantity, p.entry_price,
      p.created_at as opened_at,
      COALESCE((
        SELECT SUM(o.quantity) 
        FROM orders o 
        WHERE o.user_id = $1 AND o.stock_id = s.id AND o.status = 'PENDING' AND o.side = 'SELL' AND o.sell_type = p.sell_type
      ), 0) as allocated_qty,
      (
        SELECT MAX(o.stop_trigger_price)
        FROM orders o
        WHERE o.user_id = $1 AND o.stock_id = s.id AND o.status = 'PENDING' AND o.side = 'SELL' AND o.sell_type = p.sell_type
      ) as stop_loss
    FROM positions p
    JOIN stocks s ON p.stock_id = s.id
    WHERE p.user_id = $1 AND p.status = 'OPEN' AND p.remaining_quantity > 0
    ORDER BY p.created_at DESC`,
    [userId]
  );
  return rows;
}

async function computePositionsPayload(lots) {
  if (lots.length === 0) {
    return {
      summary: { investedValue: 0, currentValue: 0, totalReturns: 0, totalReturnsPercent: 0, dayReturns: 0, dayReturnsPercent: 0 },
      positions: []
    };
  }

  const symbols = [...new Set(lots.map(l => l.symbol))];
  const quotesRaw = await yahoo.quote(symbols);
  const quotes = Array.isArray(quotesRaw) ? quotesRaw : [quotesRaw];
  const quoteMap = {};
  quotes.forEach(q => { if (q?.symbol) quoteMap[q.symbol] = q; });

  let investedValue = 0, currentValue = 0, dayReturns = 0;
  const positions = lots.map(lot => {
    const qty = Number(lot.quantity);
    const entry = Number(lot.entry_price);
    const quote = quoteMap[lot.symbol] || quoteMap[`${lot.symbol}.NS`];
    const ltp = quote?.regularMarketPrice ?? 0;
    const dayChangePerc = quote?.regularMarketChangePercent ?? 0;
    const dayChange = quote?.regularMarketChange ?? 0;

    const invested = qty * entry;
    const current = qty * ltp;
    const pnl = current - invested;

    investedValue += invested;
    currentValue += current;
    dayReturns += qty * dayChange;

    return {
      id: lot.id, symbol: lot.symbol, name: lot.name,
      productType: lot.product_type, positionType: lot.position_type,
      quantity: qty, entryPrice: entry, ltp,
      dayChangePercent: Number(dayChangePerc.toFixed(2)),
      invested: Number(invested.toFixed(2)), currentValue: Number(current.toFixed(2)),
      unrealizedPnl: Number(pnl.toFixed(2)), unrealizedPnlPct: entry > 0 ? Number(((pnl / invested) * 100).toFixed(2)) : 0,
      stoplossEnabled: Number(lot.allocated_qty || 0) > 0 || !!lot.stop_loss,
      stopLoss: lot.stop_loss ? Number(lot.stop_loss) : null,
      stopLossQty: Number(lot.allocated_qty || 0),
      openedAt: lot.opened_at
    };
  });

  const totalPnL = currentValue - investedValue;
  const prevValue = currentValue - dayReturns;

  return {
    summary: {
      investedValue: Number(investedValue.toFixed(2)),
      currentValue: Number(currentValue.toFixed(2)),
      totalReturns: Number(totalPnL.toFixed(2)),
      totalReturnsPercent: investedValue > 0 ? Number(((totalPnL / investedValue) * 100).toFixed(2)) : 0,
      dayReturns: Number(dayReturns.toFixed(2)),
      dayReturnsPercent: prevValue > 0 ? Number(((dayReturns / prevValue) * 100).toFixed(2)) : 0
    },
    positions
  };
}

/* ──────────────────────────────────────────────────────────
   ENDPOINTS
────────────────────────────────────────────────────────── */

// 1. Holdings Stream
router.get("/stocks/stream", async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).end();
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const userRes = await db.query(`SELECT id FROM users WHERE uid=$1`, [decoded.uid]);
    if (userRes.rows.length === 0) return res.status(404).end();
    const userId = userRes.rows[0].id;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = async () => {
      try {
        const holdings = await fetchHoldings(userId);
        const payload = await computeHoldingsPayload(holdings);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch (err) { console.error("SSE Error:", err); }
    };

    await send();
    const interval = setInterval(send, 4000);
    req.on("close", () => clearInterval(interval));
  } catch (e) { res.status(401).end(); }
});

// 2. Positions Stream
router.get("/positions/stream", async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).end();
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const userRes = await db.query(`SELECT id FROM users WHERE uid=$1`, [decoded.uid]);
    if (userRes.rows.length === 0) return res.status(404).end();
    const userId = userRes.rows[0].id;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const send = async () => {
      try {
        const lots = await fetchDetailedPositions(userId);
        const payload = await computePositionsPayload(lots);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch (err) { console.error("SSE Pos Error:", err); }
    };

    await send();
    const interval = setInterval(send, 4000);
    req.on("close", () => clearInterval(interval));
  } catch (e) { res.status(401).end(); }
});

// 3. Orders history
router.get("/orders", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const userRes = await db.query(`SELECT id FROM users WHERE uid=$1`, [uid]);
    if (userRes.rows.length === 0) return res.json([]);
    const userId = userRes.rows[0].id;

    const { rows } = await db.query(
      `SELECT
         o.id, s.symbol, s.stock_name AS name,
         o.side, o.order_type, o.quantity, o.price,
         o.stop_trigger_price, o.status, o.category, o.sell_type,
         o.created_at, o.executed_at, o.updated_at,
         t.realized_pnl
       FROM orders o
       JOIN stocks s ON o.stock_id = s.id
       LEFT JOIN trades t ON o.id = t.order_id
       WHERE o.user_id = $1 AND o.status != 'PENDING'
       ORDER BY o.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    res.json(rows.map(r => ({
      ...r,
      name: r.name || r.symbol,
      total_price: r.price ? Number(r.quantity) * Number(r.price) : null,
      sell_type: r.sell_type || 'Delivery',
      category: r.category || 'REGULAR',
      created_at_ist: r.created_at,
      updated_at_ist: r.updated_at,
      executed_at_ist: r.executed_at,
    })));
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

// 4. Pending Stoploss
router.get("/pending-stoploss", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const userRes = await db.query(`SELECT id FROM users WHERE uid=$1`, [uid]);
    if (userRes.rows.length === 0) return res.json([]);
    const userId = userRes.rows[0].id;

    const { rows } = await db.query(
      `SELECT o.id, s.symbol, s.stock_name as name, o.side, o.order_type,
              o.quantity, o.stop_trigger_price, o.sell_type, o.status,
              o.created_at, o.updated_at
       FROM orders o
       JOIN stocks s ON o.stock_id = s.id
       WHERE o.user_id = $1 AND o.status = 'PENDING'
       ORDER BY o.created_at DESC`,
      [userId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

// 5. Cancel Stoploss
router.delete("/cancel-stoploss/:id", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const { id } = req.params;
    const userRes = await db.query(`SELECT id FROM users WHERE uid=$1`, [uid]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "User not found" });
    const userId = userRes.rows[0].id;

    const resOrder = await db.query(
      `UPDATE orders SET status = 'CANCELLED', updated_at = NOW() AT TIME ZONE 'Asia/Kolkata'
       WHERE id = $1 AND user_id = $2 AND status = 'PENDING'
       RETURNING id`,
      [id, userId]
    );

    if (resOrder.rows.length > 0) {
      await redis.publish("CANCEL_STOPLOSS", JSON.stringify({ orderId: id }));
      return res.json({ success: true });
    }
    res.status(404).json({ error: "Order not found or not pending" });
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

// 6. Edit Stoploss
router.patch("/edit-stoploss/:id", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    const { id } = req.params;
    const { stop_trigger_price } = req.body;
    
    const userRes = await db.query(`SELECT id FROM users WHERE uid=$1`, [uid]);
    const userId = userRes.rows[0].id;

    const resOrder = await db.query(
      `UPDATE orders SET stop_trigger_price = $1, updated_at = NOW() AT TIME ZONE 'Asia/Kolkata'
       WHERE id = $2 AND user_id = $3 AND status = 'PENDING'
       RETURNING id, stop_trigger_price`,
      [stop_trigger_price, id, userId]
    );

    if (resOrder.rows.length > 0) {
      await redis.publish("UPDATE_STOPLOSS", JSON.stringify({ orderId: id, stop_trigger_price }));
      return res.json(resOrder.rows[0]);
    }
    res.status(404).json({ error: "Not found" });
  } catch (err) { res.status(500).json({ error: "Failed" }); }
});

export default router;
