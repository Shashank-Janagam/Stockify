import express from "express";
import requireAuth from "../../Middleware/requireAuth.js";
import { db } from "../../db/sql.js";
import { getUserId } from "../dbUtils.js";
import { incrementWalletBalance, addUserTransaction } from "./orders.js";
import redis from "../../cache/redisClient.js";

const router = express.Router();

/* ═══════════════════════════════════════════════
   MULTIPLIER CALCULATOR
   Computes dynamic limit multiplier based on performance
   24h = 40%, 3d = 30%, 30d = 20%, overall = 10%
═══════════════════════════════════════════════ */
function computeMultiplier(p) {
  const totalTrades  = Number(p.total_trades);
  const winningTrades = Number(p.winning_trades);

  if (totalTrades < 5) {
    return {
      multiplier: 1.0,
      performanceTier: "Neutral (insufficient history)",
      weightedWinRate: null,
      winRates: null
    };
  }

  // Win rates across all windows
  const winRateOverall = winningTrades / totalTrades;
  const winRate30d = p.winning_30d / Math.max(p.trades_30d, 1);
  const winRate3d  = p.winning_3d  / Math.max(p.trades_3d,  1);
  const winRate24h = p.winning_24h / Math.max(p.trades_24h, 1);

  // Weighted score: recent windows matter more
  const weightedWinRate =
    (winRate24h  * 0.40) +
    (winRate3d   * 0.30) +
    (winRate30d  * 0.20) +
    (winRateOverall * 0.10);

  // PnL trend signals
  const pnl24h = Number(p.pnl_24h);
  const pnl3d  = Number(p.pnl_3d);

  let multiplier;
  let performanceTier;

  if (weightedWinRate >= 0.60 && pnl3d > 0) {
    multiplier = 2.0;
    performanceTier = `Excellent — weighted win rate ${pct(weightedWinRate)}, positive 3d PnL`;
  } else if (weightedWinRate >= 0.50 && pnl3d >= 0) {
    multiplier = 1.5;
    performanceTier = `Good — weighted win rate ${pct(weightedWinRate)}`;
  } else if (weightedWinRate >= 0.40) {
    multiplier = 1.0;
    performanceTier = `Standard — weighted win rate ${pct(weightedWinRate)}`;
  } else if (weightedWinRate >= 0.30) {
    multiplier = 0.5;
    performanceTier = `Below average — weighted win rate ${pct(weightedWinRate)}`;
  } else {
    multiplier = 0.25;
    performanceTier = `High risk — weighted win rate ${pct(weightedWinRate)}`;
  }

  // Extra penalty: heavy loss today regardless of tier
  if (pnl24h < -10000) {
    multiplier = Math.max(multiplier * 0.5, 0.1);
    performanceTier += ` + heavy loss today (₹${pnl24h})`;
  }

  return {
    multiplier,
    performanceTier,
    weightedWinRate: Math.round(weightedWinRate * 100),
    winRates: {
      overall: pct(winRateOverall),
      "30d":   pct(winRate30d),
      "3d":    pct(winRate3d),
      "24h":   pct(winRate24h),
    }
  };
}

const pct = r => `${Math.round(r * 100)}%`;

