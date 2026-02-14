import express from "express";
import requireAuth from "../../Middleware/requireAuth.js";
import { db } from "../../db/sql.js";

const router = express.Router();

/**
 * GET /api/transactions
 * Returns latest 50 wallet transactions for logged-in user
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;

    // 1️⃣ Resolve User ID
    const userRes = await db.query(`SELECT id FROM users WHERE uid=$1`, [uid]);
    if (userRes.rows.length === 0) return res.json([]);
    const userId = userRes.rows[0].id;

    // 2️⃣ Query Transactions with JOINS
    const result = await db.query(
      `
      SELECT
        wt.id,
        wt.transaction_type,
        wt.reference_type,
        wt.amount,
        wt.balance_after,
        wt.created_at,
        t.side,
        t.quantity,
        t.price,
        s.symbol,
        s.stock_name
      FROM wallet_transactions wt
      LEFT JOIN trades t ON (wt.reference_type = 'TRADE' AND wt.reference_id = t.id)
      LEFT JOIN stocks s ON t.stock_id = s.id
      WHERE wt.user_id = $1
      ORDER BY wt.created_at DESC
      LIMIT 50
      `,
      [userId]
    );

    // 3️⃣ Map to Frontend Format
    const mappedData = result.rows.map(txn => {
        let frontendType = 'DEBIT';
        const tType = txn.transaction_type;
        
        if (tType === 'DEPOSIT' || tType === 'SELL' || tType === 'REFUND' || tType === 'CREDIT') {
            frontendType = 'CREDIT';
        }

        let title = `${tType} - ${txn.reference_type || ''}`;
        
        // Detailed Description for Trades
        if (txn.symbol && txn.side) {
            const action = txn.side === 'BUY' ? 'Bought' : 'Sold';
            title = `${action} ${txn.stock_name || txn.symbol}`;
        } else if (tType === 'DEPOSIT') {
             title = 'Wallet Deposit';
        }

        return {
            id: txn.id,
            type: frontendType, 
            title: title,
            amount: Number(txn.amount),
            balance_after: Number(txn.balance_after),
            created_at: txn.created_at, // Send IST timestamp as-is
            
            // Extra info for frontend if needed
            symbol: txn.symbol,
            details: txn.symbol ? `${txn.quantity} @ ${txn.price}` : null
        };
      });
    
    console.log('🕐 Backend sending timestamp:', mappedData[0]?.created_at);
    res.json(mappedData);

  } catch (err) {
    console.error("Fetch transactions error:", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

export default router;
