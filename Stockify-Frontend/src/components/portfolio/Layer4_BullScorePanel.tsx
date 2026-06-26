import React from "react";

interface Holding {
  symbol: string;
  name: string;
  invested: number;
  current: number;
}

interface Props {
  bullScore: number;
  winRate: number;
  sharpeRatio: number;
  totalClosed: number;
  dynamicCap: number;
  holdings: Holding[];
  loading?: boolean;
}

function getBullTier(score: number): { name: string; color: string; bg: string } {
  if (score >= 90) return { name: "Grandmaster", color: "#a78bfa", bg: "rgba(167,139,250,0.12)" };
  if (score >= 75) return { name: "Diamond",     color: "#60a5fa", bg: "rgba(96,165,250,0.12)"  };
  if (score >= 60) return { name: "Gold",        color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  };
  if (score >= 40) return { name: "Silver",      color: "#94a3b8", bg: "rgba(148,163,184,0.12)" };
  return                   { name: "Bronze",     color: "#d97706", bg: "rgba(217,119,6,0.12)"   };
}

const SECTOR_COLORS = [
  "var(--pc-blue-bright)", "var(--pc-green)", "var(--pc-purple)", "var(--pc-amber)", "var(--pc-cyan)", "var(--pc-red)"
];

// derive sector from symbol suffix / name heuristic
function guessSector(symbol: string): string {
  const s = symbol.toUpperCase();
  if (s.includes("BANK") || s.includes("HDFC") || s.includes("AXIS") || s.includes("KOTAK")) return "Banking";
  if (s.includes("INFY") || s.includes("TCS") || s.includes("WIPRO") || s.includes("TECH"))  return "IT";
  if (s.includes("RELIANCE") || s.includes("ONGC") || s.includes("PETRONET"))                 return "Energy";
  if (s.includes("BAJAJ") || s.includes("TITAN") || s.includes("MARUTI"))                     return "Consumer";
  if (s.includes("PHARMA") || s.includes("DR") || s.includes("CIPLA") || s.includes("SUN"))  return "Pharma";
  return "Others";
}

