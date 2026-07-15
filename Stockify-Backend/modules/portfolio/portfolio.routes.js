import express from "express";
import requireAuth from "../../Middleware/requireAuth.js";
import { db } from "../../db/sql.js";
import YahooFinance from "yahoo-finance2";
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
import { calculateVWAP, calculateBullScore, calculateDynamicCap, calculateMVOAllocation, calculateEqualWeightAllocation, calculateHRPAllocation } from "./algorithms.js";
import { calculateVaR, calculateBeta, calculateSharpeRatio } from "../ai/risk.js";
import redis from "../../cache/redisClient.js";
import { resolveStockSector } from "../stocks/sectorResolver.js";

const router = express.Router();

/* ─── Redis helpers ─── */
const CACHE_TTL = 60 * 60; // 1 hour

async function getCache(key) {
  try {
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
}

async function setCache(key, data, ttl = CACHE_TTL) {
  try {
    await redis.setex(key, ttl, JSON.stringify(data));
  } catch {}
}

async function delCache(key) {
  try { await redis.del(key); } catch {}
}

/**
 * GET /api/portfolio/live-stats
 * ─────────────────────────────────────────────────────────────
 * NEVER cached. Always fetches live Yahoo Finance prices.
 * Returns the bare minimum for the Layer 1 hero numbers:
 *   currentValue, currentInvested, unrealisedPnL, unrealisedPc,
 *   dayChange, dayChangePercent, realizedPnL
 */
router.get("/live-stats", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const userRes = await db.query('SELECT id FROM users WHERE uid = $1', [uid]);
    if (userRes.rows.length === 0) {
      return res.json({ currentValue: 0, currentInvested: 0, unrealisedPnL: 0, unrealisedPc: 0, dayChange: 0, dayChangePercent: 0, realizedPnL: 0 });
    }
    const userId = userRes.rows[0].id;

    // Open positions only
    const posRes = await db.query(
      `SELECT s.symbol, p.remaining_quantity, p.entry_price
       FROM positions p JOIN stocks s ON p.stock_id = s.id
       WHERE p.user_id = $1 AND p.status = 'OPEN'`,
      [userId]
    );

    const symbols = [...new Set(posRes.rows.map(r => r.symbol))];

    // Group into symbol → {qty, entryValue}
    const posMap = {};
    posRes.rows.forEach(p => {
      if (!posMap[p.symbol]) posMap[p.symbol] = { qty: 0, entryValue: 0 };
      posMap[p.symbol].qty        += Number(p.remaining_quantity);
      posMap[p.symbol].entryValue += Number(p.remaining_quantity) * Number(p.entry_price);
    });

    let quoteMap = {};
    if (symbols.length > 0) {
      try {
        const quotes = await yahooFinance.quote(symbols.map(s => s.endsWith(".NS") ? s : `${s}.NS`));
        if (Array.isArray(quotes)) quotes.forEach(q => { if (q?.symbol) quoteMap[q.symbol] = q; });
        else if (quotes?.symbol) quoteMap[quotes.symbol] = quotes;
      } catch (e) { console.error("Live-stats Yahoo error:", e.message); }
    }

    let currentValue = 0, currentInvested = 0, dayChange = 0;
    symbols.forEach(sym => {
      const pos = posMap[sym];
      if (!pos || pos.qty <= 0) return;
      const avg  = pos.entryValue / pos.qty;
      const q    = quoteMap[sym] || quoteMap[`${sym}.NS`];
      const ltp  = q?.regularMarketPrice ?? avg;
      const chg  = q?.regularMarketChange ?? 0;
      currentValue    += pos.qty * ltp;
      currentInvested += pos.qty * avg;
      dayChange       += pos.qty * chg;
    });

    const realizedRes = await db.query(
      `SELECT SUM(realized_pnl) as total FROM trades WHERE user_id = $1`, [userId]
    );
    const realizedPnL    = Number(realizedRes.rows[0]?.total || 0);
    const unrealisedPnL  = currentValue - currentInvested;
    const unrealisedPc   = currentInvested > 0 ? (unrealisedPnL / currentInvested) * 100 : 0;
    const dayChgPc       = (currentValue - dayChange) > 0 ? (dayChange / (currentValue - dayChange)) * 100 : 0;

    res.json({
      currentValue:    Number(currentValue.toFixed(2)),
      currentInvested: Number(currentInvested.toFixed(2)),
      unrealisedPnL:   Number(unrealisedPnL.toFixed(2)),
      unrealisedPc:    Number(unrealisedPc.toFixed(2)),
      dayChange:       Number(dayChange.toFixed(2)),
      dayChangePercent:Number(dayChgPc.toFixed(2)),
      realizedPnL:     Number(realizedPnL.toFixed(2)),
      updatedAt:       new Date().toISOString(),
    });
  } catch (err) {
    console.error("Live-stats error:", err);
    res.status(500).json({ error: "Failed to fetch live stats" });
  }
});


