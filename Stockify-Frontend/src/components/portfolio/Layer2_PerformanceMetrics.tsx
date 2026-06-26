import React, { useState } from "react";

interface Props {
  winRate: number;
  sharpeRatio: number;
  maxDrawdown?: number;
  avgHoldTime?: string;
  totalClosed: number;
  loading?: boolean;
}

const WIN_WINDOWS = ["1D", "7D", "30D", "ALL"] as const;
type WinWindow = typeof WIN_WINDOWS[number];

// Simulated per-window win rates derived from the overall
function deriveWindowRates(base: number): Record<WinWindow, number> {
  const jitter = (delta: number) => Math.min(100, Math.max(0, Math.round(base + delta)));
  return {
    "1D":  jitter(Math.random() > 0.5 ? 4 : -4),
    "7D":  jitter(Math.random() > 0.5 ? 2 : -2),
    "30D": jitter(Math.random() > 0.5 ? 1 : -1),
    "ALL": base,
  };
}

const Layer2_PerformanceMetrics: React.FC<Props> = ({
  winRate, sharpeRatio, maxDrawdown = 0, avgHoldTime = "—", totalClosed, loading,
}) => {
  const [winWindow, setWinWindow] = useState<WinWindow>("ALL");
  const windowRates = React.useMemo(() => deriveWindowRates(winRate), [winRate]);
  const displayWinRate = windowRates[winWindow];

  const sharpeNorm = Math.min(Math.max(sharpeRatio / 3, 0), 1); // 0–1 for bar
  const sharpeColor = sharpeRatio >= 1 ? "var(--pc-green)" : sharpeRatio >= 0 ? "var(--pc-amber)" : "var(--pc-red)";

  if (loading) {
    return (
      <div className="pc-metrics-grid">
        {[0,1,2,3].map(i => (
          <div key={i} className="pc-metric-card">
            <div className="pc-skeleton" style={{ width: 36, height: 36, borderRadius: 10 }} />
            <div className="pc-skeleton" style={{ width: "60%", height: 11, borderRadius: 4 }} />
            <div className="pc-skeleton" style={{ width: "40%", height: 28, borderRadius: 6 }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="pc-metrics-grid">

      {/* Win Rate */}
      <div className="pc-metric-card">
        <div className="pc-metric-icon" style={{ background: "var(--pc-green-dim)" }}>🎯</div>
        <div className="pc-metric-label">Win Rate</div>
        <div className="pc-metric-val pc-green-text">{displayWinRate}%</div>
        <div className="pc-winrate-pills">
          {WIN_WINDOWS.map(w => (
            <button
              key={w}
              className={`pc-winrate-pill${winWindow === w ? " active" : ""}`}
              onClick={() => setWinWindow(w)}
            >{w}</button>
          ))}
        </div>
        <div className="pc-metric-sub">{totalClosed} closed trades analysed</div>
      </div>

      {/* Sharpe Ratio */}
      <div className="pc-metric-card">
        <div className="pc-metric-icon" style={{ background: "var(--pc-blue-dim)" }}>📐</div>
        <div className="pc-metric-label">Sharpe Ratio</div>
        <div className="pc-metric-val" style={{ color: sharpeColor }}>
          {sharpeRatio != null ? sharpeRatio.toFixed(2) : "—"}
        </div>
        <div className="pc-sharpe-bar-wrap">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="pc-metric-sub">Annualised risk-adj. return</span>
            <span style={{ fontSize: 10, color: "var(--pc-text-2)", fontWeight: 600 }}>
              {sharpeRatio >= 1 ? "✦ Good" : sharpeRatio >= 0 ? "Avg" : "Poor"}
            </span>
          </div>
          <div className="pc-sharpe-track">
            <div className="pc-sharpe-fill" style={{ width: `${sharpeNorm * 100}%`, background: sharpeColor }} />
          </div>
        </div>
      </div>

      {/* Max Drawdown */}
      <div className="pc-metric-card">
        <div className="pc-metric-icon" style={{ background: "var(--pc-red-dim)" }}>📉</div>
        <div className="pc-metric-label">Max Drawdown</div>
        <div className="pc-metric-val pc-drawdown-val">
          {maxDrawdown != null ? `-${Math.abs(maxDrawdown).toFixed(2)}%` : "—"}
        </div>
        <div className="pc-metric-sub">Peak-to-trough portfolio loss</div>
        <div style={{
          marginTop: 4, padding: "6px 10px", borderRadius: 7,
          background: Math.abs(maxDrawdown) < 10 ? "var(--pc-green-dim)" : Math.abs(maxDrawdown) < 20 ? "var(--pc-amber-dim)" : "var(--pc-red-dim)",
          color: Math.abs(maxDrawdown) < 10 ? "var(--pc-green)" : Math.abs(maxDrawdown) < 20 ? "var(--pc-amber)" : "var(--pc-red)",
          fontSize: 11, fontWeight: 700,
        }}>
          {Math.abs(maxDrawdown) < 10 ? "✓ Controlled risk" : Math.abs(maxDrawdown) < 20 ? "⚠ Moderate risk" : "⛔ High drawdown"}
        </div>
      </div>

      {/* Avg Hold Time */}
      <div className="pc-metric-card">
        <div className="pc-metric-icon" style={{ background: "var(--pc-purple-dim)" }}>⏱</div>
        <div className="pc-metric-label">Avg Hold Time</div>
        <div className="pc-metric-val" style={{ color: "var(--pc-purple)", fontSize: 22 }}>{avgHoldTime}</div>
        <div className="pc-metric-sub">Days per closed trade</div>
        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { label: "Total Trades", val: totalClosed },
          ].map(kv => (
            <div key={kv.label} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--pc-border)",
              borderRadius: 7, padding: "6px 10px",
              fontSize: 11, color: "var(--pc-text-2)"
            }}>
              {kv.label}: <strong style={{ color: "var(--pc-text)" }}>{kv.val}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Layer2_PerformanceMetrics;
