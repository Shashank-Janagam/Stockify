import express from "express";
import requireAuth from "../../Middleware/requireAuth.js";
import { db } from "../../db/sql.js";
import YahooFinance from "yahoo-finance2";

const router = express.Router();
const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
router.get("/stocks", requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;

    /* =========================
       1️⃣ NET HOLDINGS
    ========================= */
    const { rows: netRows } = await db.query(
      `
      SELECT
        symbol,
        SUM(
          CASE
            WHEN side = 'BUY' THEN quantity
            WHEN side = 'SELL' THEN -quantity
          END
        ) AS quantity
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
      [uid]
    );

    if (netRows.length === 0) {
      return res.json({
        summary: {
          investedValue: 0,
          currentValue: 0,
          totalReturns: 0,
          totalReturnsPercent: 0
        },
        holdings: []
      });
    }

    const symbols = netRows.map(r => r.symbol);

    /* =========================
       2️⃣ ALL BUY LOTS (ONCE)
    ========================= */
    const { rows: buyRows } = await db.query(
      `
      SELECT
        symbol,
        buy_price_per_share,
        quantity
      FROM user_stocks
      WHERE firebase_uid = $1
        AND side = 'BUY'
        AND status = 'EXECUTED'
      ORDER BY created_at ASC
      `,
      [uid]
    );

    // Group BUY lots by symbol
    const buysBySymbol = {};
    for (const row of buyRows) {
      if (!buysBySymbol[row.symbol]) {
        buysBySymbol[row.symbol] = [];
      }
      buysBySymbol[row.symbol].push(row);
    }

    /* =========================
       3️⃣ LIVE PRICES
    ========================= */
    const quotesRaw = await yahoo.quote(symbols);
    const quotes = Array.isArray(quotesRaw) ? quotesRaw : [quotesRaw];

    const quoteMap = {};
    for (const q of quotes) {
      if (q?.symbol) quoteMap[q.symbol] = q;
    }

    let investedValue = 0;
    let currentValue = 0;
    const holdings = [];

    /* =========================
       4️⃣ FIFO PnL PER STOCK
    ========================= */
    for (const row of netRows) {
      const symbol = row.symbol;
      const totalQuantity = Number(row.quantity);

      const quote = quoteMap[symbol];
      const currentPrice = quote?.regularMarketPrice ?? 0;
      const dayChangePercent = quote?.regularMarketChangePercent ?? 0;
      const name = quote?.shortName || quote?.longName || symbol;

      const buys = buysBySymbol[symbol] || [];

      let remainingQty = totalQuantity;
      let invested = 0;
      let pnl = 0;

      for (const lot of buys) {
        if (remainingQty <= 0) break;

        const qty = Math.min(lot.quantity, remainingQty);

        invested += qty * lot.buy_price_per_share;
        pnl += qty * (currentPrice - lot.buy_price_per_share);

        remainingQty -= qty;
      }

      const current = totalQuantity * currentPrice;

      investedValue += invested;
      currentValue += current;

      holdings.push({
        symbol: symbol,
        name,
        quantity: totalQuantity,
        currentPrice,

        dayChangePercent: Number(dayChangePercent.toFixed(2)),
        invested: Number(invested.toFixed(2)),
        current: Number(current.toFixed(2)),
        pnl: Number(pnl.toFixed(2)),
        pnlPercent:
          invested > 0
            ? Number(((pnl / invested) * 100).toFixed(2))
            : 0
      });
    }

    const totalReturns = currentValue - investedValue;

    res.json({
      summary: {
        investedValue: Number(investedValue.toFixed(2)),
        currentValue: Number(currentValue.toFixed(2)),
        totalReturns: Number(totalReturns.toFixed(2)),
        totalReturnsPercent:
          investedValue > 0
            ? Number(((totalReturns / investedValue) * 100).toFixed(2))
            : 0
      },
      holdings
    });

  } catch (err) {
    console.error("Holdings error:", err);
    res.status(500).json({ error: "Failed to load holdings" });
  }
});


export default router;
