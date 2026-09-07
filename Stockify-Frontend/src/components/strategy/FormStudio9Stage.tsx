import React, { useState } from "react";
import { AlgoSimulationChart } from "../charts/AlgoSimulationChart";
import "./StrategyBuilder.css";
import type {
  IndicatorConfig,
  ConditionItem,
  TrendFilterConfig,
  PositionSizingConfig,
  StopLossConfig,
  TakeProfitConfig,
  PortfolioGuardrailsConfig
} from "./StrategyBuilder";

export interface FormStudio9StageProps {
  symbol: string;
  setSymbol: (s: string) => void;
  selectedBasket: string;
  setSelectedBasket: (b: string) => void;
  handleBasketChange: (b: string) => void;
  basketPresets: Record<string, string[]>;
  period: string;
  setPeriod: (p: string) => void;
  candleInterval: string;
  setCandleInterval: (i: string) => void;
  startDate: string;
  setStartDate: (d: string) => void;
  endDate: string;
  setEndDate: (d: string) => void;
  initialCapital: number;
  setInitialCapital: (c: number) => void;
  indicators: IndicatorConfig[];
  setIndicators: React.Dispatch<React.SetStateAction<IndicatorConfig[]>>;
  addIndicatorByType: (type: string) => void;
  removeIndicator: (idx: number) => void;
  updateIndicator: (idx: number, updates: Partial<IndicatorConfig>) => void;
  trendFilter: TrendFilterConfig;
  setTrendFilter: React.Dispatch<React.SetStateAction<TrendFilterConfig>>;
  entryLogicType: "SINGLE" | "AND" | "OR";
  setEntryLogicType: React.Dispatch<React.SetStateAction<"SINGLE" | "AND" | "OR">>;
  entryConditions: ConditionItem[];
  setEntryConditions: React.Dispatch<React.SetStateAction<ConditionItem[]>>;
  exitLogicType: "SINGLE" | "AND" | "OR";
  setExitLogicType: React.Dispatch<React.SetStateAction<"SINGLE" | "AND" | "OR">>;
  exitConditions: ConditionItem[];
  setExitConditions: React.Dispatch<React.SetStateAction<ConditionItem[]>>;
  positionSizing: PositionSizingConfig;
  setPositionSizing: React.Dispatch<React.SetStateAction<PositionSizingConfig>>;
  stopLoss: StopLossConfig;
  setStopLoss: React.Dispatch<React.SetStateAction<StopLossConfig>>;
  takeProfit: TakeProfitConfig;
  setTakeProfit: React.Dispatch<React.SetStateAction<TakeProfitConfig>>;
  breakevenTriggerPct: number;
  setBreakevenTriggerPct: React.Dispatch<React.SetStateAction<number>>;
  portfolioGuardrails: PortfolioGuardrailsConfig;
  setPortfolioGuardrails: React.Dispatch<React.SetStateAction<PortfolioGuardrailsConfig>>;
  availableVariables: { key: string; label: string }[];
  previewCustomIndicator: (ind: IndicatorConfig) => void;
  previewLoading: boolean;
  previewOutput: string | null;
  report?: any;
  indicatorSeries?: any[];
  isScanning?: boolean;
  scanProgress?: number;
  visibleTrades?: any[];
}

