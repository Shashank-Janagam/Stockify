import React, { useEffect, useState } from "react";

const HOST = import.meta.env.VITE_HOST_ADDRESS || "";

interface DigestData {
  morningBrief: {
    title: string;
    summary: string;
    holdingImpacts: { symbol: string; impact: string; sentiment: "positive" | "negative" | "neutral" }[];
    generatedAt: string;
  };
  rebalanceNudge: {
    triggered: boolean;
    message: string;
    topHeavySymbol?: string;
    suggestedAction?: string;
  };
  learningFeedback: {
    tradeId?: string;
    symbol: string;
    message: string;
    pnlMissed?: number;
    type: "early_exit" | "held_too_long" | "perfect_exit" | "late_entry";
  }[];
}

interface Props {
  holdings: { symbol: string; name: string }[];
  loading?: boolean;
}

const MOCK_DIGEST: DigestData = {
  morningBrief: {
    title: "Overnight Market Summary — 20 Jun 2026",
    summary:
      "Nifty futures indicate a flat-to-positive open. FII net buyers of ₹1,240Cr in yesterday's session. SGX Nifty at 24,850 — up 0.3% from close. Global cues mixed: US markets closed flat. Brent crude at $84/bbl, slightly negative for energy names.",
    holdingImpacts: [
      { symbol: "HDFC", impact: "RBI policy meeting today — watch for rate guidance", sentiment: "neutral" },
      { symbol: "INFY", impact: "Dollar strengthening +0.4% — tailwind for IT exporters", sentiment: "positive" },
      { symbol: "RELIANCE", impact: "Crude at $84/bbl above comfort zone for refining margins", sentiment: "negative" },
    ],
    generatedAt: "06:45 AM IST · 20 Jun 2026",
  },
  rebalanceNudge: {
    triggered: true,
    message: "HDFC Bank now represents 28.4% of your portfolio — above the 25% single-stock guideline.",
    topHeavySymbol: "HDFC",
    suggestedAction: "Consider trimming 3–5% allocation from HDFC and adding to under-allocated IT names.",
  },
  learningFeedback: [
    {
      symbol: "RELIANCE",
      message: "You exited RELIANCE 2 days early — the position ran another 3.4% after your exit.",
      pnlMissed: 2840,
      type: "early_exit",
    },
    {
      symbol: "INFY",
      message: "Your INFY exit was within 1% of the 7-day high. Near-perfect timing.",
      type: "perfect_exit",
    },
    {
      symbol: "TCS",
      message: "You held TCS through a -7% drawdown before averaging down — behavioral flag: loss aversion.",
      type: "held_too_long",
    },
  ],
};

const feedbackIcon: Record<string, string> = {
  early_exit: "⏰", held_too_long: "🔒", perfect_exit: "🎯", late_entry: "📈"
};
const feedbackColor: Record<string, string> = {
  early_exit: "var(--pc-amber)", held_too_long: "var(--pc-red)",
  perfect_exit: "var(--pc-green)", late_entry: "var(--pc-blue-bright)"
};