router.get("/summary", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const cacheKey = `portfolio:summary:${uid}`;
    // ?fresh=1 → bust cache and recompute
    if (req.query.fresh === '1') {
      await delCache(cacheKey);
      console.log(`[Redis BUST] ${cacheKey}`);
    }
    const cached = await getCache(cacheKey);
    if (cached) {
      console.log(`[Redis HIT] ${cacheKey}`);
      return res.json(cached);
    }
    console.log(`[Redis MISS] ${cacheKey}`);

    // Resolve User ID from UID
    const userRes = await db.query('SELECT id FROM users WHERE uid = $1', [uid]);
    if (userRes.rows.length === 0) {
      const empty = { summary: { investedValue: 0, currentValue: 0, realizedPnL: 0, unrealizedPnL: 0, totalPnL: 0, dayReturns: 0, dayReturnsPercent: 0, totalReturns: 0, totalReturnsPercent: 0 }, holdings: [], chartData: [] };
      return res.json(empty);
    }
    const userId = userRes.rows[0].id;

    const cashFlowRes = await db.query(
      `SELECT 
         SUM(CASE WHEN transaction_type = 'BUY' THEN amount ELSE 0 END) as total_buy,
         SUM(CASE WHEN transaction_type = 'SELL' THEN amount ELSE 0 END) as total_sell
       FROM wallet_transactions
       WHERE user_id = $1 AND reference_type = 'TRADE'`,
      [userId]
    );

    const totalBuy = Number(cashFlowRes.rows[0]?.total_buy || 0);
    const totalSell = Number(cashFlowRes.rows[0]?.total_sell || 0);

    const posRes = await db.query(
      `SELECT s.symbol, s.stock_name as name, p.remaining_quantity, p.entry_price 
       FROM positions p
       JOIN stocks s ON p.stock_id = s.id
       WHERE p.user_id = $1 
         AND (p.status = 'OPEN' OR (p.status = 'CLOSED' AND p.updated_at >= CURRENT_DATE AT TIME ZONE 'Asia/Kolkata'))`,
      [userId]
    );

    const { rows: tradesToday } = await db.query(
      `SELECT s.symbol, t.side, t.quantity, t.price
       FROM trades t
       JOIN stocks s ON t.stock_id = s.id
       WHERE t.user_id = $1 AND t.created_at >= CURRENT_DATE AT TIME ZONE 'Asia/Kolkata'`,
      [userId]
    );

    const tradesMap = {};
    tradesToday.forEach(t => {
      if (!tradesMap[t.symbol]) tradesMap[t.symbol] = { boughtQty: 0, boughtValue: 0, soldQty: 0, soldValue: 0 };
      const qty = Number(t.quantity), val = qty * Number(t.price);
      if (t.side === 'BUY') { tradesMap[t.symbol].boughtQty += qty; tradesMap[t.symbol].boughtValue += val; }
      else if (t.side === 'SELL') { tradesMap[t.symbol].soldQty += qty; tradesMap[t.symbol].soldValue += val; }
    });

    let investedOpen = 0, currentOpen = 0, dayReturns = 0;
    const holdings = [];

    const symbolPositions = {};
    posRes.rows.forEach(pos => {
      if (!symbolPositions[pos.symbol]) symbolPositions[pos.symbol] = { symbol: pos.symbol, name: pos.name, quantity: 0, entryValue: 0 };
      symbolPositions[pos.symbol].quantity += Number(pos.remaining_quantity);
      symbolPositions[pos.symbol].entryValue += Number(pos.remaining_quantity) * Number(pos.entry_price);
    });

    const allSymbols = [...new Set([...posRes.rows.map(r => r.symbol), ...Object.keys(tradesMap)])];

    let quoteMap = {};
    if (allSymbols.length > 0) {
      try {
        const quotes = await yahooFinance.quote(allSymbols.map(s => s.endsWith(".NS") ? s : `${s}.NS`));
        if (Array.isArray(quotes)) quotes.forEach(q => { if (q && q.symbol) quoteMap[q.symbol] = q; });
        else if (quotes) quoteMap[quotes.symbol] = quotes;
      } catch (e) { console.error("Yahoo fetch error:", e.message); }
    }

    // Fetch sectors for all symbols in parallel
    let sectorMap = {};
    try {
      const sectorPromises = allSymbols.map(async (symbol) => {
        const pos = symbolPositions[symbol];
        const sectorName = await resolveStockSector(symbol, pos?.name || "");
        return { symbol, sector: sectorName };
      });
      const sectorResults = await Promise.all(sectorPromises);
      sectorResults.forEach(item => {
        sectorMap[item.symbol] = item.sector;
      });
    } catch (e) {
      console.error("Sector fetch error:", e.message);
    }

    allSymbols.forEach(symbol => {
      const pos = symbolPositions[symbol];
      const qty = pos ? pos.quantity : 0;
      const avg = pos && qty > 0 ? pos.entryValue / qty : 0;
      const q = quoteMap[symbol] || quoteMap[`${symbol}.NS`];
      const ltp = q?.regularMarketPrice ?? avg;
      const dayChange = q?.regularMarketChange || 0;
      const dayChangePercent = q?.regularMarketChangePercent || 0;
      const prevClose = q?.regularMarketPreviousClose ?? (ltp - dayChange);
      const tr = tradesMap[symbol] || { boughtQty: 0, boughtValue: 0, soldQty: 0, soldValue: 0 };
      const qtyYesterday = Math.max(0, qty - tr.boughtQty + tr.soldQty);
      const invested = qty * avg, current = qty * ltp, pnl = current - invested;
      const todayPnl = (current + tr.soldValue) - (qtyYesterday * prevClose + tr.boughtValue);
      investedOpen += invested; currentOpen += current; dayReturns += todayPnl;
      if (qty > 0) holdings.push({
        symbol, name: pos.name || symbol, quantity: qty,
        currentPrice: Number(ltp), dayChangePercent: Number(dayChangePercent.toFixed(2)),
        invested: Number(invested.toFixed(2)), current: Number(current.toFixed(2)),
        pnl: Number(pnl.toFixed(2)), pnlPercent: Number((invested > 0 ? (pnl / invested) * 100 : 0).toFixed(2)),
        sector: sectorMap[symbol] || "Others"
      });
    });

    if (isNaN(currentOpen)) currentOpen = 0;
    if (isNaN(investedOpen)) investedOpen = 0;

    const realizedRes = await db.query(`SELECT SUM(realized_pnl) as total_pnl FROM trades WHERE user_id = $1`, [userId]);
    const realizedPnL = Number(realizedRes.rows[0]?.total_pnl || 0);

    const monthlyRes = await db.query(
      `SELECT SUM(realized_pnl) as total FROM trades WHERE user_id = $1 AND created_at >= date_trunc('month', CURRENT_DATE)`, [userId]
    );
    const monthlyRealizedPnL = Number(monthlyRes.rows[0]?.total || 0);
    const unrealizedPnL = currentOpen - investedOpen;
    const unrealizedReturnPercent = investedOpen > 0 ? (unrealizedPnL / investedOpen) * 100 : 0;
    const dayReturnsPercent = (currentOpen - dayReturns) > 0 ? (dayReturns / (currentOpen - dayReturns)) * 100 : 0;

    const chartRes = await db.query(`
      SELECT realized_pnl, created_at FROM trades
      WHERE user_id = $1 AND realized_pnl IS NOT NULL ORDER BY created_at ASC
    `, [userId]);

    const chartData = [];
    let runningPnL = 0;
    chartRes.rows.forEach(r => {
      if (r.created_at) { runningPnL += Number(r.realized_pnl || 0); chartData.push({ date: r.created_at, value: Number(runningPnL.toFixed(2)) }); }
    });
    if (chartData.length === 0) chartData.push({ date: new Date().toISOString(), value: 0 });

    const lifetimeInvestedRes = await db.query(
      `SELECT SUM(price * quantity) as total_invested FROM trades WHERE user_id = $1 AND side = 'BUY'`, [userId]
    );
    const lifetimeInvested = Number(lifetimeInvestedRes.rows[0]?.total_invested || 0);
    const totalPnL = realizedPnL + unrealizedPnL;
    const totalValue = lifetimeInvested + totalPnL;
    const currentReturnsPercent = investedOpen > 0 ? ((currentOpen - investedOpen) / investedOpen) * 100 : 0;
    const totalReturnsPercent = lifetimeInvested > 0 ? ((totalValue - lifetimeInvested) / lifetimeInvested) * 100 : 0;

    const payload = {
      summary: {
        currentInvested: Number(investedOpen.toFixed(2)), currentValue: Number(currentOpen.toFixed(2)),
        currentReturnsPercent: Number(currentReturnsPercent.toFixed(2)),
        totalInvested: Number(lifetimeInvested.toFixed(2)), totalValue: Number(totalValue.toFixed(2)),
        totalReturnsPercent: Number(totalReturnsPercent.toFixed(2)),
        realizedPnL: Number(realizedPnL.toFixed(2)), monthlyRealizedPnL: Number(monthlyRealizedPnL.toFixed(2)),
        dayReturns: Number(dayReturns.toFixed(2)), dayReturnsPercent: Number(dayReturnsPercent.toFixed(2))
      },
      holdings,
      chartData
    };

    await setCache(cacheKey, payload, CACHE_TTL);
    res.json(payload);

  } catch (err) {
    console.error("Portfolio Summary Error:", err);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

/**
 * GET /api/portfolio/history
 */
router.get("/history", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    const userRes = await db.query('SELECT id FROM users WHERE uid = $1', [uid]);
    if (userRes.rows.length === 0) return res.json([]);
    const userId = userRes.rows[0].id;
    const detailedResult = await db.query(
      `SELECT o.id, s.symbol, s.stock_name as name, o.side, o.quantity, o.price,
              o.order_type as status, o.updated_at as created_at, (o.quantity * o.price) as total_price
       FROM orders o JOIN stocks s ON o.stock_id = s.id
       WHERE o.user_id = $1 ORDER BY o.updated_at DESC`, [userId]
    );
    res.json(detailedResult.rows);
  } catch (err) {
    console.error("Portfolio History Error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

/**
 * GET /api/portfolio/ai-eval
 * Cached per-user for 1 hour.
 */
router.get("/ai-eval", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const cacheKey = `portfolio:ai-eval:${uid}`;
    // ?fresh=1 → bust cache and recompute
    if (req.query.fresh === '1') {
      await delCache(cacheKey);
      console.log(`[Redis BUST] ${cacheKey}`);
    }
    const cached = await getCache(cacheKey);
    if (cached) { console.log(`[Redis HIT] ${cacheKey}`); return res.json(cached); }
    console.log(`[Redis MISS] ${cacheKey}`);


    const userRes = await db.query('SELECT id FROM users WHERE uid = $1', [uid]);
    if (userRes.rows.length === 0) return res.json({ bullScore: 0, winRate: 0, sharpeRatio: 0, dynamicCap: 10000, totalTrades: 0, totalClosed: 0 });
    const userId = userRes.rows[0].id;

    const tradesRes = await db.query('SELECT * FROM trades WHERE user_id = $1 ORDER BY created_at ASC', [userId]);
    const trades = tradesRes.rows;

    let totalWins = 0, totalClosed = 0;
    const returns = [];
    for (const t of trades) {
      if (t.realized_pnl != null) {
        totalClosed++;
        if (Number(t.realized_pnl) > 0) totalWins++;
        returns.push((Number(t.realized_pnl) / (Number(t.price) * Number(t.quantity))));
      }
    }

    const winRate = totalClosed > 0 ? (totalWins / totalClosed) * 100 : 0;
    const sharpe = calculateSharpeRatio(returns);
    const consistencyScore = 80;
    const activityScore = trades.length > 10 ? 90 : 50;
    const bullScore = calculateBullScore(winRate, sharpe, consistencyScore, activityScore);
    const baseCap = 100000;
    const dynamicCap = calculateDynamicCap(baseCap, trades);

    const payload = { bullScore, winRate: Number(winRate.toFixed(2)), sharpeRatio: sharpe, dynamicCap, totalTrades: trades.length, totalClosed };
    await setCache(cacheKey, payload, CACHE_TTL);
    res.json(payload);

  } catch (err) {
    console.error("AI Eval Error:", err);
    res.status(500).json({ error: "Failed to evaluate AI metrics" });
  }
});

/**
 * POST /api/portfolio/invalidate-cache
 * Call this after a trade executes to bust the 1hr cache immediately.
 */
router.post("/invalidate-cache", requireAuth, async (req, res) => {
  const { uid } = req.user;
  await delCache(`portfolio:summary:${uid}`);
  await delCache(`portfolio:ai-eval:${uid}`);
  await delCache(`portfolio:forecasts:${uid}`);
  console.log(`[Redis] Cache busted for user ${uid}`);
  res.json({ ok: true });
});

/**
 * GET /api/portfolio/forecasts
 * Cached per-user for 1 hour.
 */
router.get("/forecasts", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    const cacheKey = `portfolio:forecasts:${uid}`;
    // ?fresh=1 → bust cache and recompute
    if (req.query.fresh === '1') {
      await delCache(cacheKey);
      console.log(`[Redis BUST] ${cacheKey}`);
    }
    const cached = await getCache(cacheKey);
    if (cached) {
      console.log(`[Redis HIT] ${cacheKey}`);
      return res.json(cached);
    }
    console.log(`[Redis MISS] ${cacheKey}`);

    const userRes = await db.query('SELECT id FROM users WHERE uid = $1', [uid]);
    if (userRes.rows.length === 0) return res.json([]);
    const userId = userRes.rows[0].id;

    // Fetch open positions
    const posRes = await db.query(
      `SELECT s.symbol, s.stock_name as name, p.remaining_quantity, p.entry_price
       FROM positions p JOIN stocks s ON p.stock_id = s.id
       WHERE p.user_id = $1 AND p.status = 'OPEN'`,
      [userId]
    );

    const positions = posRes.rows;
    if (positions.length === 0) {
      return res.json([]);
    }

    const uniqueSymbols = [...new Set(positions.map(p => p.symbol))];

    // Fetch current prices from Yahoo to use as fallbacks if needed
    let quoteMap = {};
    if (uniqueSymbols.length > 0) {
      try {
        const quotes = await yahooFinance.quote(uniqueSymbols.map(s => s.endsWith(".NS") ? s : `${s}.NS`));
        if (Array.isArray(quotes)) {
          quotes.forEach(q => { if (q?.symbol) quoteMap[q.symbol] = q; });
        } else if (quotes?.symbol) {
          quoteMap[quotes.symbol] = quotes;
        }
      } catch (e) {
        console.error("Forecast quote fetch error:", e.message);
      }
    }

    // Call server1.py /portfolio-forecast endpoint in parallel — returns ForecastItem directly
    const forecastPromises = uniqueSymbols.map(async (symbol) => {
      const cleanSymbol = symbol.replace(".NS", "").replace(".BO", "");
      const yahooSymbol = symbol.endsWith(".NS") ? symbol : `${symbol}.NS`;
      const q = quoteMap[symbol] || quoteMap[yahooSymbol];
      const currentPrice = q?.regularMarketPrice || 0;

      try {
        // New endpoint returns exact ForecastItem shape — no mapping needed
        const response = await fetch(`http://127.0.0.1:8000/portfolio-forecast/${cleanSymbol}`, {
          signal: AbortSignal.timeout(120000) // 120 second timeout (LSTM training takes time)
        });

        if (response.ok) {
          const data = await response.json();
          // data is already { symbol, signal, target1D, target7D, uncertainty, narrative, confidence }
          return data;
        } else {
          const errText = await response.text().catch(() => "");
          console.warn(`LSTM server returned status ${response.status} for ${cleanSymbol}: ${errText}`);
        }
      } catch (err) {
        console.error(`Failed to fetch LSTM forecast for ${cleanSymbol}:`, err.message);
      }

      // Fallback dummy forecast based on Yahoo quote if LSTM server is down
      const randomShift = (Math.random() * 0.04 - 0.02);
      return {
        symbol: cleanSymbol,
        signal: "HOLD",
        target1D: Number((currentPrice * (1 + randomShift)).toFixed(2)),
        target7D: Number((currentPrice * (1 + randomShift * 2)).toFixed(2)),
        uncertainty: parseFloat((2.0 + Math.random() * 2).toFixed(1)),
        narrative: `Technical indicators consolidating. Volatility normal. (Engine Offline — Fallback)`,
        confidence: 50
      };
    });

    const forecasts = await Promise.all(forecastPromises);

    await setCache(cacheKey, forecasts, CACHE_TTL);
    res.json(forecasts);

  } catch (err) {
    console.error("Portfolio forecasts route error:", err);
    res.status(500).json({ error: "Failed to fetch AI forecasts" });
  }
});

