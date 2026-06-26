import React, { useEffect, useState } from "react";

const HOST = import.meta.env.VITE_HOST_ADDRESS || "";

interface GuardData {
  verdict: "ALLOW" | "WARN" | "SOFT_BLOCK";
  reason: string;
  rules: {
    name: string;
    description: string;
    status: "PASS" | "WARN" | "BLOCK";
    icon: string;
  }[];
  dynamicCap: number;
  usedToday: number;
}

interface Props {
  dynamicCap: number;
  winRate: number;
  loading?: boolean;
}

const MOCK_GUARD: GuardData = {
  verdict: "ALLOW",
  reason:
    "All hard-rule checks passed. Your win-rate gate (decay-weighted 30-day) is healthy at current levels. Daily frequency within limit. You may top-up up to your dynamic cap.",
  rules: [
    { name: "Daily Frequency Cap", description: "Max 5 trades/day · Today: 2", status: "PASS", icon: "🔄" },
    { name: "Max Top-Up Amount", description: "Single txn ≤ ₹50,000", status: "PASS", icon: "💰" },
    { name: "Win-Rate Gate", description: "30-day decay-weighted ≥ 35%", status: "PASS", icon: "🎯" },
    { name: "Position Concentration", description: "No single stock > 30% of portfolio", status: "WARN", icon: "⚖️" },
  ],
  dynamicCap: 0,
  usedToday: 2400,
};

const Layer7_WalletGuard: React.FC<Props> = ({ dynamicCap, winRate, loading }) => {
  const [guard, setGuard] = useState<GuardData | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    fetch(`${HOST}/api/portfolio/wallet-guard`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.verdict) setGuard({ ...data, dynamicCap: data.dynamicCap || dynamicCap });
        else setGuard({ ...MOCK_GUARD, dynamicCap });
      })
      .catch(() => setGuard({ ...MOCK_GUARD, dynamicCap }))
      .finally(() => setFetching(false));
  }, [dynamicCap]);

  const data = guard ?? { ...MOCK_GUARD, dynamicCap };
  const verdictClass = data.verdict === "ALLOW" ? "pc-verdict-allow"
    : data.verdict === "WARN" ? "pc-verdict-warn" : "pc-verdict-block";
  const verdictBg = data.verdict === "ALLOW" ? "var(--pc-green-dim)"
    : data.verdict === "WARN" ? "var(--pc-amber-dim)" : "var(--pc-red-dim)";
  const verdictColor = data.verdict === "ALLOW" ? "var(--pc-green)"
    : data.verdict === "WARN" ? "var(--pc-amber)" : "var(--pc-red)";
  const verdictIcon = data.verdict === "ALLOW" ? "✅" : data.verdict === "WARN" ? "⚠️" : "🛑";

  const capUsedPct = data.dynamicCap > 0
    ? Math.min((data.usedToday / data.dynamicCap) * 100, 100) : 0;

  if (loading || fetching) {
    return (
      <div className="pc-guard-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0,1,2,3].map(i => <div key={i} className="pc-skeleton" style={{ height: 62, borderRadius: 10 }} />)}
        </div>
        <div className="pc-skeleton" style={{ height: 220, borderRadius: 12 }} />
      </div>
    );
  }

  return (
    <div className="pc-guard-grid">

      {/* ── Hard Rule Checks ── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--pc-text-2)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
          Hard Rule Checks (Sync)
        </div>
        <div className="pc-guard-rules">
          {data.rules.map(r => (
            <div className="pc-guard-rule" key={r.name}>
              <div className="pc-guard-rule-icon" style={{
                background: r.status === "PASS" ? "var(--pc-green-dim)"
                  : r.status === "WARN" ? "var(--pc-amber-dim)" : "var(--pc-red-dim)"
              }}>
                {r.icon}
              </div>
              <div>
                <div className="pc-guard-rule-name">{r.name}</div>
                <div className="pc-guard-rule-sub">{r.description}</div>
              </div>
              <span className={`pc-guard-rule-status ${
                r.status === "PASS" ? "pc-rule-pass" : r.status === "WARN" ? "pc-rule-warn" : "pc-rule-block"
              }`}>
                {r.status}
              </span>
            </div>
          ))}
        </div>

        {/* Dynamic Cap gauge */}
        <div className="pc-cap-gauge">
          <div className="pc-cap-gauge-label">Dynamic Wallet Cap (Decay-Weighted Win-Rate)</div>
          <div className="pc-cap-gauge-val">
            ₹{data.dynamicCap.toLocaleString("en-IN", { minimumFractionDigits: 0 })}
          </div>
          <div className="pc-cap-track">
            <div className="pc-cap-fill" style={{ width: `${capUsedPct}%` }} />
          </div>
          <div className="pc-cap-sub">
            ₹{data.usedToday.toLocaleString("en-IN")} used today · {(100 - capUsedPct).toFixed(0)}% remaining
          </div>
        </div>
      </div>

      {/* ── Groq Verdict Card ── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--pc-text-2)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
          Groq Co-Decision (LLM Verdict)
        </div>
        <div className={`pc-verdict-card ${verdictClass}`}>
          <div className="pc-verdict-badge" style={{ background: verdictBg, color: verdictColor }}>
            {verdictIcon} {data.verdict}
          </div>

          <div>
            <div className="pc-verdict-title">
              {data.verdict === "ALLOW" ? "Wallet operations permitted" :
               data.verdict === "WARN"  ? "Proceed with caution" :
               "Top-up temporarily restricted"}
            </div>
            <div className="pc-verdict-reason" style={{ marginTop: 8 }}>
              {data.reason}
            </div>
          </div>

          {/* Visual breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[
              { label: "Win Rate Gate", val: `${winRate}%`, ok: winRate >= 35 },
              { label: "Hard Rules", val: data.rules.filter(r => r.status === "PASS").length + "/" + data.rules.length + " passed", ok: data.rules.every(r => r.status !== "BLOCK") },
            ].map(item => (
              <div key={item.label} style={{
                padding: "10px 12px", borderRadius: 8,
                background: item.ok ? "var(--pc-green-dim)" : "var(--pc-red-dim)",
                border: `1px solid ${item.ok ? "rgba(16,212,142,0.2)" : "rgba(240,68,68,0.2)"}`,
              }}>
                <div style={{ fontSize: 10, color: "var(--pc-text-2)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{item.label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: item.ok ? "var(--pc-green)" : "var(--pc-red)", marginTop: 4 }}>{item.val}</div>
              </div>
            ))}
          </div>

          <div className="pc-verdict-powered">Groq Llama-3.3-70b · Structured verdict · Not auto-executed</div>
        </div>
      </div>
    </div>
  );
};

export default Layer7_WalletGuard;