/* ═══════════════════════════════════════════════
   CONTEXT BUILDER
   Fetches history, PnL, frequency, portfolio state
═══════════════════════════════════════════════ */
async function buildContext(userId) {
  const [
    ruleChecks,
    pnlSummary,
    depositPattern,
    portfolio
  ] = await Promise.all([

    // Rule checks + deposit pattern — all in one query
    db.query(`
      SELECT
        COALESCE(SUM(amount) FILTER (
          WHERE transaction_type = 'DEPOSIT'
          AND created_at > NOW() - INTERVAL '24 hours'
        ), 0) AS total_deposited_today,

        COUNT(*) FILTER (
          WHERE transaction_type = 'DEPOSIT'
          AND created_at > NOW() - INTERVAL '1 hour'
        ) AS topups_last_hour,

        MAX(created_at) FILTER (
          WHERE transaction_type = 'DEPOSIT'
        ) AS last_topup_at,

        COUNT(*) FILTER (
          WHERE transaction_type = 'DEPOSIT'
          AND created_at > NOW() - INTERVAL '7 days'
        ) AS topups_last_7d,

        COALESCE(SUM(amount) FILTER (
          WHERE transaction_type = 'DEPOSIT'
          AND created_at > NOW() - INTERVAL '7 days'
        ), 0) AS total_deposited_7d

      FROM wallet_transactions
      WHERE user_id = $1
    `, [userId]),

    // PnL summary — not raw trades
    db.query(`
      SELECT
        COUNT(*) FILTER (WHERE side = 'SELL') AS total_trades,
        COUNT(*) FILTER (WHERE side = 'SELL' AND realized_pnl > 0) AS winning_trades,
        COUNT(*) FILTER (WHERE side = 'SELL' AND realized_pnl < 0) AS losing_trades,

        COALESCE(SUM(realized_pnl), 0) AS total_pnl,

        -- 30d window
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days' AND side = 'SELL') AS trades_30d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days' AND side = 'SELL' AND realized_pnl > 0) AS winning_30d,
        COALESCE(SUM(realized_pnl) FILTER (WHERE created_at > NOW() - INTERVAL '30 days'), 0) AS pnl_30d,

        -- 3d window
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '3 days' AND side = 'SELL') AS trades_3d,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '3 days' AND side = 'SELL' AND realized_pnl > 0) AS winning_3d,
        COALESCE(SUM(realized_pnl) FILTER (WHERE created_at > NOW() - INTERVAL '3 days'), 0) AS pnl_3d,

        -- 24h window
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours' AND side = 'SELL') AS trades_24h,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours' AND side = 'SELL' AND realized_pnl > 0) AS winning_24h,
        COALESCE(SUM(realized_pnl) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours'), 0) AS pnl_24h

      FROM trades
      WHERE user_id = $1
    `, [userId]),

    // Deposit pattern — were recent top-ups after losses?
    db.query(`
      SELECT
        d.created_at AS deposit_time,
        COALESCE(SUM(t.realized_pnl), 0) AS pnl_6h_before_deposit
      FROM wallet_transactions d
      LEFT JOIN trades t
        ON t.user_id = d.user_id
        AND t.created_at BETWEEN d.created_at - INTERVAL '6 hours'
                              AND d.created_at
      WHERE d.user_id = $1
        AND d.transaction_type = 'DEPOSIT'
        AND d.created_at > NOW() - INTERVAL '7 days'
      GROUP BY d.created_at
      ORDER BY d.created_at DESC
      LIMIT 5
    `, [userId]),

    // Portfolio — just value + count, not every position
    db.query(`
      SELECT
        COUNT(*) AS open_positions,
        COALESCE(SUM(p.remaining_quantity * p.entry_price), 0) AS invested_value
      FROM positions p
      WHERE p.user_id = $1
        AND p.remaining_quantity > 0
    `, [userId]),

  ]);

  const r = ruleChecks.rows[0];
  const p = pnlSummary.rows[0];

  // Compute loss-chasing signal from deposit pattern
  const deposits = depositPattern.rows;
  const lossChaseCount = deposits.filter(d => d.pnl_6h_before_deposit < 0).length;

  const { multiplier, performanceTier, weightedWinRate, winRates } = computeMultiplier(p);

  const BASE_LIMIT = 50000;
  const dailyCap = Math.round(BASE_LIMIT * multiplier);

  return {
    totalDepositedToday: Number(r.total_deposited_today),
    topupsLastHour:      Number(r.topups_last_hour),
    lastTopupAt:         r.last_topup_at,
    dailyCap,
    performanceTier,

    llmContext: {
      topups7d:        Number(r.topups_last_7d),
      deposited7d:     Number(r.total_deposited_7d),
      winRates,               // all four windows, already formatted
      weightedWinRate,
      totalTrades30d:  Number(p.trades_30d || 0),
      pnlAlltime:      Number(p.total_pnl),
      pnl30d:          Number(p.pnl_30d),
      pnlLast3d:       Number(p.pnl_3d),
      pnlLast24h:      Number(p.pnl_24h),
      lossChaseCount,
      recentDeposits:  deposits.length,
      openPositions:   Number(portfolio.rows[0].open_positions),
      investedValue:   Number(portfolio.rows[0].invested_value),
      dailyCap,
      performanceTier,
    }
  };
}
/* ═══════════════════════════════════════════════
   RULE ENGINE
   Returns: { verdict: 'ALLOW' | 'HARD_BLOCK', reason }
═══════════════════════════════════════════════ */
function runRuleEngine(context, amount) {
  console.log(context)
  const MAX_PER_HOUR = 5;
  const COOLDOWN_MINUTES = 5;
  const dailyCap = context.dailyCap || 50000;
  const performanceTier = context.performanceTier || "Standard (Neutral)";

  // 1️⃣ Daily cap (dynamic check)
  if (context.totalDepositedToday + amount > dailyCap) {
    const remaining = Math.max(0, dailyCap - context.totalDepositedToday);
    return {
      verdict: "HARD_BLOCK",
      reason: `Daily deposit limit of ₹${dailyCap.toLocaleString("en-IN")} reached (Tier: ${performanceTier}). You've deposited ₹${context.totalDepositedToday.toLocaleString("en-IN")} today. Remaining: ₹${remaining.toLocaleString("en-IN")}.`,
    };
  }

  // 2️⃣ Frequency cap
  if (context.topupsLastHour >= MAX_PER_HOUR) {
    return {
      verdict: "HARD_BLOCK",
      reason: `You've made ${context.topupsLastHour} deposits in the last hour. Maximum is 3/hour. Please wait before adding more funds.`,
    };
  }

  // 3️⃣ Cooldown
  if (context.lastTopupAt) {
    const lastTime = new Date(context.lastTopupAt);
    const minutesAgo = (Date.now() - lastTime.getTime()) / 60000;
    if (minutesAgo < COOLDOWN_MINUTES) {
      const waitMins = Math.ceil(COOLDOWN_MINUTES - minutesAgo);
      return {
        verdict: "HARD_BLOCK",
        reason: `Please wait ${waitMins} more minute${waitMins > 1 ? "s" : ""} before your next deposit (5-minute cooldown).`,
      };
    }
  }

  return { verdict: "ALLOW", reason: "All rule checks passed." };
}