const Layer4_BullScorePanel: React.FC<Props> = ({
  bullScore, winRate, sharpeRatio, totalClosed, dynamicCap, holdings, loading
}) => {
  const tier = getBullTier(bullScore ?? 0);

  // Build sector allocation
  const totalInvested = holdings.reduce((s, h) => s + (h.invested || 0), 0);
  const sectorMap: Record<string, number> = {};
  holdings.forEach(h => {
    const sec = guessSector(h.symbol.replace(".NS","").replace(".BO",""));
    sectorMap[sec] = (sectorMap[sec] || 0) + (h.invested || 0);
  });
  const sectors = Object.entries(sectorMap)
    .map(([name, amt]) => ({ name, pct: totalInvested > 0 ? (amt / totalInvested) * 100 : 0 }))
    .sort((a, b) => b.pct - a.pct);

  // Top-3 concentration
  const sorted = [...holdings].sort((a, b) => (b.invested || 0) - (a.invested || 0));
  const top3Invested = sorted.slice(0, 3).reduce((s, h) => s + (h.invested || 0), 0);
  const top3Pct = totalInvested > 0 ? (top3Invested / totalInvested) * 100 : 0;
  const concRisk = top3Pct > 50 ? "danger" : top3Pct > 40 ? "warn" : "ok";
  const concMsg = concRisk === "danger"
    ? `⚠ Top 3 positions = ${top3Pct.toFixed(1)}% of portfolio — high concentration risk`
    : concRisk === "warn"
    ? `Top 3 positions = ${top3Pct.toFixed(1)}% — approaching concentration limit`
    : `Top 3 positions = ${top3Pct.toFixed(1)}% — within healthy 40% threshold ✓`;

  // SVG radial gauge
  const RADIUS = 70; const STROKE = 10;
  const circumference = 2 * Math.PI * RADIUS;
  const dash = ((bullScore ?? 0) / 100) * circumference * 0.75;
  const gapOffset = circumference * 0.125;

  if (loading) {
    return (
      <div className="pc-layer4-grid">
        <div className="pc-skeleton" style={{ width: 180, height: 200, borderRadius: 16 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0,1,2,3].map(i => <div key={i} className="pc-skeleton" style={{ height: 22, borderRadius: 6 }} />)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0,1,2].map(i => <div key={i} className="pc-skeleton" style={{ height: 40, borderRadius: 8 }} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="pc-layer4-grid">

      {/* ── Radial Gauge ── */}
      <div className="pc-bull-gauge-wrap">
        <svg width="180" height="180" className="pc-radial-svg" viewBox="0 0 180 180">
          <defs>
            <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={tier.color} stopOpacity="0.6" />
              <stop offset="100%" stopColor={tier.color} />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          {/* Track */}
          <circle cx="90" cy="90" r={RADIUS}
            fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={STROKE}
            strokeDasharray={`${circumference * 0.75} ${circumference * 0.25}`}
            strokeDashoffset={gapOffset}
            strokeLinecap="round"
            transform="rotate(135 90 90)"
          />
          {/* Fill */}
          <circle cx="90" cy="90" r={RADIUS}
            fill="none" stroke="url(#gaugeGrad)" strokeWidth={STROKE}
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={gapOffset}
            strokeLinecap="round"
            transform="rotate(135 90 90)"
            filter="url(#glow)"
            style={{ transition: "stroke-dasharray 1s ease" }}
          />
          {/* Score */}
          <text x="90" y="83" textAnchor="middle" className="pc-gauge-score-label"
            fill="var(--pc-text)" fontSize="32" fontWeight="900" fontFamily="Inter">
            {Math.round(bullScore ?? 0)}
          </text>
          <text x="90" y="100" textAnchor="middle"
            fill={tier.color} fontSize="12" fontWeight="700" fontFamily="Inter">
            {tier.name}
          </text>
          <text x="90" y="115" textAnchor="middle"
            fill="rgba(148,163,184,0.7)" fontSize="10" fontFamily="Inter">
            Bull Score
          </text>
        </svg>

        {/* Tier Badge */}
        <div className="pc-bull-tier-badge" style={{ background: tier.bg, color: tier.color, border: `1px solid ${tier.color}40` }}>
          🏆 {tier.name} Tier
        </div>

        {/* Stats below gauge */}
        <div className="pc-bull-stats">
          <div className="pc-bull-stat">
            <div className="pc-bull-stat-label">Win Rate</div>
            <div className="pc-bull-stat-val pc-green-text">{winRate}%</div>
          </div>
          <div className="pc-bull-stat">
            <div className="pc-bull-stat-label">Trades</div>
            <div className="pc-bull-stat-val">{totalClosed}</div>
          </div>
          <div className="pc-bull-stat">
            <div className="pc-bull-stat-label">Sharpe</div>
            <div className="pc-bull-stat-val" style={{ color: "var(--pc-blue-bright)" }}>
              {sharpeRatio?.toFixed(2) ?? "—"}
            </div>
          </div>
          <div className="pc-bull-stat">
            <div className="pc-bull-stat-label">Dyn. Cap</div>
            <div className="pc-bull-stat-val" style={{ color: "var(--pc-green)", fontSize: 14 }}>
              ₹{dynamicCap?.toLocaleString("en-IN") ?? "—"}
            </div>
          </div>
        </div>
      </div>

      {/* ── Sector Breakdown ── */}
      <div className="pc-sector-panel">
        <div className="pc-sector-title">Sector Exposure</div>
        {sectors.length === 0 && (
          <div style={{ color: "var(--pc-text-2)", fontSize: 13 }}>No holdings data</div>
        )}
        {sectors.map((s, i) => (
          <div className="pc-sector-row" key={s.name}>
            <div className="pc-sector-meta">
              <span className="pc-sector-name" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: SECTOR_COLORS[i % SECTOR_COLORS.length], display: "inline-block" }} />
                {s.name}
              </span>
              <span className="pc-sector-pct">{s.pct.toFixed(1)}%</span>
            </div>
            <div className="pc-sector-track">
              <div className="pc-sector-fill" style={{ width: `${s.pct}%`, background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
            </div>
          </div>
        ))}

        {/* Formula chip */}
        <div className="pc-formula-chip">
          Bull = <span>WinRate × 0.4</span> + <span>Sharpe × 0.3</span> +{" "}
          <span>Consistency × 0.2</span> + <span>Activity × 0.1</span>
        </div>
      </div>

      {/* ── Concentration Risk ── */}
      <div className="pc-conc-panel">
        <div className="pc-sector-title">Concentration Risk</div>

        <div className={`pc-conc-alert ${concRisk}`}>
          <span className="pc-conc-icon">
            {concRisk === "ok" ? "✅" : concRisk === "warn" ? "⚠️" : "🔴"}
          </span>
          <span>{concMsg}</span>
        </div>

        {sorted.slice(0, 5).map((h, i) => {
          const pct = totalInvested > 0 ? ((h.invested || 0) / totalInvested) * 100 : 0;
          return (
            <div key={h.symbol} className="pc-sector-row">
              <div className="pc-sector-meta">
                <span className="pc-sector-name">
                  #{i + 1} {h.symbol.replace(".NS","").replace(".BO","")}
                </span>
                <span className="pc-sector-pct" style={{ color: pct > 20 ? "var(--pc-amber)" : "var(--pc-text-2)" }}>
                  {pct.toFixed(1)}%
                </span>
              </div>
              <div className="pc-sector-track">
                <div className="pc-sector-fill" style={{
                  width: `${pct}%`,
                  background: pct > 25 ? "var(--pc-red)" : pct > 20 ? "var(--pc-amber)" : "var(--pc-blue-bright)"
                }} />
              </div>
            </div>
          );
        })}

        <div style={{ fontSize: 11, color: "var(--pc-text-2)", marginTop: 6, padding: "8px 10px",
          background: "rgba(255,255,255,0.025)", borderRadius: 8, border: "1px solid var(--pc-border)" }}>
          Guideline: Top 3 holdings should not exceed <strong style={{ color: "var(--pc-text)" }}>40–50%</strong> of total portfolio value.
        </div>
      </div>
    </div>
  );
};

export default Layer4_BullScorePanel;
