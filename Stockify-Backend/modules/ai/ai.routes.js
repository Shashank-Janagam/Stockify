import express from 'express';
import redisClient from '../../cache/redisClient.js';
import requireAuth from '../../Middleware/requireAuth.js';
import { db } from '../../db/sql.js';

const router = express.Router();

router.post('/analyze-portfolio', requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    
    // 1. Resolve internal UserId from Firebase Uid
    const userRes = await db.query('SELECT id FROM users WHERE uid = $1', [uid]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: "User not found" });
    const userId = userRes.rows[0].id;

    // Check if valid cache exists in Redis (v3 schema with tags/keyInsight)
    const cacheKey = `ai_portfolio_v3_${userId}`;
    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
        return res.json(JSON.parse(cachedData));
    }

    const apiKey = process.env.LLM_API_KEY || process.env.GROK_API_KEY;
    if (!apiKey) {
        console.error("❌ AI reporting: Service unavailable (API key missing)");
        return res.status(503).json({
            error: "AI service unavailable",
            message: "API key is not configured on the server."
        });
    }

    // 2. Fetch Active Positions from DB
    const posRes = await db.query(
        `SELECT s.symbol, p.remaining_quantity as quantity, p.entry_price, p.position_type
         FROM positions p
         JOIN stocks s ON p.stock_id = s.id
         WHERE p.user_id = $1 AND p.remaining_quantity > 0`,
        [userId]
    );
    const activePositions = posRes.rows;

    // 3. Fetch Last 50 Historical Trades for Behavioral Analysis
    const historyRes = await db.query(
        `SELECT s.symbol, t.quantity, t.price, t.side, t.realized_pnl, t.created_at
         FROM trades t
         JOIN stocks s ON t.stock_id = s.id
         WHERE t.user_id = $1
         ORDER BY t.created_at DESC
         LIMIT 50`,
        [userId]
    );
    const historicalTrades = historyRes.rows;
    
    // 4. PRE-CALCULATE Performance Metrics (Ground Truth for AI)
    // Counts only SELLS for win rate denominator to avoid skewing by many small BUYs
    const statsRes = await db.query(
      `SELECT 
         COUNT(*) FILTER (WHERE side = 'SELL') as total_closed,
         COUNT(*) FILTER (WHERE side = 'SELL' AND realized_pnl > 0) as wins,
         AVG(realized_pnl) FILTER (WHERE side = 'SELL' AND realized_pnl > 0) as avg_win,
         AVG(ABS(realized_pnl)) FILTER (WHERE side = 'SELL' AND realized_pnl < 0) as avg_loss
       FROM trades 
       WHERE user_id = $1`,
      [userId]
    );
    const stats = statsRes.rows[0];
    const summaryStats = {
      realWinRate: stats.total_closed > 0 ? (Number(stats.wins) / Number(stats.total_closed)) * 100 : 0,
      totalTradesExecuted: stats.total_closed,
      avgWinAmount: Number(stats.avg_win || 0),
      avgLossAmount: Number(stats.avg_loss || 0),
      profitFactor: (stats.avg_loss > 0) ? (stats.avg_win / stats.avg_loss) : 0
    };

    const prompt = `
    You are an expert AI Behavioral Finance Analyst. Analyze the user's trading patterns based on their current open positions AND their historical trade data.
    Perform an IN-DEPTH analysis of their psychology, discipline, and risk management.

    PORTFOLIO PERFORMANCE SUMMARY (GROUND TRUTH):
    ${JSON.stringify(summaryStats)}

    CURRENT OPEN POSITIONS:
    ${JSON.stringify(activePositions)}

    HISTORICAL TRADES (Last 50):
    ${JSON.stringify(historicalTrades)}
    
    CRITICAL ANALYSIS REQUIREMENTS:
    1. Risk Scoring: Evaluate based on position sizing and stop-loss behavior from the trade history.
    2. Behavioral Detection:
       - Revenge Trading: Detect repeatedly trades in the same stock after a loss.
       - FOMO: Detect entry into stocks that have already peaked or are highly volatile (e.g. buying near intra-day highs).
       - Overtrading: Look for excessive trade frequency in the history.
    3. Performance Quality: Use the provided "realWinRate" from the Summary Stats. Do NOT calculate win rate from the raw trade list, as the trade list includes BUY orders which should not be in the denominator.
    4. INDIVIDUAL POSITION INSIGHTS: Create a detailed 1-line tactical insight for EVERY unique symbol in the current open positions.

    Respond STRICTLY with a valid JSON object matching this schema exactly. In the positionsAnalysis array, use pure stock symbols (without .NS or .BO suffixes):
    {
      "portfolioRiskScore": number (0-100),
      "riskCategory": "Conservative" | "Moderate" | "Aggressive",
      "emotionalFlags": {
        "revengeTrading": boolean,
        "fomo": boolean,
        "panicSelling": boolean,
        "overtrading": boolean
      },
      "behavioralMetrics": {
        "winRate": number (0-100),
        "avgHoldTime": string (e.g. "2 hours" or "5 days"),
        "disciplineScore": number (0-100)
      },
      "positionsAnalysis": [
        {
          "symbol": string (PURE SYMBOL, no .NS),
          "confidenceScore": number (0-100),
          "suggestion": "Hold" | "Reduce" | "Exit" | "Add",
          "riskLevel": "Low" | "Moderate" | "High",
          "keyInsight": string (max 5-7 actionable words),
          "tags": string[] (max 2 descriptive tags)
        }
      ],
      "overallAdvice": string (2-3 sentence tactical summary)
    }
    `;

    try {
        const baseUrl = process.env.LLM_BASE_URL || process.env.GROK_BASE_URL || "https://api.x.ai/v1";
        const modelName = process.env.LLM_MODEL || process.env.GROK_MODEL || "openai/gpt-oss-120b";
        
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: modelName,
                messages: [
                    { role: "user", content: prompt }
                ],
                response_format: { type: "json_object" },
                temperature: 0.1
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`LLM API returned status ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        let responseText = data.choices[0].message.content;

        // 🛡️ Sanitize: Strip potential markdown code blocks
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const analysis = JSON.parse(responseText);

        // Cache the result for 24 hours (86400 seconds)
        await redisClient.setex(cacheKey, 86400, JSON.stringify(analysis));

        return res.json(analysis);

    } catch (grokError) {
        console.error("LLM API Error:", grokError);
        return res.status(500).json({ 
            error: "Failed to generate AI analysis", 
            details: grokError.message 
        });
    }

  } catch (error) {
    console.error("Route error:", error);
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

export default router;