/* ═══════════════════════════════════════════════
   LLM ENGINE (Groq)
   Returns: { verdict: 'ALLOW' | 'WARN' | 'SOFT_BLOCK', reason, advice }
═══════════════════════════════════════════════ */
async function runLlmEngine(context, amount) {
  const apiKey = process.env.GROK_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1";
  // LLM_MODEL may be set to an OpenAI model — always use a valid Groq model here
  const modelName = "llama-3.3-70b-versatile";

  if (!apiKey) {
    console.warn("⚠️ LLM API key not configured — defaulting to ALLOW");
    return {
      verdict: "ALLOW",
      reason: "AI analysis unavailable.",
      advice: "AI analysis service is currently unavailable.",
    };
  }

  const {
    topups7d,
    deposited7d,
    totalTrades30d,
    winRates,
    pnl30d,
    pnlLast3d,
    lossChaseCount,
    recentDeposits,
    openPositions,
    investedValue,
  } = context.llmContext;

  const prompt = `You are a behavioral finance AI for a paper-trading (virtual money) investment platform called Stockify.
A user wants to add ₹${amount.toLocaleString("en-IN")} to their virtual wallet.

BEHAVIORAL CONTEXT OF THE USER:
- New Deposit Amount: ₹${amount.toLocaleString("en-IN")}
- Total Deposited Today (via Rule Engine checks): ₹${context.totalDepositedToday.toLocaleString("en-IN")} (out of a performance-adjusted daily limit of ₹${(context.dailyCap || 50000).toLocaleString("en-IN")} under performance tier: "${context.performanceTier || "Standard"}")
- Total Top-ups Last Hour: ${context.topupsLastHour}
- Total Deposits (Last 7 Days): ${topups7d} top-up(s), totaling ₹${deposited7d.toLocaleString("en-IN")}
- Active Open Positions: ${openPositions} positions with total invested value of ₹${investedValue.toLocaleString("en-IN")}
- Recent Trading Activity (Last 30 Days): ${totalTrades30d} total trade(s)
- Recent Trading Activity Win Rates:
  * Overall: ${winRates ? winRates.overall : "N/A (insufficient history)"}
  * Last 30 Days: ${winRates ? winRates["30d"] : "N/A (insufficient history)"}
  * Last 3 Days: ${winRates ? winRates["3d"] : "N/A (insufficient history)"}
  * Last 24 Hours: ${winRates ? winRates["24h"] : "N/A (insufficient history)"}
- Realized profit/loss (Last 30 Days): ₹${pnl30d.toLocaleString("en-IN")}
- Realized profit/loss (Last 3 Days): ₹${pnlLast3d.toLocaleString("en-IN")}
- Loss-Chasing Alert: Out of their last ${recentDeposits} deposits (up to 5), ${lossChaseCount} deposit(s) occurred within 6 hours of a trading loss.

ANALYSIS TASK:
1. Detect loss-chasing: Check if the user is repeatedly adding money right after losses (i.e. if lossChaseCount > 0, especially if lossChaseCount is high compared to recentDeposits, or if they have negative realized pnl in the last 3 days or last 30 days).
2. Detect velocity creep: Assess if the user's weekly deposit rate (topups7d, deposited7d) indicates rapid accumulation of funds relative to their open positions or trading volume.
3. Detect over-funding: Are they adding excessive funds despite low trading activity (totalTrades30d) or substantial recent realized losses (pnl30d/pnlLast3d)? Take into account their dynamic limit of ₹${(context.dailyCap || 50000).toLocaleString("en-IN")} which was adjusted based on their performance tier.

Return a JSON object ONLY with the following structure:
{
  "verdict": "ALLOW" | "WARN" | "SOFT_BLOCK",
  "reason": "1-2 sentence explanation of your verdict",
  "advice": "1-2 sentence personalized, empathetic advice shown to user (mention specific numbers from the context, such as lossChaseCount, winRate, or pnlLast3d where relevant)"
}

Rules for Verdicts:
- ALLOW: Healthy behavior, no problematic patterns detected.
- WARN: Some concerning pattern but not severe (user is prompted with advice but allowed to proceed).
- SOFT_BLOCK: Strong behavioral concern (e.g. high loss-chasing frequency, heavy losses with immediate top-ups). Suggest the user pause/take a break, though they will have the choice to override.`;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error(`LLM 400 body: ${errBody}`);
      throw new Error(`LLM returned ${response.status}`);
    }

    const data = await response.json();
    let text = data.choices[0].message.content;
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(text);

    return {
      verdict: parsed.verdict || "ALLOW",
      reason: parsed.reason || "",
      advice: parsed.advice || "",
    };
  } catch (err) {
    console.error("LLM Engine error:", err.message);
    return {
      verdict: "ALLOW",
      reason: "AI analysis encountered an error — proceeding with caution.",
      advice: "Invest wisely and only what you can afford to lose.",
    };
  }
}