export const FormStudio9Stage: React.FC<FormStudio9StageProps> = ({
  symbol,
  setSymbol,
  selectedBasket,
  handleBasketChange,
  basketPresets,
  period,
  setPeriod,
  candleInterval,
  setCandleInterval,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  initialCapital,
  setInitialCapital,
  indicators,
  addIndicatorByType,
  removeIndicator,
  updateIndicator,
  trendFilter,
  setTrendFilter,
  entryLogicType,
  setEntryLogicType,
  entryConditions,
  setEntryConditions,
  exitLogicType,
  setExitLogicType,
  exitConditions,
  setExitConditions,
  positionSizing,
  setPositionSizing,
  stopLoss,
  setStopLoss,
  takeProfit,
  setTakeProfit,
  breakevenTriggerPct,
  setBreakevenTriggerPct,
  portfolioGuardrails,
  setPortfolioGuardrails,
  availableVariables,
  previewCustomIndicator,
  previewLoading,
  previewOutput,
  report,
  indicatorSeries = [],
  isScanning = false,
  scanProgress = 0,
  visibleTrades = []
}) => {
  const [activeStage, setActiveStage] = useState<number>(1);
  const [showRawConditionEngine, setShowRawConditionEngine] = useState(false);

  // Group active indicators for intelligent form options
  const movingAverages = indicators.filter(ind => ["EMA", "SMA"].includes(ind.name));
  const rsiInds = indicators.filter(ind => ind.name === "RSI");
  const superTrendInds = indicators.filter(ind => ind.name === "SuperTrend");
  const macdInds = indicators.filter(ind => ind.name === "MACD");
  const bbInds = indicators.filter(ind => ["BollingerBands", "BB"].includes(ind.name));
  const vwapInds = indicators.filter(ind => ind.name === "VWAP");

  const STAGES = [
    { num: 1, label: "Universe & Timeframe", icon: "🌐" },
    { num: 2, label: "Indicators", icon: "📊" },
    { num: 3, label: "Trend Regime", icon: "🎯" },
    { num: 4, label: "Entry Signals", icon: "⚡" },
    { num: 5, label: "Exit Rules", icon: "🚪" },
    { num: 6, label: "Position Sizing", icon: "💰" },
    { num: 7, label: "Stop Loss", icon: "🛡️" },
    { num: 8, label: "Take Profit", icon: "🎯" },
    { num: 9, label: "Guardrails", icon: "📋" }
  ];

  return (
    <div className="pb-form-studio-9stage" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* ── PERMANENT LIVE SIMULATION CHART CANVAS ── */}
      <div className="pb-section-card" style={{ padding: "16px" }}>
        <div className="pb-section-header" style={{ marginBottom: "10px", paddingBottom: "8px" }}>
          <div className="pb-section-title-box">
            <h3>📈 Live Simulation Chart ({symbol})</h3>
            <p className="pb-section-desc">{symbol} • {candleInterval.toUpperCase()} • {period.toUpperCase()}</p>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            {indicatorSeries.map(ind => (
              <span key={ind.key} style={{ color: ind.color, fontSize: "0.78rem", fontWeight: "bold", background: "#0d1a2d", padding: "3px 8px", borderRadius: "6px", border: "1px solid #1e3a5f" }}>
                ● {ind.label}
              </span>
            ))}
            <span style={{ color: "#10b981", fontSize: "0.78rem", fontWeight: "bold", background: "rgba(16, 185, 129, 0.1)", padding: "3px 8px", borderRadius: "6px" }}>▲ Buy Signal</span>
            <span style={{ color: "#ef4444", fontSize: "0.78rem", fontWeight: "bold", background: "rgba(239, 68, 68, 0.1)", padding: "3px 8px", borderRadius: "6px" }}>▼ Sell Signal</span>
          </div>
        </div>

        {report?.price_data && report.price_data.length > 0 ? (
          <div style={{ position: "relative", minHeight: "360px", borderRadius: "8px", background: "#0b1523", display: "flex", flexDirection: "column" }}>
            <AlgoSimulationChart
              lineData={(report?.price_data || [])
                .map((d: any) => ({ x: new Date(d.x).getTime(), y: d.y }))
                .filter((d: any) => !isNaN(d.x) && !isNaN(d.y))}
              timeframe={period === "custom" ? "ALL" : (period.toUpperCase() || "1Y")}
              percent={report?.total_return_pct != null ? report.total_return_pct.toString() : "0"}
              indicatorSeries={indicatorSeries || []}
              isScanning={isScanning}
              scanProgress={scanProgress}
              trades={(visibleTrades || []).map((sig: any) => ({
                side: sig.type as "BUY" | "SELL",
                quantity: 1,
                pricePerShare: sig.price || 0,
                createdAtIST: sig.executed_at,
              }))}
            />
          </div>
        ) : (
          <div className="pb-empty-box" style={{ padding: "20px" }}>
            <span>⚡ Ready for simulation. Click <strong>▶ Run</strong> in the top control bar to plot candles &amp; indicators.</span>
          </div>
        )}
      </div>

      {/* ── 9-STAGE STEPPER / STAGE SELECTOR ── */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", background: "#091322", padding: "10px 14px", borderRadius: "10px", border: "1px solid #1e3a5f" }}>
        {STAGES.map(s => (
          <button
            key={s.num}
            onClick={() => setActiveStage(s.num)}
            style={{
              flex: 1,
              minWidth: "120px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: activeStage === s.num ? "linear-gradient(135deg, #0ea659, #059669)" : "#112238",
              border: activeStage === s.num ? "1px solid #34d399" : "1px solid #1e3a5f",
              color: activeStage === s.num ? "#fff" : "#94a3b8",
              padding: "8px 12px",
              borderRadius: "8px",
              fontSize: "0.82rem",
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.15s"
            }}
          >
            <span>{s.icon}</span>
            <span>{s.num}. {s.label}</span>
          </button>
        ))}
      </div>

      {/* ── STAGE 1: UNIVERSE & TIMEFRAME ── */}
      {activeStage === 1 && (
        <div className="pb-section-card">
          <div className="pb-section-header">
            <div className="pb-section-title-box">
              <h3>🌐 Stage 1: Asset Universe &amp; Simulation Timeframe</h3>
              <p className="pb-section-desc">Configure the trading universe, historical testing horizon, and starting capital.</p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px" }}>
            <div className="input-group">
              <label>Asset Universe / Basket</label>
              <select value={selectedBasket} onChange={e => handleBasketChange(e.target.value)}>
                {Object.keys(basketPresets).map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div className="input-group">
              <label>Active Stock Symbol</label>
              <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="e.g. TCS" />
            </div>

            <div className="input-group">
              <label>Historical Period</label>
              <select
                value={period}
                onChange={e => {
                  const p = e.target.value;
                  setPeriod(p);
                  if (p === "1d" || p === "5d") setCandleInterval("1m");
                  else if (p === "1mo") setCandleInterval("2m");
                  else if (p === "3mo") setCandleInterval("5m");
                  else if (["6mo", "1y", "2y", "5y"].includes(p)) setCandleInterval("1h");
                  else if (p === "max") setCandleInterval("1d");
                }}
              >
                <option value="1d">1 Day (1m Intraday)</option>
                <option value="5d">5 Days (1m High Res)</option>
                <option value="1mo">1 Month (2m High Res)</option>
                <option value="3mo">3 Months (5m Momentum)</option>
                <option value="6mo">6 Months (1h Resolution)</option>
                <option value="1y">1 Year (1h Resolution)</option>
                <option value="2y">2 Years (1h Resolution)</option>
                <option value="5y">5 Years (1h Resolution)</option>
                <option value="max">All Historical Data (1d)</option>
                <option value="custom">Custom Date Range</option>
              </select>
            </div>

            <div className="input-group">
              <label>Data Resolution (Auto-Selected)</label>
              <div style={{ padding: "10px 14px", borderRadius: "8px", background: "#0b1523", border: "1px solid #1e3a5f", color: "#38bdf8", fontSize: "0.88rem", fontWeight: "600", display: "flex", alignItems: "center", gap: "8px" }}>
                <span>⚡ Auto Interval:</span>
                <span style={{ color: "#10b981", background: "rgba(16, 185, 129, 0.12)", padding: "2px 8px", borderRadius: "4px" }}>
                  {candleInterval.toUpperCase()} ({["6mo", "1y", "2y", "5y"].includes(period) ? "1-Hour Standard" : "Highest Supported Resolution"})
                </span>
              </div>
            </div>

            {period === "custom" && (
              <>
                <div className="input-group">
                  <label>Start Date</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="input-group">
                  <label>End Date</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              </>
            )}

            <div className="input-group">
              <label>Initial Simulation Capital (₹)</label>
              <input
                type="number"
                value={initialCapital}
                onChange={e => setInitialCapital(Number(e.target.value))}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── STAGE 2: TECHNICAL INDICATORS ── */}
      {activeStage === 2 && (
        <div className="pb-section-card">
          <div className="pb-section-header">
            <div className="pb-section-title-box">
              <h3>📊 Stage 2: Technical Indicators &amp; Math Engines</h3>
              <p className="pb-section-desc">Add technical indicators. The strategy engine will automatically calculate these series.</p>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <select
                className="pb-add-select"
                onChange={e => {
                  if (e.target.value) {
                    addIndicatorByType(e.target.value);
                    e.target.value = "";
                  }
                }}
                defaultValue=""
              >
                <option value="" disabled>+ Add Indicator...</option>
                <option value="EMA">+ EMA (Exponential Moving Average)</option>
                <option value="SMA">+ SMA (Simple Moving Average)</option>
                <option value="RSI">+ RSI (Relative Strength Index)</option>
                <option value="SuperTrend">+ SuperTrend (Trend Follower)</option>
                <option value="MACD">+ MACD (Momentum & Signal)</option>
                <option value="BollingerBands">+ Bollinger Bands (Volatility)</option>
                <option value="VWAP">+ VWAP (Volume Weighted Price)</option>
                <option value="ATR">+ ATR (Volatility Range)</option>
                <option value="Formula">+ Formula (Custom Math)</option>
              </select>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {indicators.map((ind, idx) => (
              <div key={idx} className="item-row" style={{ display: "flex", gap: "12px", alignItems: "center", background: "#0d1a2d", padding: "12px 16px", borderRadius: "8px", border: "1px solid #1e3a5f" }}>
                <div className="input-group">
                  <label>Type</label>
                  <select value={ind.name} onChange={e => updateIndicator(idx, { name: e.target.value })}>
                    <option value="EMA">EMA</option>
                    <option value="SMA">SMA</option>
                    <option value="RSI">RSI</option>
                    <option value="MACD">MACD</option>
                    <option value="VWAP">VWAP</option>
                    <option value="ATR">ATR</option>
                    <option value="SuperTrend">SuperTrend</option>
                    <option value="BollingerBands">Bollinger Bands</option>
                    <option value="Formula">Custom Formula</option>
                  </select>
                </div>

                <div className="input-group">
                  <label>Key Name</label>
                  <input value={ind.key} onChange={e => updateIndicator(idx, { key: e.target.value })} />
                </div>

                {ind.name === "Formula" ? (
                  <div className="input-group" style={{ flex: 1 }}>
                    <label>Formula Expression</label>
                    <input
                      value={ind.formula || ""}
                      onChange={e => updateIndicator(idx, { formula: e.target.value })}
                      placeholder="e.g. highest(high, 20)"
                    />
                  </div>
                ) : ind.name === "SuperTrend" ? (
                  <>
                    <div className="input-group">
                      <label>Period</label>
                      <input
                        type="number"
                        value={ind.params?.period || 10}
                        onChange={e => updateIndicator(idx, { params: { ...ind.params, period: Number(e.target.value) } })}
                      />
                    </div>
                    <div className="input-group">
                      <label>Multiplier</label>
                      <input
                        type="number"
                        step="0.1"
                        value={ind.params?.multiplier || 3}
                        onChange={e => updateIndicator(idx, { params: { ...ind.params, multiplier: Number(e.target.value) } })}
                      />
                    </div>
                  </>
                ) : ind.name === "BollingerBands" ? (
                  <>
                    <div className="input-group">
                      <label>Period</label>
                      <input
                        type="number"
                        value={ind.params?.period || 20}
                        onChange={e => updateIndicator(idx, { params: { ...ind.params, period: Number(e.target.value) } })}
                      />
                    </div>
                    <div className="input-group">
                      <label>Std Dev</label>
                      <input
                        type="number"
                        step="0.1"
                        value={ind.params?.std_dev || 2}
                        onChange={e => updateIndicator(idx, { params: { ...ind.params, std_dev: Number(e.target.value) } })}
                      />
                    </div>
                  </>
                ) : (
                  <div className="input-group">
                    <label>Period</label>
                    <input
                      type="number"
                      value={ind.params?.period || 14}
                      onChange={e => updateIndicator(idx, { params: { ...ind.params, period: Number(e.target.value) } })}
                    />
                  </div>
                )}

                <button
                  className="preview-btn"
                  onClick={() => previewCustomIndicator(ind)}
                  disabled={previewLoading}
                  style={{ marginTop: "auto", marginBottom: "4px" }}
                >
                  {previewLoading ? "Testing..." : "👁️ Preview"}
                </button>

                <button
                  className="delete-btn"
                  onClick={() => removeIndicator(idx)}
                  style={{ marginTop: "auto", marginBottom: "4px" }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {previewOutput && (
            <div className="preview-box" style={{ background: "#0b1523", border: "1px solid #1e3a5f", padding: "12px", borderRadius: "8px", color: "#38bdf8", fontFamily: "monospace", fontSize: "0.85rem" }}>
              {previewOutput}
            </div>
          )}
        </div>
      )}

      {/* ── STAGE 3: TREND REGIME GATE ── */}
      {activeStage === 3 && (
        <div className="pb-section-card">
          <div className="pb-section-header">
            <div className="pb-section-title-box">
              <h3>🎯 Stage 3: Macro Trend Filter (Regime Gate)</h3>
              <p className="pb-section-desc">Permit trades only when market is confirmed in your desired trend regime.</p>
            </div>
            <button
              className={`pb-logic-btn ${trendFilter.enabled ? "active" : ""}`}
              onClick={() => setTrendFilter(prev => ({ ...prev, enabled: !prev.enabled }))}
            >
              {trendFilter.enabled ? "✓ Enabled" : "○ Disabled (All Regimes)"}
            </button>
          </div>

          <div className="pb-signals-grid">
            <div
              className={`pb-signal-tile ${!trendFilter.enabled ? "selected" : ""}`}
              onClick={() => setTrendFilter({ enabled: false, type: "GreaterThan", args: ["close", "close"] })}
            >
              <div className="pb-signal-top">
                <div className="pb-signal-radio">{!trendFilter.enabled && <div className="pb-signal-radio-dot" />}</div>
                <span className="pb-signal-name">No Regime Gate (Trade All Conditions)</span>
              </div>
              <span className="pb-signal-desc">Execute entries without filtering by long-term macro trend.</span>
            </div>

            {movingAverages.map(ma => (
              <div
                key={ma.key}
                className={`pb-signal-tile ${trendFilter.enabled && trendFilter.args[1] === ma.key ? "selected" : ""}`}
                onClick={() => setTrendFilter({ enabled: true, type: "GreaterThan", args: ["close", ma.key] })}
              >
                <div className="pb-signal-top">
                  <div className="pb-signal-radio">{trendFilter.enabled && trendFilter.args[1] === ma.key && <div className="pb-signal-radio-dot" />}</div>
                  <span className="pb-signal-name">Price Above {ma.key} ({ma.name})</span>
                </div>
                <span className="pb-signal-desc">Only take long positions when price is trading above {ma.key}.</span>
              </div>
            ))}

            {movingAverages.length >= 2 && (
              <div
                className={`pb-signal-tile ${trendFilter.enabled && trendFilter.args[0] === movingAverages[0].key && trendFilter.args[1] === movingAverages[1].key ? "selected" : ""}`}
                onClick={() => setTrendFilter({ enabled: true, type: "GreaterThan", args: [movingAverages[0].key, movingAverages[1].key] })}
              >
                <div className="pb-signal-top">
                  <div className="pb-signal-radio">{trendFilter.enabled && trendFilter.args[0] === movingAverages[0].key && <div className="pb-signal-radio-dot" />}</div>
                  <span className="pb-signal-name">{movingAverages[0].key} &gt; {movingAverages[1].key} (Bullish Moving Average Stack)</span>
                </div>
                <span className="pb-signal-desc">Only trade when fast moving average is strictly above slow moving average.</span>
              </div>
            )}

            {superTrendInds.map(st => (
              <div
                key={st.key}
                className={`pb-signal-tile ${trendFilter.enabled && trendFilter.args[1] === st.key ? "selected" : ""}`}
                onClick={() => setTrendFilter({ enabled: true, type: "GreaterThan", args: ["close", st.key] })}
              >
                <div className="pb-signal-top">
                  <div className="pb-signal-radio">{trendFilter.enabled && trendFilter.args[1] === st.key && <div className="pb-signal-radio-dot" />}</div>
                  <span className="pb-signal-name">SuperTrend Bullish ({st.key})</span>
                </div>
                <span className="pb-signal-desc">Only trade when SuperTrend ribbon is green.</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── STAGE 4: ENTRY SIGNALS ── */}
      {activeStage === 4 && (
        <div className="pb-section-card">
          <div className="pb-section-header">
            <div className="pb-section-title-box">
              <h3>⚡ Stage 4: Entry Signals &amp; Trigger Conditions</h3>
              <p className="pb-section-desc">Select valid entry triggers generated automatically from your selected indicators.</p>
            </div>
            <div className="pb-logic-toggle">
              <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Combine Triggers:</span>
              <button
                className={`pb-logic-btn ${entryLogicType === "AND" ? "active" : ""}`}
                onClick={() => setEntryLogicType("AND")}
              >
                AND (All Conditions Required)
              </button>
              <button
                className={`pb-logic-btn ${entryLogicType === "OR" ? "active" : ""}`}
                onClick={() => setEntryLogicType("OR")}
              >
                OR (Any Condition Triggers)
              </button>
            </div>
          </div>

          <div className="pb-signals-grid">
            {/* MA Golden Cross */}
            {movingAverages.length >= 2 && (
              <div
                className={`pb-signal-tile ${entryConditions.some(c => c.type === "CrossAbove" && c.args[0] === movingAverages[0].key && c.args[1] === movingAverages[1].key) ? "selected" : ""}`}
                onClick={() => {
                  const cond = { type: "CrossAbove", args: [movingAverages[0].key, movingAverages[1].key] };
                  setEntryConditions(prev => {
                    const exists = prev.some(c => c.type === cond.type && JSON.stringify(c.args) === JSON.stringify(cond.args));
                    return exists ? prev.filter(c => !(c.type === cond.type && JSON.stringify(c.args) === JSON.stringify(cond.args))) : [...prev, cond];
                  });
                }}
              >
                <div className="pb-signal-top">
                  <div className="pb-signal-radio">
                    {entryConditions.some(c => c.type === "CrossAbove" && c.args[0] === movingAverages[0].key && c.args[1] === movingAverages[1].key) && <div className="pb-signal-radio-dot" />}
                  </div>
                  <span className="pb-signal-name">⚡ {movingAverages[0].key} Crosses Above {movingAverages[1].key}</span>
                </div>
                <span className="pb-signal-desc">Bullish moving average crossover trigger.</span>
              </div>
            )}

            {/* Price crosses MA */}
            {movingAverages.map(ma => (
              <div
                key={ma.key}
                className={`pb-signal-tile ${entryConditions.some(c => c.type === "CrossAbove" && c.args[0] === "close" && c.args[1] === ma.key) ? "selected" : ""}`}
                onClick={() => {
                  const cond = { type: "CrossAbove", args: ["close", ma.key] };
                  setEntryConditions(prev => {
                    const exists = prev.some(c => c.type === cond.type && JSON.stringify(c.args) === JSON.stringify(cond.args));
                    return exists ? prev.filter(c => !(c.type === cond.type && JSON.stringify(c.args) === JSON.stringify(cond.args))) : [...prev, cond];
                  });
                }}
              >
                <div className="pb-signal-top">
                  <div className="pb-signal-radio">
                    {entryConditions.some(c => c.type === "CrossAbove" && c.args[0] === "close" && c.args[1] === ma.key) && <div className="pb-signal-radio-dot" />}
                  </div>
                  <span className="pb-signal-name">📈 Price Crosses Above {ma.key}</span>
                </div>
                <span className="pb-signal-desc">Buy breakout when candle closes above {ma.key}.</span>
              </div>
            ))}

            {/* RSI Oversold Trigger */}
            {rsiInds.map(rsi => (
              <div
                key={rsi.key}
                className={`pb-signal-tile ${entryConditions.some(c => c.args.includes(rsi.key)) ? "selected" : ""}`}
                onClick={() => {
                  setEntryConditions(prev => [
                    ...prev.filter(c => !c.args.includes(rsi.key)),
                    { type: "LessThan", args: [rsi.key, 35] }
                  ]);
                }}
              >
                <div className="pb-signal-top">
                  <div className="pb-signal-radio">
                    {entryConditions.some(c => c.args.includes(rsi.key)) && <div className="pb-signal-radio-dot" />}
                  </div>
                  <span className="pb-signal-name">⚡ {rsi.key} Oversold Dip Pullback (&lt; 35)</span>
                </div>
                <span className="pb-signal-desc">Buy momentum pullbacks when RSI drops below oversold threshold.</span>
              </div>
            ))}

            {/* SuperTrend Breakout */}
            {superTrendInds.map(st => (
              <div
                key={st.key}
                className={`pb-signal-tile ${entryConditions.some(c => c.args.includes(st.key)) ? "selected" : ""}`}
                onClick={() => {
                  const cond = { type: "CrossAbove", args: ["close", st.key] };
                  setEntryConditions(prev => [
                    ...prev.filter(c => !c.args.includes(st.key)),
                    cond
                  ]);
                }}
              >
                <div className="pb-signal-top">
                  <div className="pb-signal-radio">
                    {entryConditions.some(c => c.args.includes(st.key)) && <div className="pb-signal-radio-dot" />}
                  </div>
                  <span className="pb-signal-name">🎯 SuperTrend Bullish Flip (Price ↑ {st.key})</span>
                </div>
                <span className="pb-signal-desc">Buy when candle crosses above SuperTrend to turn bullish.</span>
              </div>
            ))}

            {/* MACD Cross */}
            {macdInds.map(macd => (
              <div
                key={macd.key}
                className={`pb-signal-tile ${entryConditions.some(c => c.args.some(a => String(a).startsWith(macd.key))) ? "selected" : ""}`}
                onClick={() => {
                  setEntryConditions(prev => [
                    ...prev.filter(c => !c.args.some(a => String(a).startsWith(macd.key))),
                    { type: "CrossAbove", args: [`${macd.key}.macd`, `${macd.key}.signal`] }
                  ]);
                }}
              >
                <div className="pb-signal-top">
                  <div className="pb-signal-radio">
                    {entryConditions.some(c => c.args.some(a => String(a).startsWith(macd.key))) && <div className="pb-signal-radio-dot" />}
                  </div>
                  <span className="pb-signal-name">📊 MACD Line Crosses Above Signal Line</span>
                </div>
                <span className="pb-signal-desc">Momentum entry when MACD accelerates upward.</span>
              </div>
            ))}

            {/* Bollinger Band Lower */}
            {bbInds.map(bb => (
              <div
                key={bb.key}
                className={`pb-signal-tile ${entryConditions.some(c => c.args.some(a => String(a).startsWith(bb.key))) ? "selected" : ""}`}
                onClick={() => {
                  setEntryConditions(prev => [
                    ...prev.filter(c => !c.args.some(a => String(a).startsWith(bb.key))),
                    { type: "LessThan", args: ["close", `${bb.key}.lower`] }
                  ]);
                }}
              >
                <div className="pb-signal-top">
                  <div className="pb-signal-radio">
                    {entryConditions.some(c => c.args.some(a => String(a).startsWith(bb.key))) && <div className="pb-signal-radio-dot" />}
                  </div>
                  <span className="pb-signal-name">🌊 Price Touches Lower Bollinger Band</span>
                </div>
                <span className="pb-signal-desc">Mean reversion dip purchase at lower volatility boundary.</span>
              </div>
            ))}

            {/* VWAP Breakout */}
            {vwapInds.map(vwap => (
              <div
                key={vwap.key}
                className={`pb-signal-tile ${entryConditions.some(c => c.args.includes(vwap.key)) ? "selected" : ""}`}
                onClick={() => {
                  setEntryConditions(prev => [
                    ...prev.filter(c => !c.args.includes(vwap.key)),
                    { type: "CrossAbove", args: ["close", vwap.key] }
                  ]);
                }}
              >
                <div className="pb-signal-top">
                  <div className="pb-signal-radio">
                    {entryConditions.some(c => c.args.includes(vwap.key)) && <div className="pb-signal-radio-dot" />}
                  </div>
                  <span className="pb-signal-name">⚓ Price Crosses Above VWAP</span>
                </div>
                <span className="pb-signal-desc">Institutional volume-weighted breakout.</span>
              </div>
            ))}
          </div>

          {/* Raw Condition Engine for Power Users */}
          <div className="pb-advanced-box">
            <div className="pb-adv-header">
              <span className="pb-adv-title">🛠️ Advanced Custom Rules Engine</span>
              <button
                className="pb-logic-btn"
                onClick={() => setShowRawConditionEngine(!showRawConditionEngine)}
              >
                {showRawConditionEngine ? "Hide Raw Rules" : "Expose Left/Comparator/Right"}
              </button>
            </div>

            {showRawConditionEngine && (
              <div>
                {entryConditions.map((cond, idx) => (
                  <div key={idx} style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
                    <select
                      value={cond.args[0] || "close"}
                      onChange={e => {
                        const newArgs = [...cond.args];
                        newArgs[0] = e.target.value;
                        setEntryConditions(prev => prev.map((item, i) => i === idx ? { ...item, args: newArgs } : item));
                      }}
                    >
                      {availableVariables.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
                    </select>

                    <select
                      value={cond.type}
                      onChange={e => {
                        setEntryConditions(prev => prev.map((item, i) => i === idx ? { ...item, type: e.target.value } : item));
                      }}
                    >
                      <option value="CrossAbove">Crosses Above (↑)</option>
                      <option value="CrossBelow">Crosses Below (↓)</option>
                      <option value="GreaterThan">Greater Than (&gt;)</option>
                      <option value="LessThan">Less Than (&lt;)</option>
                    </select>

                    <select
                      value={cond.args[1]}
                      onChange={e => {
                        const newArgs = [...cond.args];
                        newArgs[1] = isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value);
                        setEntryConditions(prev => prev.map((item, i) => i === idx ? { ...item, args: newArgs } : item));
                      }}
                    >
                      {availableVariables.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
                    </select>

                    <button
                      className="delete-btn"
                      onClick={() => setEntryConditions(prev => prev.filter((_, i) => i !== idx))}
                    >
                      ✕
                    </button>
                  </div>
                ))}

                <button
                  className="pb-sugg-apply-btn"
                  onClick={() => setEntryConditions(prev => [...prev, { type: "CrossAbove", args: ["close", availableVariables[1]?.key || "close"] }])}
                >
                  + Add Custom Rule
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── STAGE 5: EXIT SIGNALS ── */}
      {activeStage === 5 && (
        <div className="pb-section-card">
          <div className="pb-section-header">
            <div className="pb-section-title-box">
              <h3>🚪 Stage 5: Exit Rules &amp; Invalidation Exits</h3>
              <p className="pb-section-desc">Define technical exit rules that invalidate or take profit before stop loss.</p>
            </div>
            <div className="pb-logic-toggle">
              <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Combine Exits:</span>
              <button
                className={`pb-logic-btn ${exitLogicType === "OR" ? "active" : ""}`}
                onClick={() => setExitLogicType("OR")}
              >
                OR (First Matching Exit)
              </button>
              <button
                className={`pb-logic-btn ${exitLogicType === "AND" ? "active" : ""}`}
                onClick={() => setExitLogicType("AND")}
              >
                AND (All Conditions Required)
              </button>
            </div>
          </div>

          <div className="pb-signals-grid">
            {/* MA Death Cross */}
            {movingAverages.length >= 2 && (
              <div
                className={`pb-signal-tile ${exitConditions.some(c => c.type === "CrossBelow" && c.args[0] === movingAverages[0].key && c.args[1] === movingAverages[1].key) ? "selected" : ""}`}
                onClick={() => {
                  const cond = { type: "CrossBelow", args: [movingAverages[0].key, movingAverages[1].key] };
                  setExitConditions(prev => {
                    const exists = prev.some(c => c.type === cond.type && JSON.stringify(c.args) === JSON.stringify(cond.args));
                    return exists ? prev.filter(c => !(c.type === cond.type && JSON.stringify(c.args) === JSON.stringify(cond.args))) : [...prev, cond];
                  });
                }}
              >
                <div className="pb-signal-top">
                  <div className="pb-signal-radio">
                    {exitConditions.some(c => c.type === "CrossBelow" && c.args[0] === movingAverages[0].key && c.args[1] === movingAverages[1].key) && <div className="pb-signal-radio-dot" />}
                  </div>
                  <span className="pb-signal-name">⚡ {movingAverages[0].key} Crosses Below {movingAverages[1].key}</span>
                </div>
                <span className="pb-signal-desc">Exit when fast moving average drops below slow moving average.</span>
              </div>
            )}

            {/* Price Below MA */}
            {movingAverages.map(ma => (
              <div
                key={ma.key}
                className={`pb-signal-tile ${exitConditions.some(c => c.type === "CrossBelow" && c.args[0] === "close" && c.args[1] === ma.key) ? "selected" : ""}`}
                onClick={() => {
                  const cond = { type: "CrossBelow", args: ["close", ma.key] };
                  setExitConditions(prev => {
                    const exists = prev.some(c => c.type === cond.type && JSON.stringify(c.args) === JSON.stringify(cond.args));
                    return exists ? prev.filter(c => !(c.type === cond.type && JSON.stringify(c.args) === JSON.stringify(cond.args))) : [...prev, cond];
                  });
                }}
              >
                <div className="pb-signal-top">
                  <div className="pb-signal-radio">
                    {exitConditions.some(c => c.type === "CrossBelow" && c.args[0] === "close" && c.args[1] === ma.key) && <div className="pb-signal-radio-dot" />}
                  </div>
                  <span className="pb-signal-name">📉 Price Drops Below {ma.key}</span>
                </div>
                <span className="pb-signal-desc">Exit trade if candle closes below {ma.key}.</span>
              </div>
            ))}

            {/* RSI Overbought */}
            {rsiInds.map(rsi => (
              <div
                key={rsi.key}
                className={`pb-signal-tile ${exitConditions.some(c => c.args.includes(rsi.key)) ? "selected" : ""}`}
                onClick={() => {
                  setExitConditions(prev => [
                    ...prev.filter(c => !c.args.includes(rsi.key)),
                    { type: "GreaterThan", args: [rsi.key, 70] }
                  ]);
                }}
              >
                <div className="pb-signal-top">
                  <div className="pb-signal-radio">
                    {exitConditions.some(c => c.args.includes(rsi.key)) && <div className="pb-signal-radio-dot" />}
                  </div>
                  <span className="pb-signal-name">⚡ {rsi.key} Overbought Exit (&gt; 70)</span>
                </div>
                <span className="pb-signal-desc">Take profit when RSI reaches overbought levels.</span>
              </div>
            ))}

            {/* SuperTrend Bearish Flip */}
            {superTrendInds.map(st => (
              <div
                key={st.key}
                className={`pb-signal-tile ${exitConditions.some(c => c.args.includes(st.key)) ? "selected" : ""}`}
                onClick={() => {
                  setExitConditions(prev => [
                    ...prev.filter(c => !c.args.includes(st.key)),
                    { type: "CrossBelow", args: ["close", st.key] }
                  ]);
                }}
              >
                <div className="pb-signal-top">
                  <div className="pb-signal-radio">
                    {exitConditions.some(c => c.args.includes(st.key)) && <div className="pb-signal-radio-dot" />}
                  </div>
                  <span className="pb-signal-name">🎯 SuperTrend Bearish Flip (Price ↓ {st.key})</span>
                </div>
                <span className="pb-signal-desc">Exit when price breaks below SuperTrend.</span>
              </div>
            ))}

            {/* Bollinger Bands Upper */}
            {bbInds.map(bb => (
              <div
                key={bb.key}
                className={`pb-signal-tile ${exitConditions.some(c => c.args.some(a => String(a).startsWith(bb.key))) ? "selected" : ""}`}
                onClick={() => {
                  setExitConditions(prev => [
                    ...prev.filter(c => !c.args.some(a => String(a).startsWith(bb.key))),
                    { type: "GreaterThan", args: ["close", `${bb.key}.upper`] }
                  ]);
                }}
              >
                <div className="pb-signal-top">
                  <div className="pb-signal-radio">
                    {exitConditions.some(c => c.args.some(a => String(a).startsWith(bb.key))) && <div className="pb-signal-radio-dot" />}
                  </div>
                  <span className="pb-signal-name">🌊 Price Reaches Upper Bollinger Band</span>
                </div>
                <span className="pb-signal-desc">Target profit when price expands into upper volatility band.</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── STAGE 6: POSITION SIZING ── */}
      {activeStage === 6 && (
        <div className="pb-section-card">
          <div className="pb-section-header">
            <div className="pb-section-title-box">
              <h3>💰 Stage 6: Position Sizing &amp; Capital Allocation</h3>
              <p className="pb-section-desc">Select how much capital or share volume to deploy per trade.</p>
            </div>
          </div>

          <div className="pb-signals-grid">
            <div
              className={`pb-signal-tile ${positionSizing.mode === "PERCENT_EQUITY" ? "selected" : ""}`}
              onClick={() => setPositionSizing({ ...positionSizing, mode: "PERCENT_EQUITY" })}
            >
              <div className="pb-signal-top">
                <div className="pb-signal-radio">{positionSizing.mode === "PERCENT_EQUITY" && <div className="pb-signal-radio-dot" />}</div>
                <span className="pb-signal-name">% Portfolio Equity Sizing</span>
              </div>
              <span className="pb-signal-desc">Allocate a fixed percentage of total portfolio capital per position.</span>
              {positionSizing.mode === "PERCENT_EQUITY" && (
                <div style={{ marginTop: "8px" }}>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={positionSizing.percent_equity}
                    onChange={e => setPositionSizing({ ...positionSizing, percent_equity: Number(e.target.value) })}
                    style={{ background: "#112238", border: "1px solid #1e3a5f", color: "#fff", padding: "6px 10px", borderRadius: "6px", width: "100px" }}
                  /> % per position
                </div>
              )}
            </div>

            <div
              className={`pb-signal-tile ${positionSizing.mode === "FIXED_QTY" ? "selected" : ""}`}
              onClick={() => setPositionSizing({ ...positionSizing, mode: "FIXED_QTY" })}
            >
              <div className="pb-signal-top">
                <div className="pb-signal-radio">{positionSizing.mode === "FIXED_QTY" && <div className="pb-signal-radio-dot" />}</div>
                <span className="pb-signal-name">Fixed Share Quantity</span>
              </div>
              <span className="pb-signal-desc">Trade an exact fixed lot of shares each time.</span>
              {positionSizing.mode === "FIXED_QTY" && (
                <div style={{ marginTop: "8px" }}>
                  <input
                    type="number"
                    min="1"
                    value={positionSizing.fixed_qty}
                    onChange={e => setPositionSizing({ ...positionSizing, fixed_qty: Number(e.target.value) })}
                    style={{ background: "#112238", border: "1px solid #1e3a5f", color: "#fff", padding: "6px 10px", borderRadius: "6px", width: "100px" }}
                  /> shares
                </div>
              )}
            </div>

            <div
              className={`pb-signal-tile ${positionSizing.mode === "ATR_BASED" ? "selected" : ""}`}
              onClick={() => setPositionSizing({ ...positionSizing, mode: "ATR_BASED" })}
            >
              <div className="pb-signal-top">
                <div className="pb-signal-radio">{positionSizing.mode === "ATR_BASED" && <div className="pb-signal-radio-dot" />}</div>
                <span className="pb-signal-name">ATR Volatility Risk-Adjusted Sizing</span>
              </div>
              <span className="pb-signal-desc">Scale position size inversely to market volatility to keep monetary risk constant.</span>
            </div>
          </div>
        </div>
      )}

      {/* ── STAGE 7: STOP LOSS ── */}
      {activeStage === 7 && (
        <div className="pb-section-card">
          <div className="pb-section-header">
            <div className="pb-section-title-box">
              <h3>🛡️ Stage 7: Protective Stop Loss Model</h3>
              <p className="pb-section-desc">Protect your downside with fixed, trailing, or volatility-calibrated stop loss.</p>
            </div>
          </div>

          <div className="pb-slider-box">
            <div className="pb-slider-header">
              <span className="pb-slider-label">Stop Loss Value</span>
              <span className="pb-slider-val-badge red">-{stopLoss.value}%</span>
            </div>
            <div className="pb-slider-row">
              <span className="pb-slider-edge">0.5%</span>
              <input
                type="range"
                min="0.5"
                max="8.0"
                step="0.1"
                value={stopLoss.value}
                onChange={e => setStopLoss({ ...stopLoss, value: Number(e.target.value) })}
              />
              <span className="pb-slider-edge">8.0%</span>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                className={`pb-logic-btn ${stopLoss.type === "FIXED_PCT" ? "active" : ""}`}
                onClick={() => setStopLoss({ ...stopLoss, type: "FIXED_PCT" })}
              >
                Fixed % Stop Loss
              </button>
              <button
                className={`pb-logic-btn ${stopLoss.type === "TRAILING_PCT" ? "active" : ""}`}
                onClick={() => setStopLoss({ ...stopLoss, type: "TRAILING_PCT" })}
              >
                Trailing % Stop Loss
              </button>
              <button
                className={`pb-logic-btn ${stopLoss.type === "ATR_MULTIPLIER" ? "active" : ""}`}
                onClick={() => setStopLoss({ ...stopLoss, type: "ATR_MULTIPLIER", multiplier: 1.5 })}
              >
                ATR Multiplier (1.5x)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STAGE 8: TAKE PROFIT & BREAKEVEN ── */}
      {activeStage === 8 && (
        <div className="pb-section-card">
          <div className="pb-section-header">
            <div className="pb-section-title-box">
              <h3>🎯 Stage 8: Take Profit Targets &amp; Breakeven Locking</h3>
              <p className="pb-section-desc">Configure profit targets and automatic breakeven stop loss adjustments.</p>
            </div>
          </div>

          <div className="pb-slider-box">
            <div className="pb-slider-header">
              <span className="pb-slider-label">Take Profit Target Model</span>
              <span className="pb-slider-val-badge green">
                {takeProfit.type === "RISK_REWARD" ? `1:${takeProfit.ratio || 2.0} R:R Target` : `+${takeProfit.value}% Target`}
              </span>
            </div>
            <div className="pb-slider-row">
              <span className="pb-slider-edge">1.0</span>
              <input
                type="range"
                min="1.0"
                max="5.0"
                step="0.1"
                value={takeProfit.ratio || 2.0}
                onChange={e => setTakeProfit({ ...takeProfit, type: "RISK_REWARD", ratio: Number(e.target.value) })}
              />
              <span className="pb-slider-edge">5.0</span>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                className={`pb-logic-btn ${takeProfit.type === "RISK_REWARD" ? "active" : ""}`}
                onClick={() => setTakeProfit({ ...takeProfit, type: "RISK_REWARD" })}
              >
                Risk-to-Reward Ratio (1:R)
              </button>
              <button
                className={`pb-logic-btn ${takeProfit.type === "FIXED_PCT" ? "active" : ""}`}
                onClick={() => setTakeProfit({ ...takeProfit, type: "FIXED_PCT" })}
              >
                Fixed Percentage Target
              </button>
            </div>
          </div>

          <div className="pb-slider-box">
            <div className="pb-slider-header">
              <span className="pb-slider-label">Breakeven Lock-in Trigger (+Gain to move SL to entry price)</span>
              <span className="pb-slider-val-badge">+{breakevenTriggerPct}% Gain</span>
            </div>
            <div className="pb-slider-row">
              <span className="pb-slider-edge">0.5%</span>
              <input
                type="range"
                min="0.5"
                max="5.0"
                step="0.1"
                value={breakevenTriggerPct}
                onChange={e => setBreakevenTriggerPct(Number(e.target.value))}
              />
              <span className="pb-slider-edge">5.0%</span>
            </div>
          </div>
        </div>
      )}

      {/* ── STAGE 9: PORTFOLIO GUARDRAILS ── */}
      {activeStage === 9 && (
        <div className="pb-section-card">
          <div className="pb-section-header">
            <div className="pb-section-title-box">
              <h3>📋 Stage 9: Institutional Portfolio Constraints &amp; Timers</h3>
              <p className="pb-section-desc">Manage execution concurrency, session hours, and square-off rules.</p>
            </div>
          </div>

          <div className="pb-signals-grid">
            <div className="pb-signal-tile selected">
              <span className="pb-signal-name">Maximum Open Concurrent Positions</span>
              <input
                type="number"
                min="1"
                max="20"
                value={portfolioGuardrails.max_open_positions}
                onChange={e => setPortfolioGuardrails({ ...portfolioGuardrails, max_open_positions: Number(e.target.value) })}
                style={{ background: "#112238", border: "1px solid #1e3a5f", color: "#fff", padding: "6px 10px", borderRadius: "6px", width: "100px", marginTop: "6px" }}
              />
            </div>

            <div className="pb-signal-tile selected">
              <span className="pb-signal-name">Re-entry Cooldown Bars</span>
              <input
                type="number"
                min="0"
                max="20"
                value={portfolioGuardrails.reentry_cooldown_bars}
                onChange={e => setPortfolioGuardrails({ ...portfolioGuardrails, reentry_cooldown_bars: Number(e.target.value) })}
                style={{ background: "#112238", border: "1px solid #1e3a5f", color: "#fff", padding: "6px 10px", borderRadius: "6px", width: "100px", marginTop: "6px" }}
              />
            </div>

            <div className="pb-signal-tile selected">
              <span className="pb-signal-name">Trading Session Hours (IST)</span>
              <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
                <input
                  value={portfolioGuardrails.trade_window_start}
                  onChange={e => setPortfolioGuardrails({ ...portfolioGuardrails, trade_window_start: e.target.value })}
                  placeholder="09:30"
                  style={{ background: "#112238", border: "1px solid #1e3a5f", color: "#fff", padding: "6px 10px", borderRadius: "6px", width: "80px" }}
                />
                <span style={{ alignSelf: "center", color: "#94a3b8" }}>to</span>
                <input
                  value={portfolioGuardrails.trade_window_end}
                  onChange={e => setPortfolioGuardrails({ ...portfolioGuardrails, trade_window_end: e.target.value })}
                  placeholder="15:00"
                  style={{ background: "#112238", border: "1px solid #1e3a5f", color: "#fff", padding: "6px 10px", borderRadius: "6px", width: "80px" }}
                />
              </div>
            </div>

            <div className="pb-signal-tile selected">
              <span className="pb-signal-name">Intraday Square-off</span>
              <select
                value={portfolioGuardrails.intraday_square_off || ""}
                onChange={e => setPortfolioGuardrails({ ...portfolioGuardrails, intraday_square_off: e.target.value })}
                style={{ background: "#112238", border: "1px solid #1e3a5f", color: "#fff", padding: "6px 10px", borderRadius: "6px", marginTop: "6px" }}
              >
                <option value="">Disabled (Hold Overnight / Positional)</option>
                <option value="15:15">15:15 IST (Auto MIS Square-off)</option>
                <option value="15:20">15:20 IST (Auto MIS Square-off)</option>
                <option value="15:25">15:25 IST (Auto MIS Square-off)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── STAGE NAVIGATION CONTROLS (Next / Prev) ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
        <button
          className="pb-logic-btn"
          disabled={activeStage <= 1}
          onClick={() => setActiveStage(prev => Math.max(1, prev - 1))}
        >
          ⬅ Previous Stage
        </button>

        <span style={{ fontSize: "0.85rem", color: "#94a3b8", fontWeight: "bold" }}>
          Stage {activeStage} of {STAGES.length}: {STAGES[activeStage - 1].label}
        </span>

        <button
          className="pb-logic-btn active"
          disabled={activeStage >= STAGES.length}
          onClick={() => setActiveStage(prev => Math.min(STAGES.length, prev + 1))}
        >
          Next Stage ➔
        </button>
      </div>
    </div>
  );
};