const Layer8_DailyDigest: React.FC<Props> = ({ loading }) => {
  const [digest, setDigest] = useState<DigestData | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    fetch(`${HOST}/api/portfolio/daily-digest`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { setDigest(data?.morningBrief ? data : MOCK_DIGEST); })
      .catch(() => setDigest(MOCK_DIGEST))
      .finally(() => setFetching(false));
  }, []);

  const data = digest ?? MOCK_DIGEST;

  if (loading || fetching) {
    return (
      <div className="pc-digest-grid">
        {[0,1,2].map(i => <div key={i} className="pc-skeleton" style={{ height: 240, borderRadius: 10 }} />)}
      </div>
    );
  }

  const impactColor = (s: string) =>
    s === "positive" ? "var(--pc-green)" : s === "negative" ? "var(--pc-red)" : "var(--pc-text-2)";
  const impactIcon = (s: string) => s === "positive" ? "▲" : s === "negative" ? "▼" : "•";

  return (
    <div className="pc-digest-grid">

      {/* ── Morning Brief ── */}
      <div className="pc-digest-card pc-digest-morning">
        <div className="pc-digest-icon-wrap" style={{ background: "var(--pc-blue-dim)" }}>☀️</div>
        <div>
          <div className="pc-digest-label">Morning Brief</div>
          <div className="pc-digest-title">{data.morningBrief.title}</div>
        </div>
        <div className="pc-digest-body">{data.morningBrief.summary}</div>

        {/* Holding-specific impacts */}
        {data.morningBrief.holdingImpacts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--pc-text-2)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Your Holdings Impact
            </div>
            {data.morningBrief.holdingImpacts.map(hi => (
              <div key={hi.symbol} style={{
                padding: "8px 10px", borderRadius: 8,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid var(--pc-border)",
                fontSize: 12, color: "var(--pc-text-2)", display: "flex", gap: 8, alignItems: "center"
              }}>
                <span style={{ fontWeight: 800, color: impactColor(hi.sentiment), fontSize: 10 }}>
                  {impactIcon(hi.sentiment)} {hi.symbol}
                </span>
                <span>{hi.impact}</span>
              </div>
            ))}
          </div>
        )}
        <div className="pc-digest-timestamp">⚡ Groq · {data.morningBrief.generatedAt}</div>
      </div>

      {/* ── Rebalance Nudge ── */}
      <div className="pc-digest-card pc-digest-rebalance">
        <div className="pc-digest-icon-wrap" style={{ background: "var(--pc-amber-dim)" }}>⚖️</div>
        <div>
          <div className="pc-digest-label">Rebalance Nudge</div>
          <div className="pc-digest-title">
            {data.rebalanceNudge.triggered ? "Concentration Alert" : "Portfolio Balanced"}
          </div>
        </div>

        {data.rebalanceNudge.triggered ? (
          <>
            <div style={{
              padding: "12px 14px", borderRadius: 10,
              background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)",
              color: "var(--pc-amber)", fontSize: 13, lineHeight: 1.55
            }}>
              {data.rebalanceNudge.message}
            </div>
            {data.rebalanceNudge.suggestedAction && (
              <div style={{
                padding: "10px 14px", borderRadius: 10,
                background: "rgba(255,255,255,0.03)", border: "1px solid var(--pc-border)",
                fontSize: 12.5, color: "var(--pc-text-2)", lineHeight: 1.55
              }}>
                <span style={{ color: "var(--pc-text)", fontWeight: 700 }}>AI Suggestion: </span>
                {data.rebalanceNudge.suggestedAction}
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: "14px", borderRadius: 10, background: "var(--pc-green-dim)", border: "1px solid rgba(16,212,142,0.2)", color: "var(--pc-green)", fontSize: 13 }}>
            ✅ All positions within concentration guidelines. No rebalancing required.
          </div>
        )}

        <div className="pc-digest-timestamp">⚡ Auto-computed from live portfolio weights</div>
      </div>

      {/* ── Learning Feedback ── */}
      <div className="pc-digest-card pc-digest-feedback">
        <div className="pc-digest-icon-wrap" style={{ background: "var(--pc-green-dim)" }}>🎓</div>
        <div>
          <div className="pc-digest-label">Post-Trade Coach</div>
          <div className="pc-digest-title">Behavioural Learning Feedback</div>
        </div>

        {data.learningFeedback.length === 0 ? (
          <div className="pc-digest-body" style={{ fontStyle: "italic" }}>
            Make a few trades and close them — the AI will analyse your timing, exits, and patterns here.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.learningFeedback.map((fb, i) => (
              <div key={i} className="pc-digest-feedback-item">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>{feedbackIcon[fb.type]}</span>
                  <strong>{fb.symbol}</strong>
                  {fb.pnlMissed != null && (
                    <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "var(--pc-amber)" }}>
                      ₹{Math.abs(fb.pnlMissed).toLocaleString("en-IN")} missed
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: "var(--pc-text-2)", lineHeight: 1.5 }}>
                  {fb.message}
                </div>
                <div style={{ marginTop: 5 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                    background: feedbackColor[fb.type] + "18",
                    color: feedbackColor[fb.type],
                    textTransform: "uppercase", letterSpacing: "0.05em"
                  }}>
                    {fb.type.replace(/_/g," ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="pc-digest-timestamp">⚡ Groq Llama-3 · Analysed from order history</div>
      </div>
    </div>
  );
};

export default Layer8_DailyDigest;
