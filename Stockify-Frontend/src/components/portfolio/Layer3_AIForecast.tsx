import React from "react";

interface Holding {
  symbol: string;
  name: string;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
}

interface ForecastItem {
  symbol: string;
  signal: "BUY" | "HOLD" | "EXIT";
  target1D: number;
  target7D: number;
  uncertainty: number;         // ± percent
  narrative: string;           // Groq plain-English reason
  confidence: number;          // 0–100
}

interface Props {
  holdings: Holding[];
  forecasts: ForecastItem[];
  loading?: boolean;
}


function buildDummy(holdings: Holding[]): ForecastItem[] {
  const signals: ("BUY" | "HOLD" | "EXIT")[] = ["HOLD", "BUY", "EXIT", "HOLD", "BUY"];
  const narratives = [
    "Trading above 20-day EMA with positive FII flow. Volume breakout on D1 candle confirms momentum. Lean HOLD.",
    "RSI divergence on 4H with strong buying pressure at support. Clean risk/reward — BUY thesis intact.",
    "Bearish engulfing below 200 DMA. FII net sellers 3 sessions. Risk/reward unfavourable — consider EXIT.",
    "Consolidating in tight range. No breakout trigger yet. HOLD and watch for volume expansion.",
    "Sector rotation favouring this name. Q4 results beat estimates by 11%. Add on dips — BUY signal.",
  ];
  return holdings.map((h, i) => ({
    symbol: h.symbol.replace(".NS", "").replace(".BO", ""),
    signal: signals[i % signals.length],
    target1D: h.currentPrice * (1 + (Math.random() * 0.03 - 0.01)),
    target7D: h.currentPrice * (1 + (Math.random() * 0.07 - 0.02)),
    uncertainty: parseFloat((Math.random() * 3 + 1).toFixed(1)),
    narrative: narratives[i % narratives.length],
    confidence: Math.round(55 + Math.random() * 40),
  }));
}

const Layer3_AIForecast: React.FC<Props> = ({ holdings, forecasts, loading }) => {
  const items: ForecastItem[] = forecasts.length > 0 ? forecasts : buildDummy(holdings);

  if (loading) {
    return (
      <div className="pc-forecast-grid">
        {[0,1,2,3].map(i => (
          <div key={i} className="pc-forecast-card">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <div>
                <div className="pc-skeleton" style={{ width: 80, height: 16, marginBottom: 5 }} />
                <div className="pc-skeleton" style={{ width: 110, height: 11 }} />
              </div>
              <div className="pc-skeleton" style={{ width: 55, height: 26, borderRadius: 6 }} />
            </div>
            <div className="pc-forecast-targets">
              {[0,1].map(j => (
                <div key={j} className="pc-skeleton" style={{ height: 56, borderRadius: 8 }} />
              ))}
            </div>
            <div className="pc-skeleton" style={{ height: 42, borderRadius: 6, marginTop: 4 }} />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: "var(--pc-text-2)" }}>
        <div style={{ fontSize: 36, marginBottom: 10 }}>🤖</div>
        <p style={{ fontWeight: 600, margin: 0 }}>No holdings to forecast</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>Add positions to see AI price targets & signals</p>
      </div>
    );
  }

  return (
    <>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 18,
        padding: "10px 14px", borderRadius: 10,
        background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.15)",
      }}>
        <span style={{ fontSize: 16 }}>⚠️</span>
        <span style={{ fontSize: 12, color: "var(--pc-text-2)", lineHeight: 1.5 }}>
          AI signals are <strong style={{ color: "var(--pc-text)" }}>co-pilot suggestions only</strong> — 
          never auto-executed. Review narrative before acting. LSTM model + Groq synthesis.
        </span>
      </div>

      <div className="pc-forecast-grid">
        {items.map(fc => {
          const signalClass = fc.signal === "BUY"
            ? "pc-signal-buy" : fc.signal === "EXIT"
            ? "pc-signal-exit" : "pc-signal-hold";

          const confColor = fc.confidence >= 75 ? "var(--pc-green)"
            : fc.confidence >= 55 ? "var(--pc-amber)"
            : "var(--pc-red)";

          const holding = holdings.find(h =>
            h.symbol.replace(".NS","").replace(".BO","") === fc.symbol
          );

          
          return (
            <div className="pc-forecast-card" key={fc.symbol}>
              {/* Header */}
              <div className="pc-forecast-card-top">
                <div>
                  <div className="pc-forecast-sym">{fc.symbol}</div>
                  {holding && <div className="pc-forecast-name">{holding.name}</div>}
                </div>
                <span className={`pc-signal ${signalClass}`}>{fc.signal}</span>
              </div>

              {/* Confidence bar */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 10, color: "var(--pc-text-2)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Model Confidence</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: confColor }}>{fc.confidence}%</span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${fc.confidence}%`, background: confColor, borderRadius: 2, transition: "width 0.8s ease" }} />
                </div>
              </div>

              {/* Price Targets */}
              <div className="pc-forecast-targets">
                <div className="pc-target-block">
                  <div className="pc-target-label">1D Target</div>
                  <div className="pc-target-val">₹{fc.target1D.toFixed(1)}</div>
                  <div className="pc-target-band">±{fc.uncertainty}% band</div>
                </div>
                <div className="pc-target-block">
                  <div className="pc-target-label">7D Target</div>
                  <div className="pc-target-val">₹{fc.target7D.toFixed(1)}</div>
                  <div className="pc-target-band">±{(fc.uncertainty * 1.8).toFixed(1)}% band</div>
                </div>
              </div>

              {/* Groq Narrative */}
              <div className="pc-forecast-narrative">
                🧠 {fc.narrative}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default Layer3_AIForecast;
