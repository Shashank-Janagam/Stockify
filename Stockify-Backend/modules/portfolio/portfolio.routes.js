import express from "express";
import requireAuth from "../../Middleware/requireAuth.js";
import { db } from "../../db/sql.js";
import yahooFinance from "yahoo-finance2";

const router = express.Router();

/**
 * GET /api/portfolio/summary
 * Returns portfolio summary:
 * - Invested Value (Cost Basis of Open Positions)
 * - Current Value (Market Value of Open Positions)
 * - Unrealized PnL (Current PnL)
 * - Realized PnL (Net Profit from Closed Trades)
 * - Total PnL (Realized + Unrealized)
 * - Day Returns
 */
router.get("/summary", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    // Resolve User ID from UID
    const userRes = await db.query('SELECT id FROM users WHERE uid = $1', [uid]);
    if (userRes.rows.length === 0) return res.json({ summary: { investedValue: 0, currentValue: 0, realizedPnL: 0, unrealizedPnL: 0, totalPnL: 0, dayReturns: 0, dayReturnsPercent: 0, totalReturns: 0, totalReturnsPercent: 0 }, holdings: [], chartData: [] });
    const userId = userRes.rows[0].id;
   

    // 1️⃣ Calculate Cash Flow (Buy/Sell) from Wallet Transactions
    // Get Sum of BUY and SELL for ref_type='TRADE'
    // transaction_type might be 'BUY'/'SELL' or 'DEBIT'/'CREDIT' depending on refactor Step 635?
    // Step 635 refactor used 'transaction_type' (BUY, SELL, DEPOSIT, WITHDRAW).
    // And 'reference_type' (TRADE).
    
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

    // 2️⃣ Get Open Positions (Invested Value)
    // Join with stocks to get Name and Symbol (Positions table uses stock_id)
    const posRes = await db.query(
      `SELECT s.symbol, s.stock_name as name, p.remaining_quantity, p.entry_price 
       FROM positions p
       JOIN stocks s ON p.stock_id = s.id
       WHERE p.user_id = $1 AND p.remaining_quantity > 0`,
      [userId]
    );

    let investedOpen = 0;
    let currentOpen = 0;
    let dayReturns = 0;
    const holdings = [];

    console.log(`[Portfolio] UserId: ${userId}`);
    console.log(`[Portfolio] Open Positions (Rows): ${posRes.rowCount}`);
    if (posRes.rowCount > 0) {
        console.log(`[Portfolio] First Row Sample:`, posRes.rows[0]);
    }

    // Fetch batch quotes for open positions
    const symbols = [...new Set(posRes.rows.map(p => p.symbol))];
    let quoteMap = {};
    if (symbols.length > 0) {
      try {
        const quotes = await yahooFinance.quote(symbols.map(s => s.endsWith(".NS") ? s : `${s}.NS`));
        if (Array.isArray(quotes)) {
            quotes.forEach(q => { if(q && q.symbol) quoteMap[q.symbol] = q; });
        } else if (quotes) {
            quoteMap[quotes.symbol] = quotes;
        }
      } catch (e) {
          console.error("Yahoo fetch error:", e.message);
      }
    }

    for (const pos of posRes.rows) {
        const qty = Number(pos.remaining_quantity);
        const cost = Number(pos.entry_price);
        
        const invested = qty * cost;
        investedOpen += invested;

        const q = quoteMap[pos.symbol] || quoteMap[`${pos.symbol}.NS`];
        let currentPrice = q?.regularMarketPrice;
        
        // Fallback to cost if price is missing or invalid
        if (currentPrice === undefined || currentPrice === null || isNaN(currentPrice)) {
            currentPrice = cost;
        }

        const dayChange = q?.regularMarketChange || 0;
        const dayChangePercent = q?.regularMarketChangePercent || 0;

        const current = qty * currentPrice;
        currentOpen += current;
        dayReturns += qty * dayChange;

        const pnl = current - invested;
        const pnlPercent = invested > 0 ? (pnl / invested) * 100 : 0;

        holdings.push({
            symbol: pos.symbol,
            name: pos.name || pos.symbol,
            quantity: qty,
            currentPrice: Number(currentPrice),
            dayChangePercent: Number(dayChangePercent.toFixed(2)),
            invested: Number(invested.toFixed(2)),
            current: Number(current.toFixed(2)),
            pnl: Number(pnl.toFixed(2)),
            pnlPercent: Number(pnlPercent.toFixed(2))
        });
    }

    // DEBUG: Check for NaNs
    if (isNaN(currentOpen)) { console.error("CurrentOpen is NaN!"); currentOpen = 0; }
    if (isNaN(investedOpen)) { console.error("InvestedOpen is NaN!"); investedOpen = 0; }

    // 3️⃣ Calculate PnL (Realized from Trades)
    const realizedRes = await db.query(
        `SELECT SUM(realized_pnl) as total_pnl FROM trades WHERE user_id = $1`,
        [userId]
    );
    const realizedPnL = Number(realizedRes.rows[0]?.total_pnl || 0);
    
    // Monthly Realized PnL
    const monthlyRes = await db.query(
        `SELECT SUM(realized_pnl) as total FROM trades WHERE user_id = $1 AND created_at >= date_trunc('month', CURRENT_DATE)`,
        [userId]
    );
    const monthlyRealizedPnL = Number(monthlyRes.rows[0]?.total || 0);
    const unrealizedPnL = currentOpen - investedOpen;
    
    const unrealizedReturnPercent = investedOpen > 0 ? (unrealizedPnL / investedOpen) * 100 : 0;
    // const dayReturnsPercent = (currentOpen - dayReturns) > 0 ? (dayReturns / (currentOpen - dayReturns)) * 100 : 0;


    // 5️⃣ Chart Data (Cumulative Realized PnL)
    const chartRes = await db.query(`
        SELECT realized_pnl, created_at
        FROM trades
        WHERE user_id = $1 AND realized_pnl IS NOT NULL
        ORDER BY created_at ASC
    `, [userId]);

    let runningPnL = 0;
    const chartData = chartRes.rows.map(r => {
        runningPnL += Number(r.realized_pnl || 0);
        return {
            date: r.created_at,
            value: Number(runningPnL.toFixed(2))
        };
    });
    
    // Add initial 0 point if empty
    if (chartData.length === 0) chartData.push({ date: new Date(), value: 0 });

    // 6️⃣ Calculate Lifetime Invested (Total Buy Value)
    const lifetimeInvestedRes = await db.query(
        `SELECT SUM(price * quantity) as total_invested 
         FROM trades 
         WHERE user_id = $1 AND side = 'BUY'`,
        [userId]
    );
    const lifetimeInvested = Number(lifetimeInvestedRes.rows[0]?.total_invested || 0);

    const totalPnL = realizedPnL + unrealizedPnL;
    const totalValue = lifetimeInvested + totalPnL; // Lifetime Value (Principal + PnL)

    // Percentages
    const currentReturnsPercent = investedOpen > 0 ? ((currentOpen - investedOpen) / investedOpen) * 100 : 0;
    const totalReturnsPercent = lifetimeInvested > 0 ? ((totalValue - lifetimeInvested) / lifetimeInvested) * 100 : 0;
    
    res.json({
        summary: {
            currentInvested: Number(investedOpen.toFixed(2)),
            currentValue: Number(currentOpen.toFixed(2)),
            currentReturnsPercent: Number(currentReturnsPercent.toFixed(2)),
            
            totalInvested: Number(lifetimeInvested.toFixed(2)),
            totalValue: Number(totalValue.toFixed(2)),
            totalReturnsPercent: Number(totalReturnsPercent.toFixed(2)),

            realizedPnL: Number(realizedPnL.toFixed(2)), // Keep just in case
            monthlyRealizedPnL: Number(monthlyRealizedPnL.toFixed(2)),
        },
        holdings,
        chartData
    });




  } catch (err) {
    console.error("Portfolio Summary Error:", err);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

/**
 * GET /api/portfolio/history
 * Returns trade history (Orders/Trades)
 */
router.get("/history", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    
    const userRes = await db.query('SELECT id FROM users WHERE uid = $1', [uid]);
    if (userRes.rows.length === 0) return res.json([]);
    const userId = userRes.rows[0].id;
    
    // Fetch Orders (History)
    // Orders table uses stock_id, so we must join stocks table.
    // Note: 'status' column might be missing in some schemas, using 'order_type' or assuming EXECUTED if purely history log.
    // We try to select common columns.
    
    const detailedResult = await db.query(
        `SELECT 
            o.id, 
            s.symbol, 
            s.stock_name as name, 
            o.side, 
            o.quantity, 
            o.price, 
            o.order_type as status, 
            o.updated_at as created_at, 
            (o.quantity * o.price) as total_price
         FROM orders o
         JOIN stocks s ON o.stock_id = s.id
         WHERE o.user_id = $1
         ORDER BY o.updated_at DESC`,
        [userId]
    );

    res.json(detailedResult.rows);

  } catch (err) {
    console.error("Portfolio History Error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

export default router;