/* ═══════════════════════════════════════════════
   DECISION COMBINER
═══════════════════════════════════════════════ */
function combineVerdicts(ruleVerdict, llmVerdict) {
  // HARD_BLOCK always wins
  if (ruleVerdict.verdict === "HARD_BLOCK") {
    return {
      decision: "REJECT",
      reason: ruleVerdict.reason,
      advice: llmVerdict.advice,
    };
  }

  // Both ALLOW → approve
  if (llmVerdict.verdict === "ALLOW") {
    return {
      decision: "APPROVE",
      reason: ruleVerdict.reason,
      advice: llmVerdict.advice,
    };
  }

  // LLM SOFT_BLOCK → reject
  if (llmVerdict.verdict === "SOFT_BLOCK") {
    return {
      decision: "REJECT",
      reason: llmVerdict.reason,
      advice: llmVerdict.advice,
    };
  }

  // LLM WARN → warn + confirm
  return {
    decision: "WARN",
    reason: llmVerdict.reason,
    advice: llmVerdict.advice,
  };
}

/* ═══════════════════════════════════════════════
   HELPER
═══════════════════════════════════════════════ */
// (getWeekLabel function removed as it is no longer needed with database-aggregated context)

/* ═══════════════════════════════════════════════
   ROUTE: POST /api/payments/topup
   Phase 1: analyze & return decision
═══════════════════════════════════════════════ */
router.post("/topup", requireAuth, async (req, res) => {
  try {
    const { amount } = req.body;
    const { uid, name, email } = req.user;

    if (!amount || amount < 1) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const userId = await getUserId(uid, name, email);

    // Build context + run both engines in parallel
    const context = await buildContext(userId);
    const [ruleResult, llmResult] = await Promise.all([
      Promise.resolve(runRuleEngine(context, amount)),
      runLlmEngine(context, amount),
    ]);

    const combined = combineVerdicts(ruleResult, llmResult);

    console.log(`💰 Topup analysis for user ${userId}: amount=₹${amount}, decision=${combined.decision}`);

    res.json({
      decision: combined.decision, // APPROVE | WARN | REJECT
      reason: combined.reason,
      advice: combined.advice,
      ruleVerdict: ruleResult.verdict,
      llmVerdict: llmResult.verdict,
      amount,
      dailyCap: context.dailyCap,
      performanceTier: context.performanceTier,
      winRates: context.llmContext.winRates,
      weightedWinRate: context.llmContext.weightedWinRate,
    });
  } catch (err) {
    console.error("Topup analyze error:", err);
    res.status(500).json({ error: "Failed to analyze topup request" });
  }
});

