import React, { useState, useMemo } from "react";
import { AlgoSimulationChart } from "../charts/AlgoSimulationChart";
import "./StrategyBuilder.css";

export type IndicatorConfig = {
  name: string;
  key: string;
  formula?: string;
  params: Record<string, any>;
};

export type ConditionItem = {
  type: string;
  args: any[];
};

export type TrendFilterConfig = {
  enabled: boolean;
  type: string;
  args: any[];
};

export type PositionSizingConfig = {
  mode: "PERCENT_EQUITY" | "FIXED_QTY" | "ATR_BASED";
  percent_equity: number;
  fixed_qty: number;
  risk_per_trade_pct: number;
};

export type StopLossConfig = {
  type: "FIXED_PCT" | "TRAILING_PCT" | "ATR_MULTIPLIER";
  value: number;
  multiplier?: number;
  trailing?: boolean;
};

export type TakeProfitConfig = {
  type: "FIXED_PCT" | "RISK_REWARD";
  value: number;
  ratio?: number;
};

export type PortfolioGuardrailsConfig = {
  max_open_positions: number;
  reentry_cooldown_bars: number;
  trade_window_start: string;
  trade_window_end: string;
  intraday_square_off?: string;
};

export interface StrategyBuilderProps {
  symbol: string;
  candleInterval: string;
  period: string;
  indicators: IndicatorConfig[];
  setIndicators: React.Dispatch<React.SetStateAction<IndicatorConfig[]>>;
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
  report: any;
  indicatorSeries: any[];
  isScanning: boolean;
  scanProgress: number;
  visibleTrades: any[];
}