/**
 * GET /api/portfolio/allocation
 */
router.get("/allocation", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    const userRes = await db.query('SELECT id FROM users WHERE uid = $1', [uid]);
    if (userRes.rows.length === 0) return res.json({ strategy: req.query.strategy || 'equal-weight', allocation: {} });
    const userId = userRes.rows[0].id;
    const posRes = await db.query(
      `SELECT s.symbol, p.remaining_quantity FROM positions p
       JOIN stocks s ON p.stock_id = s.id WHERE p.user_id = $1 AND p.status = 'OPEN'`, [userId]
    );
    const symbols = posRes.rows.map(r => r.symbol);
    const totalCapital = 100000;
    const strategy = req.query.strategy || 'equal-weight';
    const historicalPrices = {};
    symbols.forEach(s => historicalPrices[s] = [100, 102, 99, 105, 101]);
    let allocation;
    if (strategy === 'mvo') allocation = calculateMVOAllocation(symbols, historicalPrices, totalCapital);
    else if (strategy === 'hrp') allocation = calculateHRPAllocation(symbols, historicalPrices, totalCapital);
    else allocation = calculateEqualWeightAllocation(symbols, totalCapital);
    res.json({ strategy, allocation });
  } catch (err) {
    console.error("Allocation Error:", err);
    res.status(500).json({ error: "Failed to compute allocation" });
  }
});

export default router;