/* ═══════════════════════════════════════════════
   ROUTE: POST /api/payments/topup/confirm
   Phase 2: user confirmed (Approve or Warn→Proceed)
   Actually credits the wallet
═══════════════════════════════════════════════ */
router.post("/topup/confirm", requireAuth, async (req, res) => {
  try {
    const { amount } = req.body;
    const { uid, name, email } = req.user;

    if (!amount || amount < 1) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const userId = await getUserId(uid, name, email);

    // Re-run rule engine as final guard (prevents bypass)
    const context = await buildContext(userId);
    const ruleResult = runRuleEngine(context, amount);

    if (ruleResult.verdict === "HARD_BLOCK") {
      return res.status(403).json({
        error: "Blocked by rules",
        reason: ruleResult.reason,
      });
    }

    // Credit wallet atomically
    await db.query("BEGIN");
    await incrementWalletBalance(userId, amount);
    await addUserTransaction({ userId, type: "DEPOSIT", title: "Wallet Deposit", amount });
    await db.query("COMMIT");

    // Invalidate balance cache
    const uidRes = await db.query(`SELECT uid FROM users WHERE id=$1`, [userId]);
    if (uidRes.rows.length > 0) {
      await redis.del(`wallet:balance:${uidRes.rows[0].uid}`);
    }

    console.log(`✅ Wallet credited: user=${userId}, amount=₹${amount}`);
    res.json({ success: true, amount });
  } catch (err) {
    await db.query("ROLLBACK").catch(() => {});
    console.error("Topup confirm error:", err);
    res.status(500).json({ error: "Failed to credit wallet" });
  }
});

export default router;