export const StrategyBuilder: React.FC<StrategyBuilderProps> = ({
  symbol,
  candleInterval,
  period,
  indicators,
  setIndicators,
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
  report,
  indicatorSeries,
  isScanning,
  scanProgress,
  visibleTrades,
}) => {
  const [activeTab, setActiveTab] = useState<"trend" | "entry" | "exit" | "sizing" | "risk" | "guardrails" | "chart">("entry");
  const [showAdvancedMode, setShowAdvancedMode] = useState(false);
  const [rsiBuyThreshold, setRsiBuyThreshold] = useState<number>(30);
  const [rsiSellThreshold, setRsiSellThreshold] = useState<number>(70);

  // Group active indicators by category
  const movingAverages = useMemo(() => indicators.filter(ind => ["EMA", "SMA"].includes(ind.name)), [indicators]);
  const rsiInds = useMemo(() => indicators.filter(ind => ind.name === "RSI"), [indicators]);
  const superTrendInds = useMemo(() => indicators.filter(ind => ind.name === "SuperTrend"), [indicators]);
  const macdInds = useMemo(() => indicators.filter(ind => ind.name === "MACD"), [indicators]);
  const bbInds = useMemo(() => indicators.filter(ind => ["BollingerBands", "BB"].includes(ind.name)), [indicators]);
  const vwapInds = useMemo(() => indicators.filter(ind => ind.name === "VWAP"), [indicators]);
  const atrInds = useMemo(() => indicators.filter(ind => ind.name === "ATR"), [indicators]);

  // Indicator Management
  const addIndicatorByType = (type: string) => {
    let newInd: IndicatorConfig;
    switch (type) {
      case "EMA": {
        const count = indicators.filter(i => i.name === "EMA").length;
        const periodVal = count === 0 ? 50 : count === 1 ? 200 : (count + 1) * 20;
        newInd = { name: "EMA", key: `ema_${periodVal}`, params: { period: periodVal } };
        break;
      }
      case "SMA": {
        const count = indicators.filter(i => i.name === "SMA").length;
        const periodVal = count === 0 ? 50 : 200;
        newInd = { name: "SMA", key: `sma_${periodVal}`, params: { period: periodVal } };
        break;
      }
      case "RSI":
        newInd = { name: "RSI", key: "rsi_14", params: { period: 14 } };
        break;
      case "SuperTrend":
        newInd = { name: "SuperTrend", key: "supertrend_10_3", params: { period: 10, multiplier: 3 } };
        break;
      case "MACD":
        newInd = { name: "MACD", key: "macd", params: { fast_period: 12, slow_period: 26, signal_period: 9 } };
        break;
      case "BollingerBands":
        newInd = { name: "BollingerBands", key: "bb_20_2", params: { period: 20, std_dev: 2 } };
        break;
      case "VWAP":
        newInd = { name: "VWAP", key: "vwap", params: {} };
        break;
      case "ATR":
        newInd = { name: "ATR", key: "atr_14", params: { period: 14 } };
        break;
      case "Formula":
        newInd = { name: "Formula", key: "formula_custom", formula: "highest(high, 20)", params: {} };
        break;
      default:
        newInd = { name: "EMA", key: "ema_50", params: { period: 50 } };
    }

    if (indicators.some(i => i.key === newInd.key)) {
      newInd.key = `${newInd.key}_${Date.now().toString().slice(-3)}`;
    }
    setIndicators(prev => [...prev, newInd]);
  };

  const removeIndicator = (index: number) => {
    const removed = indicators[index];
    if (!removed) return;
    setIndicators(prev => prev.filter((_, i) => i !== index));
    setEntryConditions(prev => prev.filter(c => !c.args.some(a => String(a).startsWith(removed.key))));
    setExitConditions(prev => prev.filter(c => !c.args.some(a => String(a).startsWith(removed.key))));
    if (trendFilter.args.some(a => String(a).startsWith(removed.key))) {
      setTrendFilter({ enabled: false, type: "GreaterThan", args: ["close", "close"] });
    }
  };

  const updateIndicator = (index: number, updates: Partial<IndicatorConfig>) => {
    setIndicators(prev => {
      const oldInd = prev[index];
      if (!oldInd) return prev;
      const newInd = { ...oldInd, ...updates };
      if (updates.params && updates.params.period !== undefined && updates.params.period !== oldInd.params?.period) {
        newInd.params = { ...oldInd.params, ...updates.params };
        newInd.key = `${newInd.name.toLowerCase()}_${updates.params.period}`;
      }
      if (newInd.key && oldInd.key && newInd.key !== oldInd.key) {
        const oldKey = oldInd.key;
        const newKey = newInd.key;
        setEntryConditions(cur => cur.map(c => ({ ...c, args: c.args.map(a => a === oldKey ? newKey : a) })));
        setExitConditions(cur => cur.map(c => ({ ...c, args: c.args.map(a => a === oldKey ? newKey : a) })));
        setTrendFilter(cur => ({ ...cur, args: cur.args.map(a => a === oldKey ? newKey : a) }));
      }
      return prev.map((ind, i) => i === index ? newInd : ind);
    });
  };

  // Helper to toggle a condition in a list
  const toggleCondition = (
    cond: ConditionItem,
    currentList: ConditionItem[],
    setList: React.Dispatch<React.SetStateAction<ConditionItem[]>>
  ) => {
    const exists = currentList.some(c => c.type === cond.type && JSON.stringify(c.args) === JSON.stringify(cond.args));
    if (exists) {
      setList(prev => prev.filter(c => !(c.type === cond.type && JSON.stringify(c.args) === JSON.stringify(cond.args))));
    } else {
      setList(prev => [...prev, cond]);
    }
  };

  const isConditionActive = (cond: ConditionItem, list: ConditionItem[]) => {
    return list.some(c => c.type === cond.type && JSON.stringify(c.args) === JSON.stringify(cond.args));
  };

  // AI Strategy Suggestions based on active indicator combo
  const aiSuggestions = useMemo(() => {
    const suggestions: {
      name: string;
      desc: string;
      chips: string[];
      apply: () => void;
    }[] = [];

    const hasFastMa = movingAverages.some(m => (m.params?.period || 0) <= 50);
    const hasSlowMa = movingAverages.some(m => (m.params?.period || 0) >= 100);
    const fastMaKey = movingAverages.find(m => (m.params?.period || 0) <= 50)?.key || movingAverages[0]?.key || "ema_50";
    const slowMaKey = movingAverages.find(m => (m.params?.period || 0) >= 100)?.key || movingAverages[1]?.key || "ema_200";
    const rsiKey = rsiInds[0]?.key || "rsi_14";
    const stKey = superTrendInds[0]?.key || "supertrend_10_3";
    const macdKey = macdInds[0]?.key || "macd";
    const bbKey = bbInds[0]?.key || "bb_20_2";

    // Suggestion 1: RSI Pullback in Trend (if MA + RSI)
    if (movingAverages.length > 0 && rsiInds.length > 0) {
      suggestions.push({
        name: "⚡ RSI Pullback in Bullish Trend",
        desc: `Buy oversold dips (${rsiKey} < 35) only when price is confirmed above ${slowMaKey}. Exit at ${rsiKey} > 65 with 1:2 R:R.`,
        chips: ["Trend Filter", "Momentum Dip", "1:2 R:R"],
        apply: () => {
          setTrendFilter({ enabled: true, type: "GreaterThan", args: ["close", slowMaKey] });
          setEntryConditions([{ type: "LessThan", args: [rsiKey, 35] }]);
          setExitConditions([{ type: "GreaterThan", args: [rsiKey, 65] }]);
          setStopLoss({ type: "TRAILING_PCT", value: 1.5, multiplier: 1.5 });
          setTakeProfit({ type: "RISK_REWARD", value: 3.0, ratio: 2.0 });
        }
      });
    }

    // Suggestion 2: EMA Golden Cross (if 2+ MAs)
    if (hasFastMa && hasSlowMa) {
      suggestions.push({
        name: "🌟 Golden Cross Momentum Follower",
        desc: `Buy when ${fastMaKey} crosses above ${slowMaKey}. Exit when ${fastMaKey} crosses below ${slowMaKey} with trailing stop.`,
        chips: ["Trend Following", "Crossover", "Trailing SL"],
        apply: () => {
          setTrendFilter({ enabled: true, type: "GreaterThan", args: ["close", slowMaKey] });
          setEntryConditions([{ type: "CrossAbove", args: [fastMaKey, slowMaKey] }]);
          setExitConditions([{ type: "CrossBelow", args: [fastMaKey, slowMaKey] }]);
          setStopLoss({ type: "TRAILING_PCT", value: 2.0, multiplier: 2.0 });
          setTakeProfit({ type: "RISK_REWARD", value: 4.0, ratio: 2.0 });
        }
      });
    }

    // Suggestion 3: SuperTrend Breakout
    if (superTrendInds.length > 0) {
      suggestions.push({
        name: "🎯 SuperTrend Dynamic Breakout",
        desc: `Buy on bullish SuperTrend flip (Price ↑ ${stKey}) and ride until bearish flip (Price ↓ ${stKey}).`,
        chips: ["Trend Breakout", "Zero Lag", "Dynamic Exit"],
        apply: () => {
          setTrendFilter({ enabled: false, type: "GreaterThan", args: ["close", "close"] });
          setEntryConditions([{ type: "CrossAbove", args: ["close", stKey] }]);
          setExitConditions([{ type: "CrossBelow", args: ["close", stKey] }]);
          setStopLoss({ type: "FIXED_PCT", value: 1.5 });
          setTakeProfit({ type: "RISK_REWARD", value: 3.5, ratio: 2.5 });
        }
      });
    }

    // Suggestion 4: MACD Signal Cross
    if (macdInds.length > 0) {
      suggestions.push({
        name: "📊 MACD Momentum Crossover",
        desc: `Enter when MACD line crosses above Signal line. Exit when MACD crosses below Signal line.`,
        chips: ["Momentum", "Signal Cross", "1:2.5 R:R"],
        apply: () => {
          setEntryConditions([{ type: "CrossAbove", args: [`${macdKey}.macd`, `${macdKey}.signal`] }]);
          setExitConditions([{ type: "CrossBelow", args: [`${macdKey}.macd`, `${macdKey}.signal`] }]);
          setStopLoss({ type: "FIXED_PCT", value: 1.2 });
          setTakeProfit({ type: "RISK_REWARD", value: 3.0, ratio: 2.5 });
        }
      });
    }

    // Suggestion 5: Bollinger Bands Mean Reversion
    if (bbInds.length > 0) {
      suggestions.push({
        name: "🌊 Bollinger Bands Mean Reversion",
        desc: `Buy when price touches lower volatility band (${bbKey}.lower). Take profit at upper band (${bbKey}.upper).`,
        chips: ["Mean Reversion", "Volatility Squeeze", "Target Exit"],
        apply: () => {
          setEntryConditions([{ type: "LessThan", args: ["close", `${bbKey}.lower`] }]);
          setExitConditions([{ type: "GreaterThan", args: ["close", `${bbKey}.upper`] }]);
          setStopLoss({ type: "FIXED_PCT", value: 1.5 });
          setTakeProfit({ type: "FIXED_PCT", value: 3.0 });
        }
      });
    }

    // Suggestion 6: RSI Reversion standalone
    if (rsiInds.length > 0 && suggestions.length === 0) {
      suggestions.push({
        name: "⚡ RSI Oversold Bounce",
        desc: `Buy oversold dips when ${rsiKey} < 30. Exit when ${rsiKey} rebounds above 70.`,
        chips: ["Oversold Bounce", "Oscillator", "Mean Reversion"],
        apply: () => {
          setTrendFilter({ enabled: false, type: "GreaterThan", args: ["close", "close"] });
          setEntryConditions([{ type: "LessThan", args: [rsiKey, 30] }]);
          setExitConditions([{ type: "GreaterThan", args: [rsiKey, 70] }]);
          setStopLoss({ type: "FIXED_PCT", value: 1.5 });
          setTakeProfit({ type: "FIXED_PCT", value: 3.5 });
        }
      });
    }

    return suggestions;
  }, [movingAverages, rsiInds, superTrendInds, macdInds, bbInds, setTrendFilter, setEntryConditions, setExitConditions, setStopLoss, setTakeProfit]);

  return (
    <div className="pb-strategy-builder">
      {/* ── 1. ACTIVE INDICATORS STRIP ── */}
      <div className="pb-indicators-strip">
        <div className="pb-strip-title">
          <span>📊 Selected Indicators ({indicators.length}):</span>
        </div>

        <div className="pb-indicator-chips" style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
          {indicators.map((ind, idx) => (
            <div key={ind.key || idx} className="pb-ind-chip" style={{ display: "flex", alignItems: "center", gap: "8px", background: "#0d1a2d", border: "1px solid #1e3a5f", padding: "6px 10px", borderRadius: "8px" }}>
              <span className="chip-name" style={{ color: "#38bdf8", fontWeight: "bold", fontSize: "0.85rem" }}>{ind.name}</span>
              
              {/* Period Input for EMA, SMA, RSI, ATR */}
              {ind.params && ind.params.period !== undefined ? (
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "0.74rem", color: "#94a3b8" }}>Period:</span>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={ind.params.period}
                    onChange={e => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val) && val > 0) {
                        updateIndicator(idx, { params: { ...ind.params, period: val } });
                      }
                    }}
                    style={{
                      width: "56px",
                      background: "#08111d",
                      border: "1px solid #38bdf8",
                      borderRadius: "5px",
                      color: "#38bdf8",
                      fontWeight: "bold",
                      padding: "2px 6px",
                      fontSize: "0.82rem",
                      textAlign: "center"
                    }}
                    title="Enter custom period (e.g. 9, 20, 50, 100, 200)"
                  />
                  {/* Quick Period Presets for EMA & SMA */}
                  {["EMA", "SMA"].includes(ind.name) && (
                    <div style={{ display: "flex", gap: "3px" }}>
                      {[20, 50, 200].map(pVal => (
                        <button
                          key={pVal}
                          type="button"
                          onClick={() => updateIndicator(idx, { params: { ...ind.params, period: pVal } })}
                          style={{
                            background: ind.params.period === pVal ? "rgba(56, 189, 248, 0.2)" : "transparent",
                            border: `1px solid ${ind.params.period === pVal ? "#38bdf8" : "#243c5a"}`,
                            color: ind.params.period === pVal ? "#38bdf8" : "#94a3b8",
                            borderRadius: "4px",
                            fontSize: "0.68rem",
                            padding: "1px 5px",
                            cursor: "pointer"
                          }}
                          title={`Quick set to ${pVal}`}
                        >
                          {pVal}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <span className="chip-param" style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                  {Object.values(ind.params || {}).join(", ") || ind.key}
                </span>
              )}

              <button
                className="chip-remove"
                title={`Remove ${ind.name}`}
                onClick={() => removeIndicator(idx)}
                style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "0.85rem", padding: "0 4px", fontWeight: "bold" }}
              >
                ✕
              </button>
            </div>
          ))}

          {indicators.length === 0 && (
            <span style={{ fontSize: "0.82rem", color: "#94a3b8" }}>
              No indicators selected yet. Choose an indicator to generate valid strategy signals:
            </span>
          )}
        </div>

        <div className="pb-ind-add-wrapper">
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

      {/* ── 2. VISUAL STRATEGY PIPELINE FLOW ── */}
      <div className="pb-flow-pipeline">
        <div className="pb-pipeline-header">
          <span className="pb-pipeline-title">⚡ Visual Strategy Execution Pipeline</span>
          <span className="pb-pipeline-badge">Live Synced</span>
        </div>

        <div className="pb-nodes-row">
          <div className={`pb-node-card ${activeTab === "chart" ? "active" : ""}`} onClick={() => setActiveTab("chart")}>
            <span className="pb-node-step">1. Market</span>
            <span className="pb-node-val">{symbol} • {candleInterval}</span>
          </div>

          <span className="pb-node-arrow">➔</span>

          <div className={`pb-node-card ${activeTab === "trend" ? "active" : ""}`} onClick={() => setActiveTab("trend")}>
            <span className="pb-node-step">2. Trend Filter</span>
            <span className="pb-node-val">
              {trendFilter.enabled ? `${trendFilter.args[0] || "close"} > ${trendFilter.args[1] || "ema_200"}` : "Unfiltered"}
            </span>
          </div>

          <span className="pb-node-arrow">➔</span>

          <div className={`pb-node-card ${activeTab === "entry" ? "active" : ""}`} onClick={() => setActiveTab("entry")}>
            <span className="pb-node-step">3. Entry Trigger</span>
            <span className="pb-node-val">
              {entryConditions.length === 0
                ? "No triggers"
                : entryConditions.map(c => `${c.args[0]} ${c.type === "CrossAbove" ? "↑" : c.type === "LessThan" ? "<" : ">"} ${c.args[1]}`).join(" & ")}
            </span>
          </div>

          <span className="pb-node-arrow">➔</span>

          <div className={`pb-node-card ${activeTab === "sizing" ? "active" : ""}`} onClick={() => setActiveTab("sizing")}>
            <span className="pb-node-step">4. Sizing</span>
            <span className="pb-node-val">
              {positionSizing.mode === "PERCENT_EQUITY" ? `${positionSizing.percent_equity}% Equity` : `${positionSizing.fixed_qty} Shares`}
            </span>
          </div>

          <span className="pb-node-arrow">➔</span>

          <div className={`pb-node-card ${activeTab === "risk" ? "active" : ""}`} onClick={() => setActiveTab("risk")}>
            <span className="pb-node-step">5. Risk Targets</span>
            <span className="pb-node-val">
              SL -{stopLoss.value}% • TP {takeProfit.type === "RISK_REWARD" ? `1:${takeProfit.ratio} R:R` : `+${takeProfit.value}%`}
            </span>
          </div>

          <span className="pb-node-arrow">➔</span>

          <div className={`pb-node-card ${activeTab === "exit" ? "active" : ""}`} onClick={() => setActiveTab("exit")}>
            <span className="pb-node-step">6. Exit Trigger</span>
            <span className="pb-node-val">
              {exitConditions.length === 0
                ? "Target / SL only"
                : exitConditions.map(c => `${c.args[0]} ${c.type === "CrossBelow" ? "↓" : c.type === "GreaterThan" ? ">" : "<"} ${c.args[1]}`).join(" | ")}
            </span>
          </div>
        </div>
      </div>

      {/* ── 3. AI STRATEGY SUGGESTIONS ── */}
      {aiSuggestions.length > 0 && (
        <div className="pb-ai-suggestions">
          <div className="pb-ai-header">
            <span className="pb-ai-title">✨ Recommended Strategies for Selected Indicators</span>
            <span className="pb-ai-subtitle">• 1-Click Institutional Presets</span>
          </div>

          <div className="pb-suggestions-grid">
            {aiSuggestions.map((sugg, i) => (
              <div key={i} className="pb-suggestion-card">
                <span className="pb-sugg-name">{sugg.name}</span>
                <span className="pb-sugg-desc">{sugg.desc}</span>
                <div className="pb-sugg-chips">
                  {sugg.chips.map((c, ci) => <span key={ci} className="pb-sugg-chip">{c}</span>)}
                </div>
                <button className="pb-sugg-apply-btn" onClick={sugg.apply}>
                  ✓ Apply Strategy
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 4. PERMANENT LIVE SIMULATION CHART CANVAS ── */}
      <div className="pb-section-card" id="algo-simulation-chart-canvas" style={{ padding: "16px", scrollMarginTop: "20px" }}>
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

      {/* ── 5. MAIN SPLIT STUDIO LAYOUT ── */}
      <div className="pb-builder-main">
        {/* Left Sidebar Navigation */}
        <div className="pb-sidebar-nav">
          <button className={`pb-nav-item ${activeTab === "trend" ? "active" : ""}`} onClick={() => setActiveTab("trend")}>
            <span>1. 🎯 Trend Filter</span>
            <span className="pb-nav-badge">{trendFilter.enabled ? "Active" : "Off"}</span>
          </button>
          <button className={`pb-nav-item ${activeTab === "entry" ? "active" : ""}`} onClick={() => setActiveTab("entry")}>
            <span>2. ⚡ Entry Trigger</span>
            <span className="pb-nav-badge">{entryConditions.length}</span>
          </button>
          <button className={`pb-nav-item ${activeTab === "exit" ? "active" : ""}`} onClick={() => setActiveTab("exit")}>
            <span>3. 🚪 Exit Trigger</span>
            <span className="pb-nav-badge">{exitConditions.length}</span>
          </button>
          <button className={`pb-nav-item ${activeTab === "sizing" ? "active" : ""}`} onClick={() => setActiveTab("sizing")}>
            <span>4. 💰 Position Sizing</span>
          </button>
          <button className={`pb-nav-item ${activeTab === "risk" ? "active" : ""}`} onClick={() => setActiveTab("risk")}>
            <span>5. 🛡️ Risk & Stops</span>
          </button>
          <button className={`pb-nav-item ${activeTab === "guardrails" ? "active" : ""}`} onClick={() => setActiveTab("guardrails")}>
            <span>6. 📋 Portfolio Rules</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="pb-content-area">
          {/* ── SECTION 1: TREND FILTER ── */}
          {activeTab === "trend" && (
            <div className="pb-section-card">
              <div className="pb-section-header">
                <div className="pb-section-title-box">
                  <h3>🎯 Trend Regime Filter</h3>
                  <p className="pb-section-desc">Determine overall market direction before taking trades.</p>
                </div>
                <button
                  className={`pb-logic-btn ${trendFilter.enabled ? "active" : ""}`}
                  onClick={() => setTrendFilter(prev => ({ ...prev, enabled: !prev.enabled }))}
                >
                  {trendFilter.enabled ? "✓ Enabled" : "○ Disabled (Trade All Regimes)"}
                </button>
              </div>

              <div className="pb-signals-grid">
                <div
                  className={`pb-signal-tile ${!trendFilter.enabled ? "selected" : ""}`}
                  onClick={() => setTrendFilter({ enabled: false, type: "GreaterThan", args: ["close", "close"] })}
                >
                  <div className="pb-signal-top">
                    <div className="pb-signal-radio">{!trendFilter.enabled && <div className="pb-signal-radio-dot" />}</div>
                    <span className="pb-signal-name">No Trend Filter (All Regimes)</span>
                  </div>
                  <span className="pb-signal-desc">Take buy signals regardless of overall market trend.</span>
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
                    <span className="pb-signal-desc">Only buy when price is trading in a confirmed bullish regime above {ma.key}.</span>
                  </div>
                ))}

                {movingAverages.length >= 2 && (
                  <div
                    className={`pb-signal-tile ${trendFilter.enabled && trendFilter.args[0] === movingAverages[0].key && trendFilter.args[1] === movingAverages[1].key ? "selected" : ""}`}
                    onClick={() => setTrendFilter({ enabled: true, type: "GreaterThan", args: [movingAverages[0].key, movingAverages[1].key] })}
                  >
                    <div className="pb-signal-top">
                      <div className="pb-signal-radio">{trendFilter.enabled && trendFilter.args[0] === movingAverages[0].key && <div className="pb-signal-radio-dot" />}</div>
                      <span className="pb-signal-name">{movingAverages[0].key} &gt; {movingAverages[1].key} (Bullish Stack)</span>
                    </div>
                    <span className="pb-signal-desc">Only take long positions when fast moving average is above slow moving average.</span>
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
                    <span className="pb-signal-desc">Only trade when SuperTrend ribbon is green and supporting price.</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── SECTION 2: ENTRY TRIGGER ── */}
          {activeTab === "entry" && (
            <div className="pb-section-card">
              <div className="pb-section-header">
                <div className="pb-section-title-box">
                  <h3>⚡ Entry Trigger Signals</h3>
                  <p className="pb-section-desc">Select signals generated automatically from your selected indicators.</p>
                </div>
                <div className="pb-logic-toggle">
                  <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Trigger Logic:</span>
                  <button
                    className={`pb-logic-btn ${entryLogicType === "AND" ? "active" : ""}`}
                    onClick={() => setEntryLogicType("AND")}
                  >
                    ALL Conditions (AND)
                  </button>
                  <button
                    className={`pb-logic-btn ${entryLogicType === "OR" ? "active" : ""}`}
                    onClick={() => setEntryLogicType("OR")}
                  >
                    ANY Condition (OR)
                  </button>
                </div>
              </div>

              {indicators.length === 0 ? (
                <div className="pb-empty-box">
                  <p>⚡ <strong>No Indicators Selected</strong></p>
                  <p style={{ marginTop: "6px", color: "#64748b" }}>
                    Select indicators from the top bar (e.g. RSI, EMA, or SuperTrend) to generate valid entry signals.
                  </p>
                </div>
              ) : (
                <div className="pb-signals-grid">
                  {/* EMA/SMA Crossovers */}
                  {movingAverages.length >= 2 && (
                    <div
                      className={`pb-signal-tile ${isConditionActive({ type: "CrossAbove", args: [movingAverages[0].key, movingAverages[1].key] }, entryConditions) ? "selected" : ""}`}
                      onClick={() => toggleCondition({ type: "CrossAbove", args: [movingAverages[0].key, movingAverages[1].key] }, entryConditions, setEntryConditions)}
                    >
                      <div className="pb-signal-top">
                        <div className="pb-signal-radio">
                          {isConditionActive({ type: "CrossAbove", args: [movingAverages[0].key, movingAverages[1].key] }, entryConditions) && <div className="pb-signal-radio-dot" />}
                        </div>
                        <span className="pb-signal-name">⚡ {movingAverages[0].key} Crosses Above {movingAverages[1].key}</span>
                      </div>
                      <span className="pb-signal-desc">Bullish golden crossover trigger when fast MA crosses slow MA upward.</span>
                    </div>
                  )}

                  {/* Single MA Cross */}
                  {movingAverages.map(ma => (
                    <div
                      key={ma.key}
                      className={`pb-signal-tile ${isConditionActive({ type: "CrossAbove", args: ["close", ma.key] }, entryConditions) ? "selected" : ""}`}
                      onClick={() => toggleCondition({ type: "CrossAbove", args: ["close", ma.key] }, entryConditions, setEntryConditions)}
                    >
                      <div className="pb-signal-top">
                        <div className="pb-signal-radio">
                          {isConditionActive({ type: "CrossAbove", args: ["close", ma.key] }, entryConditions) && <div className="pb-signal-radio-dot" />}
                        </div>
                        <span className="pb-signal-name">📈 Price Crosses Above {ma.key}</span>
                      </div>
                      <span className="pb-signal-desc">Buy when candle closes above the {ma.key} moving average line.</span>
                    </div>
                  ))}

                  {/* RSI Threshold Slider Tile */}
                  {rsiInds.map(rsi => (
                    <div key={rsi.key} style={{ gridColumn: "1 / -1" }} className="pb-slider-box">
                      <div className="pb-slider-header">
                        <span className="pb-slider-label">⚡ {rsi.key} Oversold Dip Buy Level</span>
                        <span className="pb-slider-val-badge green">&lt; {rsiBuyThreshold} (Dip Threshold)</span>
                      </div>
                      <div className="pb-slider-row">
                        <span className="pb-slider-edge">10</span>
                        <input
                          type="range"
                          min="15"
                          max="60"
                          step="1"
                          value={rsiBuyThreshold}
                          onChange={e => {
                            const val = Number(e.target.value);
                            setRsiBuyThreshold(val);
                            setEntryConditions(prev => [
                              ...prev.filter(c => !c.args.includes(rsi.key)),
                              { type: "LessThan", args: [rsi.key, val] }
                            ]);
                          }}
                        />
                        <span className="pb-slider-edge">60</span>
                      </div>
                      <button
                        className="pb-sugg-apply-btn"
                        onClick={() => {
                          setEntryConditions(prev => [
                            ...prev.filter(c => !c.args.includes(rsi.key)),
                            { type: "LessThan", args: [rsi.key, rsiBuyThreshold] }
                          ]);
                        }}
                      >
                        ✓ Set {rsi.key} &lt; {rsiBuyThreshold} Trigger
                      </button>
                    </div>
                  ))}

                  {/* SuperTrend Bullish Flip */}
                  {superTrendInds.map(st => (
                    <div
                      key={st.key}
                      className={`pb-signal-tile ${isConditionActive({ type: "CrossAbove", args: ["close", st.key] }, entryConditions) ? "selected" : ""}`}
                      onClick={() => toggleCondition({ type: "CrossAbove", args: ["close", st.key] }, entryConditions, setEntryConditions)}
                    >
                      <div className="pb-signal-top">
                        <div className="pb-signal-radio">
                          {isConditionActive({ type: "CrossAbove", args: ["close", st.key] }, entryConditions) && <div className="pb-signal-radio-dot" />}
                        </div>
                        <span className="pb-signal-name">🎯 SuperTrend Bullish Breakout ({st.key})</span>
                      </div>
                      <span className="pb-signal-desc">Buy when candle crosses above SuperTrend to flip indicator green.</span>
                    </div>
                  ))}

                  {/* MACD Bullish Cross */}
                  {macdInds.map(macd => (
                    <div
                      key={macd.key}
                      className={`pb-signal-tile ${isConditionActive({ type: "CrossAbove", args: [`${macd.key}.macd`, `${macd.key}.signal`] }, entryConditions) ? "selected" : ""}`}
                      onClick={() => toggleCondition({ type: "CrossAbove", args: [`${macd.key}.macd`, `${macd.key}.signal`] }, entryConditions, setEntryConditions)}
                    >
                      <div className="pb-signal-top">
                        <div className="pb-signal-radio">
                          {isConditionActive({ type: "CrossAbove", args: [`${macd.key}.macd`, `${macd.key}.signal`] }, entryConditions) && <div className="pb-signal-radio-dot" />}
                        </div>
                        <span className="pb-signal-name">📊 MACD Line Crosses Above Signal Line</span>
                      </div>
                      <span className="pb-signal-desc">Bullish momentum confirmation when MACD accelerates above its signal line.</span>
                    </div>
                  ))}

                  {/* Bollinger Bands Lower Touch */}
                  {bbInds.map(bb => (
                    <div
                      key={bb.key}
                      className={`pb-signal-tile ${isConditionActive({ type: "LessThan", args: ["close", `${bb.key}.lower`] }, entryConditions) ? "selected" : ""}`}
                      onClick={() => toggleCondition({ type: "LessThan", args: ["close", `${bb.key}.lower`] }, entryConditions, setEntryConditions)}
                    >
                      <div className="pb-signal-top">
                        <div className="pb-signal-radio">
                          {isConditionActive({ type: "LessThan", args: ["close", `${bb.key}.lower`] }, entryConditions) && <div className="pb-signal-radio-dot" />}
                        </div>
                        <span className="pb-signal-name">🌊 Price Touches Lower Bollinger Band</span>
                      </div>
                      <span className="pb-signal-desc">Mean reversion trigger when price stretches to the oversold lower volatility boundary.</span>
                    </div>
                  ))}

                  {/* VWAP Cross Above */}
                  {vwapInds.map(vwap => (
                    <div
                      key={vwap.key}
                      className={`pb-signal-tile ${isConditionActive({ type: "CrossAbove", args: ["close", vwap.key] }, entryConditions) ? "selected" : ""}`}
                      onClick={() => toggleCondition({ type: "CrossAbove", args: ["close", vwap.key] }, entryConditions, setEntryConditions)}
                    >
                      <div className="pb-signal-top">
                        <div className="pb-signal-radio">
                          {isConditionActive({ type: "CrossAbove", args: ["close", vwap.key] }, entryConditions) && <div className="pb-signal-radio-dot" />}
                        </div>
                        <span className="pb-signal-name">⚓ Price Crosses Above VWAP</span>
                      </div>
                      <span className="pb-signal-desc">Institutional volume-weighted breakout trigger.</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Advanced Mode Toggle for Power Users */}
              <div className="pb-advanced-box">
                <div className="pb-adv-header">
                  <span className="pb-adv-title">🛠️ Advanced Mode (Raw Rule Engine)</span>
                  <button
                    className="pb-logic-btn"
                    onClick={() => setShowAdvancedMode(!showAdvancedMode)}
                  >
                    {showAdvancedMode ? "Hide Advanced Rules" : "Expose Left/Comparator/Right Rules"}
                  </button>
                </div>
                {showAdvancedMode && (
                  <div>
                    {entryConditions.map((c, ci) => (
                      <div key={ci} style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
                        <select
                          value={c.args[0]}
                          onChange={e => {
                            const newArgs = [...c.args];
                            newArgs[0] = e.target.value;
                            setEntryConditions(prev => prev.map((item, i) => i === ci ? { ...item, args: newArgs } : item));
                          }}
                        >
                          {availableVariables.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
                        </select>
                        <select
                          value={c.type}
                          onChange={e => {
                            setEntryConditions(prev => prev.map((item, i) => i === ci ? { ...item, type: e.target.value } : item));
                          }}
                        >
                          <option value="CrossAbove">Crosses Above</option>
                          <option value="CrossBelow">Crosses Below</option>
                          <option value="GreaterThan">&gt; Greater Than</option>
                          <option value="LessThan">&lt; Less Than</option>
                        </select>
                        <select
                          value={c.args[1]}
                          onChange={e => {
                            const newArgs = [...c.args];
                            newArgs[1] = isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value);
                            setEntryConditions(prev => prev.map((item, i) => i === ci ? { ...item, args: newArgs } : item));
                          }}
                        >
                          {availableVariables.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
                        </select>
                        <button
                          style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: "4px", padding: "4px 8px", cursor: "pointer" }}
                          onClick={() => setEntryConditions(prev => prev.filter((_, i) => i !== ci))}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      className="pb-sugg-apply-btn"
                      onClick={() => setEntryConditions(prev => [...prev, { type: "CrossAbove", args: ["close", availableVariables[1]?.key || "close"] }])}
                    >
                      + Add Custom Condition
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── SECTION 3: EXIT TRIGGER ── */}
          {activeTab === "exit" && (
            <div className="pb-section-card">
              <div className="pb-section-header">
                <div className="pb-section-title-box">
                  <h3>🚪 Exit Trigger Signals</h3>
                  <p className="pb-section-desc">Close positions when technical exit conditions or profit targets are met.</p>
                </div>
                <div className="pb-logic-toggle">
                  <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Exit Logic:</span>
                  <button
                    className={`pb-logic-btn ${exitLogicType === "OR" ? "active" : ""}`}
                    onClick={() => setExitLogicType("OR")}
                  >
                    ANY Condition (OR)
                  </button>
                  <button
                    className={`pb-logic-btn ${exitLogicType === "AND" ? "active" : ""}`}
                    onClick={() => setExitLogicType("AND")}
                  >
                    ALL Conditions (AND)
                  </button>
                </div>
              </div>

              <div className="pb-signals-grid">
                {/* EMA Death Cross Exit */}
                {movingAverages.length >= 2 && (
                  <div
                    className={`pb-signal-tile ${isConditionActive({ type: "CrossBelow", args: [movingAverages[0].key, movingAverages[1].key] }, exitConditions) ? "selected" : ""}`}
                    onClick={() => toggleCondition({ type: "CrossBelow", args: [movingAverages[0].key, movingAverages[1].key] }, exitConditions, setExitConditions)}
                  >
                    <div className="pb-signal-top">
                      <div className="pb-signal-radio">
                        {isConditionActive({ type: "CrossBelow", args: [movingAverages[0].key, movingAverages[1].key] }, exitConditions) && <div className="pb-signal-radio-dot" />}
                      </div>
                      <span className="pb-signal-name">⚡ {movingAverages[0].key} Crosses Below {movingAverages[1].key}</span>
                    </div>
                    <span className="pb-signal-desc">Exit when fast moving average crosses back under slow moving average.</span>
                  </div>
                )}

                {/* Price below MA */}
                {movingAverages.map(ma => (
                  <div
                    key={ma.key}
                    className={`pb-signal-tile ${isConditionActive({ type: "CrossBelow", args: ["close", ma.key] }, exitConditions) ? "selected" : ""}`}
                    onClick={() => toggleCondition({ type: "CrossBelow", args: ["close", ma.key] }, exitConditions, setExitConditions)}
                  >
                    <div className="pb-signal-top">
                      <div className="pb-signal-radio">
                        {isConditionActive({ type: "CrossBelow", args: ["close", ma.key] }, exitConditions) && <div className="pb-signal-radio-dot" />}
                      </div>
                      <span className="pb-signal-name">📉 Price Drops Below {ma.key}</span>
                    </div>
                    <span className="pb-signal-desc">Exit trade if candle closes below the {ma.key} support benchmark.</span>
                  </div>
                ))}

                {/* RSI Overbought Slider */}
                {rsiInds.map(rsi => (
                  <div key={rsi.key} style={{ gridColumn: "1 / -1" }} className="pb-slider-box">
                    <div className="pb-slider-header">
                      <span className="pb-slider-label">⚡ {rsi.key} Overbought Profit Target Level</span>
                      <span className="pb-slider-val-badge red">&gt; {rsiSellThreshold} (Overbought Exit)</span>
                    </div>
                    <div className="pb-slider-row">
                      <span className="pb-slider-edge">50</span>
                      <input
                        type="range"
                        min="50"
                        max="90"
                        step="1"
                        value={rsiSellThreshold}
                        onChange={e => {
                          const val = Number(e.target.value);
                          setRsiSellThreshold(val);
                          setExitConditions(prev => [
                            ...prev.filter(c => !c.args.includes(rsi.key)),
                            { type: "GreaterThan", args: [rsi.key, val] }
                          ]);
                        }}
                      />
                      <span className="pb-slider-edge">90</span>
                    </div>
                  </div>
                ))}

                {/* SuperTrend Bearish Flip */}
                {superTrendInds.map(st => (
                  <div
                    key={st.key}
                    className={`pb-signal-tile ${isConditionActive({ type: "CrossBelow", args: ["close", st.key] }, exitConditions) ? "selected" : ""}`}
                    onClick={() => toggleCondition({ type: "CrossBelow", args: ["close", st.key] }, exitConditions, setExitConditions)}
                  >
                    <div className="pb-signal-top">
                      <div className="pb-signal-radio">
                        {isConditionActive({ type: "CrossBelow", args: ["close", st.key] }, exitConditions) && <div className="pb-signal-radio-dot" />}
                      </div>
                      <span className="pb-signal-name">🎯 SuperTrend Bearish Flip ({st.key})</span>
                    </div>
                    <span className="pb-signal-desc">Exit trade when price crosses below SuperTrend to flip indicator red.</span>
                  </div>
                ))}

                {/* Bollinger Upper Band Exit */}
                {bbInds.map(bb => (
                  <div
                    key={bb.key}
                    className={`pb-signal-tile ${isConditionActive({ type: "GreaterThan", args: ["close", `${bb.key}.upper`] }, exitConditions) ? "selected" : ""}`}
                    onClick={() => toggleCondition({ type: "GreaterThan", args: ["close", `${bb.key}.upper`] }, exitConditions, setExitConditions)}
                  >
                    <div className="pb-signal-top">
                      <div className="pb-signal-radio">
                        {isConditionActive({ type: "GreaterThan", args: ["close", `${bb.key}.upper`] }, exitConditions) && <div className="pb-signal-radio-dot" />}
                      </div>
                      <span className="pb-signal-name">🌊 Price Reaches Upper Bollinger Band</span>
                    </div>
                    <span className="pb-signal-desc">Take profit when price reaches the upper volatility target.</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── SECTION 4: POSITION SIZING ── */}
          {activeTab === "sizing" && (
            <div className="pb-section-card">
              <div className="pb-section-header">
                <div className="pb-section-title-box">
                  <h3>💰 Position Sizing Model</h3>
                  <p className="pb-section-desc">Select how capital is allocated per trade execution.</p>
                </div>
              </div>

              <div className="pb-signals-grid">
                <div
                  className={`pb-signal-tile ${positionSizing.mode === "PERCENT_EQUITY" ? "selected" : ""}`}
                  onClick={() => setPositionSizing({ ...positionSizing, mode: "PERCENT_EQUITY" })}
                >
                  <div className="pb-signal-top">
                    <div className="pb-signal-radio">{positionSizing.mode === "PERCENT_EQUITY" && <div className="pb-signal-radio-dot" />}</div>
                    <span className="pb-signal-name">% of Total Portfolio Equity</span>
                  </div>
                  <span className="pb-signal-desc">Allocate a fixed percentage of available capital per trade.</span>
                  {positionSizing.mode === "PERCENT_EQUITY" && (
                    <div style={{ marginTop: "8px" }}>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={positionSizing.percent_equity}
                        onChange={e => setPositionSizing({ ...positionSizing, percent_equity: Number(e.target.value) })}
                        style={{ background: "#112238", border: "1px solid #1e3a5f", color: "#fff", padding: "6px 10px", borderRadius: "6px", width: "100px" }}
                      /> % per trade
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
                  <span className="pb-signal-desc">Buy a constant number of shares regardless of price.</span>
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
                    <span className="pb-signal-name">Volatility Risk-Adjusted (ATR Sizing)</span>
                  </div>
                  <span className="pb-signal-desc">Scale position size based on current market volatility and risk % per trade.</span>
                </div>
              </div>
            </div>
          )}

          {/* ── SECTION 5: RISK & STOPS ── */}
          {activeTab === "risk" && (
            <div className="pb-section-card">
              <div className="pb-section-header">
                <div className="pb-section-title-box">
                  <h3>🛡️ Risk Management & Protective Stops</h3>
                  <p className="pb-section-desc">Configure Stop Loss, Take Profit targets, and Breakeven guards.</p>
                </div>
              </div>

              <div className="pb-slider-box">
                <div className="pb-slider-header">
                  <span className="pb-slider-label">Stop Loss Type &amp; Value</span>
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
                    Fixed %
                  </button>
                  <button
                    className={`pb-logic-btn ${stopLoss.type === "TRAILING_PCT" ? "active" : ""}`}
                    onClick={() => setStopLoss({ ...stopLoss, type: "TRAILING_PCT" })}
                  >
                    Trailing %
                  </button>
                  {atrInds.length > 0 && (
                    <button
                      className={`pb-logic-btn ${stopLoss.type === "ATR_MULTIPLIER" ? "active" : ""}`}
                      onClick={() => setStopLoss({ ...stopLoss, type: "ATR_MULTIPLIER", multiplier: 1.5 })}
                    >
                      ATR Multiplier (1.5x)
                    </button>
                  )}
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
                  <span className="pb-slider-label">Breakeven Trigger (+Gain to Lock SL at Entry)</span>
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

          {/* ── SECTION 6: PORTFOLIO RULES ── */}
          {activeTab === "guardrails" && (
            <div className="pb-section-card">
              <div className="pb-section-header">
                <div className="pb-section-title-box">
                  <h3>📋 Portfolio Constraints &amp; Guardrails</h3>
                  <p className="pb-section-desc">Institutional execution guardrails and session timers.</p>
                </div>
              </div>

              <div className="pb-signals-grid">
                <div className="pb-signal-tile selected">
                  <span className="pb-signal-name">Maximum Concurrent Positions</span>
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
                  <span className="pb-signal-name">Trading Session Window (IST)</span>
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
        </div>
      </div>
    </div>
  );
};
