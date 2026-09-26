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
        let modelName = process.env.LLM_MODEL || process.env.GROK_MODEL || "openai/gpt-oss-120b";
        
        // Auto-fix for Groq: if using Groq, 'openai/gpt-oss-120b' will fail. Use llama3-70b-8192 for complex analysis.
        if (baseUrl.includes('groq.com')) {
            modelName = "llama-3.3-70b-versatile";
        }
        
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

/* ═══════════════════════════════════════════════════════════
   AEGIS CHAT  —  proxy to Python LangGraph server
   POST /api/ai/aegis/chat  →  http://localhost:5050/chat  (SSE)
═══════════════════════════════════════════════════════════ */

const AEGIS_PYTHON_URL = process.env.AEGIS_PYTHON_URL || 'http://127.0.0.1:5050';

/* POST /api/ai/aegis/chat */
router.post('/aegis/chat', requireAuth, async (req, res) => {
  const { messages, thread_id, mode } = req.body;
  const uid = req.user?.uid || req.user?.id || null; // injected by requireAuth middleware
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  // Set SSE headers immediately
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    // Proxy request to Python Aegis server
    const pyRes = await fetch(`${AEGIS_PYTHON_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.map(m => ({
          role: m.role === 'ai' ? 'assistant' : m.role,
          content: m.content
        })),
        thread_id: thread_id || undefined,
        uid: uid, // ← forward authenticated user UID for portfolio/trading tools
        mode: mode || "deep", // default to deep research mode

      }),
    });

    if (!pyRes.ok) {
      const errText = await pyRes.text();
      send({ type: 'error', text: `Aegis Python server error ${pyRes.status}: ${errText}` });
      return res.end();
    }

    // Pipe the SSE stream from Python server → browser
    for await (const chunk of pyRes.body) {
      res.write(chunk);
    }

    res.end();

  } catch (err) {
    console.error('[AEGIS proxy error]', err.message);
    // Python server not running — give a clear message
    if (err.code === 'ECONNREFUSED' || err.message.includes('ECONNREFUSED')) {
      send({ type: 'error', text: '⚠️ Aegis Python service is offline. Please start it with: uvicorn server:app --port 5050 (in the Aegis/ directory).' });
    } else {
      send({ type: 'error', text: err.message });
    }
    res.end();
  }
});

import { getDb } from '../../db/mongo.js';

/* ─────────────────────────────────────────────
   AEGIS CONVERSATIONS  (MongoDB Persistent Store)
───────────────────────────────────────────── */

/* GET /api/ai/aegis/conversations */
router.get('/aegis/conversations', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const convs = await db.collection('aegis_conversations')
      .find({ uid: req.user.uid })
      .project({ id: 1, title: 1, updatedAt: 1, _id: 0 })
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray();
    res.json(convs);
  } catch (err) {
    console.error("Fetch conversations error:", err);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

/* POST /api/ai/aegis/conversations — upsert */
router.post('/aegis/conversations', requireAuth, async (req, res) => {
  try {
    const { uid } = req.user;
    let { id, title, messages, isNew } = req.body;
    if (!id || !title) return res.status(400).json({ error: 'id and title are required' });

    const db = getDb();
    
    // Check if conversation already exists in DB
    const existing = await db.collection('aegis_conversations').findOne({ uid, id });
    const isActuallyNew = !existing;
    
    let generatedTitle = null;
    if (isActuallyNew && messages && messages.length > 0) {
      try {
        const firstUserMsg = messages.find(m => m.role === 'user' || m.role === 'user')?.content;
        if (firstUserMsg) {
          const apiKey = process.env.LLM_API_KEY || process.env.GROK_API_KEY;
          const baseUrl = process.env.LLM_BASE_URL || process.env.GROK_BASE_URL || "https://api.x.ai/v1";
          let modelName = process.env.LLM_MODEL || process.env.GROK_MODEL || "openai/gpt-oss-120b";
          
          // Auto-fix for Groq: if using Groq, 'openai/gpt-oss-120b' will fail. Use llama3-8b-8192 for fast title generation.
          if (baseUrl.includes('groq.com')) {
              modelName = "llama3-8b-8192";
          }
          
          if (apiKey) {
            const prompt = `Generate a very short, concise 3-5 word title for a financial chat starting with this query:\n\n"${firstUserMsg}"\n\nTitle (no quotes):`;
            const response = await fetch(`${baseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: modelName,
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.3,
                    max_tokens: 15
                })
            });
            if (response.ok) {
              const data = await response.json();
              const result = data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
              if (result) {
                generatedTitle = result;
                title = generatedTitle;
              }
            }
          }
        }
      } catch (e) {
        console.error("Title generation error:", e);
      }
    } else if (existing && existing.title) {
        // If frontend sends the sliced query due to stale React state, always preserve the existing title in the DB.
        title = existing.title;
    }

    const entry = { 
      uid, 
      id, 
      title, 
      messages: messages || [], 
      updatedAt: new Date().toISOString() 
    };
    
    await db.collection('aegis_conversations').updateOne(
      { uid, id },
      { $set: entry },
      { upsert: true }
    );
    res.json({ ok: true, generatedTitle });
  } catch (err) {
    console.error("Save conversation error:", err);
    res.status(500).json({ error: 'Failed to save conversation' });
  }
});

/* GET /api/ai/aegis/conversations/:id */
router.get('/aegis/conversations/:id', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const conv = await db.collection('aegis_conversations').findOne(
      { uid: req.user.uid, id: req.params.id }, 
      { projection: { _id: 0 } }
    );
    if (!conv) return res.status(404).json({ error: 'Not found' });
    res.json(conv);
  } catch (err) {
    console.error("Fetch conversation error:", err);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

/* DELETE /api/ai/aegis/conversations/:id */
router.delete('/aegis/conversations/:id', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    await db.collection('aegis_conversations').deleteOne({ uid: req.user.uid, id: req.params.id });
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete conversation error:", err);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

export default router;
