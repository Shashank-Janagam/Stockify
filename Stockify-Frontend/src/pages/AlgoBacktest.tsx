import { useState, useEffect, useMemo, useRef } from "react";
import { StrategyBuilder } from "../components/strategy/StrategyBuilder";
import { FormStudio9Stage } from "../components/strategy/FormStudio9Stage";
import { StrategyProjectsModal } from "../components/strategy/StrategyProjectsModal";
import type { StrategyProject } from "../components/strategy/StrategyProjectsModal";
import { AlgoSimulationChart } from "../components/charts/AlgoSimulationChart";
import "../Styles/AlgoBacktest.css";

export type BacktestReport = {
  strategy_name: string;
  symbol: string;
  period_from: string;
  period_to: string;
  n_candles: number;
  initial_capital: number;
  final_equity: number;
  total_return_pct: number;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate_pct: number;
  gross_profit: number;
  gross_loss: number;
  profit_factor: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  signals: any[];
  price_data: { x: string; y: number }[];
};

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

const BASKET_PRESETS: Record<string, string[]> = {
  "Single Stock": ["KOTAKBANK"],
  "Nifty 50 Top 5": ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK"],
  "Banking Basket": ["HDFCBANK", "ICICIBANK", "SBIN", "KOTAKBANK", "AXISBANK"],
  "IT & Tech": ["TCS", "INFY", "WIPRO", "HCLTECH", "TECHM"],
  "Auto Momentum": ["TATAMOTORS", "M&M", "MARUTI", "BAJAJ-AUTO"],
};

const INSTITUTIONAL_TEMPLATES: Record<string, any> = {
  "🌟 Golden Cross Trend-Follower": {
    strategy_name: "Golden_Cross_Momentum",
    description: "Macro trend filtered by EMA200 with EMA50 cross trigger, trailing stop loss, and 3-bar re-entry cooldown",
    universe: { type: "single", symbol: "RELIANCE" },
    timeframe: { interval: "15m", period: "1y" },
    indicators: [
      { name: "EMA", key: "ema_50", params: { period: 50 } },
      { name: "EMA", key: "ema_200", params: { period: 200 } },
      { name: "ATR", key: "atr_14", params: { period: 14 } }
    ],
    trend_filter: {
      enabled: true,
      type: "GreaterThan",
      args: ["close", "ema_200"]
    },
    entry_rules: {
      type: "CrossAbove",
      args: ["ema_50", "ema_200"]
    },
    exit_rules: {
      type: "CrossBelow",
      args: ["ema_50", "ema_200"]
    },
    position_sizing: {
      mode: "PERCENT_EQUITY",
      percent_equity: 15.0,
      fixed_qty: 25,
      risk_per_trade_pct: 1.0
    },
    stop_loss: {
      type: "TRAILING_PCT",
      value: 1.8
    },
    take_profit: {
      type: "RISK_REWARD",
      ratio: 2.5,
      value: 4.5
    },
    portfolio_guardrails: {
      max_open_positions: 5,
      reentry_cooldown_bars: 3,
      trade_window_start: "09:30",
      trade_window_end: "15:00",
      intraday_square_off: ""
    }
  },
  "⚡ Trend-Filtered RSI Pullback": {
    strategy_name: "Trend_Filtered_RSI_Pullback",
    description: "Buys oversold RSI pullbacks exclusively within an established bullish regime with 1:2 Risk-to-Reward",
    universe: { type: "single", symbol: "KOTAKBANK" },
    timeframe: { interval: "15m", period: "1y" },
    indicators: [
      { name: "EMA", key: "ema_100", params: { period: 100 } },
      { name: "RSI", key: "rsi_14", params: { period: 14 } },
      { name: "ATR", key: "atr_14", params: { period: 14 } }
    ],
    trend_filter: {
      enabled: true,
      type: "GreaterThan",
      args: ["close", "ema_100"]
    },
    entry_rules: {
      type: "AND",
      conditions: [
        { type: "LessThan", args: ["rsi_14", 35] },
        { type: "GreaterThan", args: ["close", "ema_100"] }
      ]
    },
    exit_rules: {
      type: "GreaterThan",
      args: ["rsi_14", 65]
    },
    position_sizing: {
      mode: "ATR_BASED",
      percent_equity: 10.0,
      fixed_qty: 25,
      risk_per_trade_pct: 1.0
    },
    stop_loss: {
      type: "FIXED_PCT",
      value: 1.5
    },
    take_profit: {
      type: "RISK_REWARD",
      ratio: 2.0,
      value: 3.0
    },
    portfolio_guardrails: {
      max_open_positions: 3,
      reentry_cooldown_bars: 2,
      trade_window_start: "09:30",
      trade_window_end: "15:00",
      intraday_square_off: ""
    }
  },
  "🎯 SuperTrend Intraday Momentum": {
    strategy_name: "SuperTrend_Intraday_Momentum",
    description: "Strict intraday session momentum trading (09:30-15:00) with SuperTrend breakouts and ATR protection",
    universe: { type: "single", symbol: "TCS" },
    timeframe: { interval: "5m", period: "1mo" },
    indicators: [
      { name: "SuperTrend", key: "supertrend_10_3", params: { period: 10, multiplier: 3 } },
      { name: "ATR", key: "atr_14", params: { period: 14 } }
    ],
    trend_filter: {
      enabled: false,
      type: "GreaterThan",
      args: ["close", "supertrend_10_3"]
    },
    entry_rules: {
      type: "CrossAbove",
      args: ["close", "supertrend_10_3"]
    },
    exit_rules: {
      type: "CrossBelow",
      args: ["close", "supertrend_10_3"]
    },
    position_sizing: {
      mode: "PERCENT_EQUITY",
      percent_equity: 12.0,
      fixed_qty: 20,
      risk_per_trade_pct: 1.0
    },
    stop_loss: {
      type: "ATR_MULTIPLIER",
      multiplier: 1.5,
      value: 1.5
    },
    take_profit: {
      type: "FIXED_PCT",
      value: 3.0
    },
    portfolio_guardrails: {
      max_open_positions: 4,
      reentry_cooldown_bars: 3,
      trade_window_start: "09:30",
      trade_window_end: "15:00",
      intraday_square_off: ""
    }
  },
  "🚀 20-Day Donchian Breakout + ATR Stop": {
    strategy_name: "20Day_Donchian_Breakout",
    description: "Daily breakout strategy taking positions when price breaks above 20-day high with volatility-adjusted SL",
    universe: { type: "single", symbol: "HDFCBANK" },
    timeframe: { interval: "1d", period: "2y" },
    indicators: [
      { name: "Formula", key: "highest_20", formula: "highest(high, 20)", params: {} },
      { name: "ATR", key: "atr_14", params: { period: 14 } }
    ],
    trend_filter: {
      enabled: false,
      type: "GreaterThan",
      args: ["close", "highest_20"]
    },
    entry_rules: {
      type: "CrossAbove",
      args: ["close", "highest_20"]
    },
    exit_rules: {
      type: "LessThan",
      args: ["close", "highest_20"]
    },
    position_sizing: {
      mode: "FIXED_QTY",
      fixed_qty: 35,
      percent_equity: 10.0,
      risk_per_trade_pct: 1.0
    },
    stop_loss: {
      type: "ATR_MULTIPLIER",
      multiplier: 2.0,
      value: 2.0
    },
    take_profit: {
      type: "FIXED_PCT",
      value: 6.0
    },
    portfolio_guardrails: {
      max_open_positions: 5,
      reentry_cooldown_bars: 1,
      trade_window_start: "09:15",
      trade_window_end: "15:30",
      intraday_square_off: ""
    }
  }
};

const BASE_PRICE_VARIABLES = [
  { key: "close", label: "Close Price" },
  { key: "open", label: "Open Price" },
  { key: "high", label: "High Price" },
  { key: "low", label: "Low Price" },
  { key: "volume", label: "Volume" },
  { key: "typical_price", label: "Typical Price (HLC3)" },
];

export default function AlgoBacktest() {
  const [activeTab, setActiveTab] = useState<"preset" | "custom">("custom");
  const [customViewMode, setCustomViewMode] = useState<"chart_builder" | "form_studio" | "json">("chart_builder");

  const [symbol, setSymbol] = useState("KOTAKBANK");
  const [selectedBasket, setSelectedBasket] = useState("Single Stock");
  const [period, setPeriod] = useState("1y");
  const [candleInterval, setCandleInterval] = useState("15m");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [initialCapital, setInitialCapital] = useState(100000);
  const [strategy, setStrategy] = useState("EMA");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<BacktestReport | null>(null);
  const [reports, setReports] = useState<BacktestReport[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Strategy Studio State
  const [customStrategyName, setCustomStrategyName] = useState("My_Visual_Strategy");

  // Stage 2: Indicators
  const [indicators, setIndicators] = useState<IndicatorConfig[]>([
    { name: "EMA", key: "ema_50", params: { period: 50 } },
    { name: "EMA", key: "ema_200", params: { period: 200 } },
    { name: "RSI", key: "rsi_14", params: { period: 14 } },
    { name: "ATR", key: "atr_14", params: { period: 14 } }
  ]);

  // Dynamic Variable Dependency Graph: Available Variables
  const availableVariables = useMemo(() => {
    const list = [...BASE_PRICE_VARIABLES];
    indicators.forEach(ind => {
      if (ind.key && !list.some(v => v.key === ind.key)) {
        list.push({ key: ind.key, label: `${ind.key} (${ind.name})` });
      }
    });
    return list;
  }, [indicators]);

  // Stage 3: Trend Filter
  const [trendFilter, setTrendFilter] = useState<TrendFilterConfig>({
    enabled: true,
    type: "GreaterThan",
    args: ["close", "ema_200"]
  });

  // Stage 4: Entry Rules
  const [entryLogicType, setEntryLogicType] = useState<"SINGLE" | "AND" | "OR">("AND");
  const [entryConditions, setEntryConditions] = useState<ConditionItem[]>([
    { type: "CrossAbove", args: ["ema_50", "ema_200"] }
  ]);

  // Stage 5: Exit Rules
  const [exitLogicType, setExitLogicType] = useState<"SINGLE" | "AND" | "OR">("SINGLE");
  const [exitConditions, setExitConditions] = useState<ConditionItem[]>([
    { type: "CrossBelow", args: ["ema_50", "ema_200"] }
  ]);

  // Stage 6: Position Sizing
  const [positionSizing, setPositionSizing] = useState<PositionSizingConfig>({
    mode: "PERCENT_EQUITY",
    percent_equity: 15.0,
    fixed_qty: 25,
    risk_per_trade_pct: 1.0
  });

  // Stage 7: Risk Management
  const [stopLoss, setStopLoss] = useState<StopLossConfig>({
    type: "TRAILING_PCT",
    value: 1.5,
    multiplier: 1.5
  });

  const [takeProfit, setTakeProfit] = useState<TakeProfitConfig>({
    type: "RISK_REWARD",
    value: 3.5,
    ratio: 2.0
  });

  const [breakevenTriggerPct, setBreakevenTriggerPct] = useState<number>(1.5);

  // Stage 8: Portfolio Guardrails
  const [portfolioGuardrails, setPortfolioGuardrails] = useState<PortfolioGuardrailsConfig>({
    max_open_positions: 5,
    reentry_cooldown_bars: 3,
    trade_window_start: "09:30",
    trade_window_end: "15:00",
    intraday_square_off: ""
  });

  // Strategy Projects Hub State
  const [projects, setProjects] = useState<StrategyProject[]>(() => {
    try {
      const local = localStorage.getItem("paperbull_strategy_projects");
      return local ? JSON.parse(local) : [];
    } catch {
      return [];
    }
  });
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isProjectsModalOpen, setIsProjectsModalOpen] = useState(false);

  // Live Signal Execution State
  const [executeModalOpen, setExecuteModalOpen] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);
  const [executeResult, setExecuteResult] = useState<any>(null);

  const [rawJson, setRawJson] = useState<string>("");
  const [previewOutput, setPreviewOutput] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [indicatorSeries, setIndicatorSeries] = useState<any[]>([]);

  // Scanning animation state
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);

  // Algo Python server is always on the dedicated Python API port (5001)
  const ALGO_HOST = import.meta.env.VITE_PYTHON_API_URL || "http://localhost:5001";

  // Fetch backend projects on mount and merge with local
  useEffect(() => {
    fetch(`${ALGO_HOST}/strategies/projects`)
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.projects) && data.projects.length > 0) {
          setProjects(prev => {
            const map = new Map<string, StrategyProject>();
            prev.forEach(p => map.set(p.id, p));
            data.projects.forEach((p: any) => map.set(p.id, p));
            const merged = Array.from(map.values());
            localStorage.setItem("paperbull_strategy_projects", JSON.stringify(merged));
            return merged;
          });
        }
      })
      .catch(() => {});
  }, [ALGO_HOST]);

  // Build Entry & Exit rule trees
  const buildRuleTree = (logicType: string, conds: ConditionItem[]) => {
    if (logicType === "SINGLE" || conds.length === 1) {
      return conds[0] || { type: "CrossAbove", args: ["close", "ema_50"] };
    }
    return {
      type: logicType,
      conditions: conds
    };
  };

  // Current Studio Configuration snapshot
  const currentStudioSnapshot = useMemo(() => ({
    symbol,
    selectedBasket,
    period,
    candleInterval,
    startDate,
    endDate,
    initialCapital,
    indicators,
    trendFilter,
    entryLogicType,
    entryConditions,
    exitLogicType,
    exitConditions,
    positionSizing,
    stopLoss,
    takeProfit,
    breakevenTriggerPct,
    portfolioGuardrails
  }), [
    symbol, selectedBasket, period, candleInterval, startDate, endDate,
    initialCapital, indicators, trendFilter, entryLogicType, entryConditions,
    exitLogicType, exitConditions, positionSizing, stopLoss, takeProfit,
    breakevenTriggerPct, portfolioGuardrails
  ]);

  // Strategy Project Handlers
  const handleSaveProject = async (
    projData: Omit<StrategyProject, "id" | "createdAt" | "updatedAt">,
    targetId?: string
  ) => {
    const nowIso = new Date().toISOString();
    const projId = targetId || `proj_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    const newProject: StrategyProject = {
      ...projData,
      id: projId,
      createdAt: targetId ? (projects.find(p => p.id === targetId)?.createdAt || nowIso) : nowIso,
      updatedAt: nowIso,
      lastReport: report ? {
        totalReturnPct: report.total_return_pct,
        winRatePct: report.win_rate_pct,
        totalTrades: report.total_trades,
        finalEquity: report.final_equity,
        backtestedAt: nowIso
      } : undefined
    };

    setProjects(prev => {
      const idx = prev.findIndex(p => p.id === projId);
      let updatedList: StrategyProject[];
      if (idx >= 0) {
        updatedList = [...prev];
        updatedList[idx] = newProject;
      } else {
        updatedList = [newProject, ...prev];
      }
      localStorage.setItem("paperbull_strategy_projects", JSON.stringify(updatedList));
      return updatedList;
    });

    setActiveProjectId(projId);
    setCustomStrategyName(newProject.name);

    // Sync with Python API
    try {
      await fetch(`${ALGO_HOST}/strategies/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: projId,
          name: newProject.name,
          description: newProject.description,
          created_at: newProject.createdAt,
          updated_at: newProject.updatedAt,
          symbol: newProject.symbol,
          timeframe: {
            period: newProject.period,
            interval: newProject.candleInterval
          },
          initial_capital: newProject.initialCapital,
          strategy_config: {
            strategy_name: newProject.name,
            indicators: newProject.indicators,
            trend_filter: newProject.trendFilter,
            entry_rules: buildRuleTree(newProject.entryLogicType, newProject.entryConditions),
            exit_rules: buildRuleTree(newProject.exitLogicType, newProject.exitConditions),
            position_sizing: newProject.positionSizing,
            risk_management: {
              stop_loss: newProject.stopLoss,
              take_profit: newProject.takeProfit,
              breakeven_trigger_pct: newProject.breakevenTriggerPct
            },
            portfolio_guardrails: newProject.portfolioGuardrails
          },
          last_report: newProject.lastReport
        })
      });
    } catch (e) {
      console.warn("Backend project sync error:", e);
    }
  };

  const handleLoadProject = (proj: any) => {
    if (!proj) return;
    setActiveTab("custom");
    setActiveProjectId(proj.id);

    // Extract nested or flat config
    const stratConfig = proj.strategy_config || {};
    const tf = proj.timeframe || {};

    const name = proj.name || stratConfig.strategy_name || "Custom Strategy";
    const sym = proj.symbol || stratConfig.universe?.symbols?.[0] || stratConfig.universe?.symbol || "TCS";
    const basket = proj.selectedBasket || (stratConfig.universe?.type === "basket" ? "Basket" : "Single Stock");
    const per = proj.period || tf.period || "1y";
    const interval = proj.candleInterval || tf.interval || "1h";
    const capital = proj.initialCapital || proj.initial_capital || 100000;

    // Indicators
    const rawInds = (proj.indicators && proj.indicators.length > 0) ? proj.indicators : (stratConfig.indicators || []);
    const inds: IndicatorConfig[] = rawInds.map((ind: any) => ({
      name: ind.name || "EMA",
      key: ind.key || `${(ind.name || 'ema').toLowerCase()}_${ind.params?.period || 50}`,
      formula: ind.formula,
      params: ind.params || {}
    }));

    // Trend Filter
    const tfConfig: TrendFilterConfig = proj.trendFilter || (stratConfig.trend_filter ? {
      enabled: stratConfig.trend_filter.enabled ?? true,
      type: stratConfig.trend_filter.type || "GreaterThan",
      args: stratConfig.trend_filter.args || ["close", "ema_200"]
    } : { enabled: false, type: "GreaterThan", args: ["close", "close"] });

    // Entry Rules
    let entryLogic: "SINGLE" | "AND" | "OR" = proj.entryLogicType || (stratConfig.entry_rules?.type as any) || "SINGLE";
    let entryConds: ConditionItem[] = proj.entryConditions || [];
    if (!entryConds.length && stratConfig.entry_rules) {
      if (Array.isArray(stratConfig.entry_rules.conditions)) {
        entryConds = stratConfig.entry_rules.conditions;
      } else if (stratConfig.entry_rules.type) {
        entryConds = [stratConfig.entry_rules];
      }
    }
    if (!entryConds.length) {
      entryConds = [{ type: "CrossAbove", args: ["ema_50", "ema_200"] }];
    }

    // Exit Rules
    let exitLogic: "SINGLE" | "AND" | "OR" = proj.exitLogicType || (stratConfig.exit_rules?.type as any) || "SINGLE";
    let exitConds: ConditionItem[] = proj.exitConditions || [];
    if (!exitConds.length && stratConfig.exit_rules) {
      if (Array.isArray(stratConfig.exit_rules.conditions)) {
        exitConds = stratConfig.exit_rules.conditions;
      } else if (stratConfig.exit_rules.type) {
        exitConds = [stratConfig.exit_rules];
      }
    }
    if (!exitConds.length) {
      exitConds = [{ type: "CrossBelow", args: ["ema_50", "ema_200"] }];
    }

    // Auto-recover indicator definitions if list was empty
    if (inds.length === 0) {
      const detectedKeys = new Set<string>();
      [...entryConds, ...exitConds].forEach(c => {
        (c.args || []).forEach(a => {
          if (typeof a === 'string' && !['close', 'open', 'high', 'low', 'volume', 'typical_price'].includes(a)) {
            detectedKeys.add(a);
          }
        });
      });
      if (tfConfig.enabled && tfConfig.args) {
        tfConfig.args.forEach(a => {
          if (typeof a === 'string' && !['close', 'open', 'high', 'low', 'volume'].includes(a)) {
            detectedKeys.add(a);
          }
        });
      }

      detectedKeys.forEach(k => {
        if (k.startsWith('ema_')) {
          const p = parseInt(k.replace('ema_', ''), 10) || 50;
          inds.push({ name: 'EMA', key: k, params: { period: p } });
        } else if (k.startsWith('sma_')) {
          const p = parseInt(k.replace('sma_', ''), 10) || 50;
          inds.push({ name: 'SMA', key: k, params: { period: p } });
        } else if (k.startsWith('rsi_')) {
          const p = parseInt(k.replace('rsi_', ''), 10) || 14;
          inds.push({ name: 'RSI', key: k, params: { period: p } });
        } else if (k.startsWith('supertrend')) {
          inds.push({ name: 'SuperTrend', key: k, params: { period: 10, multiplier: 3 } });
        } else if (k.startsWith('macd')) {
          inds.push({ name: 'MACD', key: k, params: { fast_period: 12, slow_period: 26, signal_period: 9 } });
        } else if (k.startsWith('bb')) {
          inds.push({ name: 'BollingerBands', key: k, params: { period: 20, std_dev: 2 } });
        } else if (k.startsWith('vwap')) {
          inds.push({ name: 'VWAP', key: k, params: {} });
        }
      });

      if (inds.length === 0) {
        inds.push({ name: 'EMA', key: 'ema_50', params: { period: 50 } });
        inds.push({ name: 'EMA', key: 'ema_200', params: { period: 200 } });
      }
    }

    // Position Sizing
    const sizing: PositionSizingConfig = proj.positionSizing || stratConfig.position_sizing || {
      mode: "PERCENT_EQUITY",
      percent_equity: 100,
      fixed_qty: 10,
      risk_per_trade_pct: 2.0
    };

    // Stop Loss & Take Profit & Guardrails
    const risk = stratConfig.risk_management || {};
    const sl: StopLossConfig = proj.stopLoss || risk.stop_loss || { type: "TRAILING_PCT", value: 1.5 };
    const tp: TakeProfitConfig = proj.takeProfit || risk.take_profit || { type: "RISK_REWARD", ratio: 2.0, value: 3.0 };
    const beTrigger = proj.breakevenTriggerPct ?? risk.breakeven_trigger_pct ?? 0;
    const guardrails: PortfolioGuardrailsConfig = proj.portfolioGuardrails || stratConfig.portfolio_guardrails || {
      max_open_positions: 5,
      reentry_cooldown_bars: 3,
      trade_window_start: "09:30",
      trade_window_end: "15:00"
    };

    setCustomStrategyName(name);
    setSymbol(sym);
    setSelectedBasket(basket);
    setPeriod(per);
    setCandleInterval(interval);
    if (proj.startDate || tf.start_date) setStartDate(proj.startDate || tf.start_date);
    if (proj.endDate || tf.end_date) setEndDate(proj.endDate || tf.end_date);
    setInitialCapital(capital);
    setIndicators(inds);
    setTrendFilter(tfConfig);
    setEntryLogicType(entryLogic);
    setEntryConditions(entryConds);
    setExitLogicType(exitLogic);
    setExitConditions(exitConds);
    setPositionSizing(sizing);
    setStopLoss(sl);
    setTakeProfit(tp);
    setBreakevenTriggerPct(beTrigger);
    setPortfolioGuardrails(guardrails);

    // Print comprehensive strategy rules & project details into browser console
    console.group(`%c🚀 [PaperBull] Strategy Project Loaded: "${name}"`, "color: #38bdf8; font-size: 14px; font-weight: bold;");
    console.log("%c🎯 Symbol & Timeframe:", "color: #10b981; font-weight: bold;", {
      symbol: sym,
      period: per,
      candleInterval: interval,
      initialCapital: capital
    });
    console.log("%c📊 Active Indicators (" + inds.length + "):", "color: #38bdf8; font-weight: bold;", inds);
    console.log("%c🌊 Trend Filter:", "color: #a855f7; font-weight: bold;", tfConfig);
    console.log("%c🟢 Entry Rules:", "color: #22c55e; font-weight: bold;", {
      logicType: entryLogic,
      conditions: entryConds,
      ruleTree: buildRuleTree(entryLogic, entryConds)
    });
    console.log("%c🔴 Exit Rules:", "color: #ef4444; font-weight: bold;", {
      logicType: exitLogic,
      conditions: exitConds,
      ruleTree: buildRuleTree(exitLogic, exitConds)
    });
    console.log("%c🛡️ Risk & Sizing:", "color: #f59e0b; font-weight: bold;", {
      positionSizing: sizing,
      stopLoss: sl,
      takeProfit: tp,
      breakevenTriggerPct: beTrigger,
      portfolioGuardrails: guardrails
    });
    console.log("%c📄 Full Strategy Project Object:", "color: #94a3b8; font-weight: bold;", proj);
    console.groupEnd();
  };

  const handleDeleteProject = async (projectId: string) => {
    setProjects(prev => {
      const updated = prev.filter(p => p.id !== projectId);
      localStorage.setItem("paperbull_strategy_projects", JSON.stringify(updated));
      return updated;
    });
    if (activeProjectId === projectId) {
      setActiveProjectId(null);
    }
    try {
      await fetch(`${ALGO_HOST}/strategies/projects/${projectId}`, { method: "DELETE" });
    } catch (e) {
      console.warn("Backend delete project error:", e);
    }
  };

  const handleBacktestProject = (proj: StrategyProject) => {
    handleLoadProject(proj);
    setTimeout(() => {
      runBacktest();
    }, 100);
  };

  const handleExecuteProject = async (proj?: StrategyProject) => {
    const targetProj = proj || {
      id: activeProjectId || "temp",
      name: customStrategyName,
      createdAt: "",
      updatedAt: "",
      ...currentStudioSnapshot
    };

    setExecuteLoading(true);
    setExecuteModalOpen(true);
    setExecuteResult(null);

    const strategyConfigObj = {
      strategy_name: targetProj.name,
      universe: {
        type: targetProj.selectedBasket === "Single Stock" ? "single" : "basket",
        symbols: [targetProj.symbol]
      },
      timeframe: {
        interval: targetProj.candleInterval,
        period: targetProj.period
      },
      indicators: targetProj.indicators.map(ind => ({
        name: ind.name,
        key: ind.key,
        ...(ind.name === "Formula" ? { formula: ind.formula } : {}),
        params: ind.params
      })),
      trend_filter: targetProj.trendFilter.enabled ? { type: targetProj.trendFilter.type, args: targetProj.trendFilter.args } : undefined,
      entry_rules: buildRuleTree(targetProj.entryLogicType, targetProj.entryConditions),
      exit_rules: buildRuleTree(targetProj.exitLogicType, targetProj.exitConditions),
      position_sizing: targetProj.positionSizing,
      risk_management: {
        stop_loss: targetProj.stopLoss,
        take_profit: targetProj.takeProfit,
        breakeven_trigger_pct: targetProj.breakevenTriggerPct
      },
      portfolio_guardrails: targetProj.portfolioGuardrails
    };

    try {
      const res = await fetch(`${ALGO_HOST}/strategies/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: targetProj.symbol,
          strategy_config: strategyConfigObj,
          period: targetProj.period === "custom" || targetProj.period === "single_day" ? "5d" : targetProj.period,
          interval: targetProj.candleInterval,
          initial_capital: targetProj.initialCapital
        })
      });
      const data = await res.json();
      setExecuteResult(data);
    } catch (e: any) {
      setExecuteResult({ success: false, error: e.message });
    } finally {
      setExecuteLoading(false);
    }
  };

  // Sync Visual Builder state to JSON
  useEffect(() => {
    const entryRuleTree = buildRuleTree(entryLogicType, entryConditions);
    const exitRuleTree = buildRuleTree(exitLogicType, exitConditions);

    const strategyObj = {
      strategy_name: customStrategyName,
      universe: {
        type: selectedBasket === "Single Stock" ? "single" : "basket",
        symbols: selectedBasket === "Single Stock" ? [symbol] : BASKET_PRESETS[selectedBasket] || [symbol]
      },
      timeframe: {
        interval: candleInterval,
        period: period === "custom" ? "custom" : period,
        start_date: period === "custom" ? startDate : undefined,
        end_date: period === "custom" ? endDate : undefined
      },
      indicators: indicators.map(ind => ({
        name: ind.name,
        key: ind.key,
        ...(ind.name === "Formula" ? { formula: ind.formula } : {}),
        params: ind.params
      })),
      trend_filter: trendFilter.enabled ? { type: trendFilter.type, args: trendFilter.args } : undefined,
      entry_rules: entryRuleTree,
      exit_rules: exitRuleTree,
      position_sizing: positionSizing,
      risk_management: {
        stop_loss: stopLoss,
        take_profit: takeProfit,
        breakeven_trigger_pct: breakevenTriggerPct > 0 ? breakevenTriggerPct : undefined
      },
      portfolio_guardrails: portfolioGuardrails
    };

    setRawJson(JSON.stringify(strategyObj, null, 2));
  }, [
    customStrategyName, symbol, selectedBasket, period, candleInterval, startDate, endDate,
    indicators, trendFilter, entryLogicType, entryConditions, exitLogicType, exitConditions,
    positionSizing, stopLoss, takeProfit, breakevenTriggerPct, portfolioGuardrails
  ]);

  // Load Template
  const loadTemplate = (templateName: string) => {
    const tmpl = INSTITUTIONAL_TEMPLATES[templateName];
    if (!tmpl) return;

    setCustomStrategyName(tmpl.strategy_name || "LoadedTemplate");
    if (tmpl.indicators) setIndicators(tmpl.indicators);
    if (tmpl.timeframe?.interval) setCandleInterval(tmpl.timeframe.interval);
    if (tmpl.timeframe?.period) setPeriod(tmpl.timeframe.period);

    // Load Trend Filter
    if (tmpl.trend_filter) {
      setTrendFilter({
        enabled: tmpl.trend_filter.enabled ?? true,
        type: tmpl.trend_filter.type || "GreaterThan",
        args: tmpl.trend_filter.args || ["close", "ema_200"]
      });
    }

    // Load Entry Rules
    if (tmpl.entry_rules?.conditions) {
      setEntryLogicType(tmpl.entry_rules.type || "AND");
      setEntryConditions(tmpl.entry_rules.conditions);
    } else if (tmpl.entry_rules) {
      setEntryLogicType("SINGLE");
      setEntryConditions([tmpl.entry_rules]);
    }

    // Load Exit Rules
    if (tmpl.exit_rules?.conditions) {
      setExitLogicType(tmpl.exit_rules.type || "SINGLE");
      setExitConditions(tmpl.exit_rules.conditions);
    } else if (tmpl.exit_rules) {
      setExitLogicType("SINGLE");
      setExitConditions([tmpl.exit_rules]);
    }

    // Load Sizing, SL, TP, Portfolio Guardrails
    if (tmpl.position_sizing) setPositionSizing(tmpl.position_sizing);
    if (tmpl.stop_loss) setStopLoss(typeof tmpl.stop_loss === "number" ? { type: "FIXED_PCT", value: tmpl.stop_loss } : tmpl.stop_loss);
    if (tmpl.take_profit) setTakeProfit(typeof tmpl.take_profit === "number" ? { type: "FIXED_PCT", value: tmpl.take_profit } : tmpl.take_profit);
    if (tmpl.portfolio_guardrails) setPortfolioGuardrails(tmpl.portfolio_guardrails);

    console.group(`%c🌟 [PaperBull] Strategy Template Loaded: "${templateName}"`, "color: #38bdf8; font-size: 14px; font-weight: bold;");
    console.log("%c📊 Active Indicators:", "color: #38bdf8; font-weight: bold;", tmpl.indicators);
    console.log("%c🌊 Trend Filter:", "color: #a855f7; font-weight: bold;", tmpl.trend_filter);
    console.log("%c🟢 Entry Rules:", "color: #22c55e; font-weight: bold;", tmpl.entry_rules);
    console.log("%c🔴 Exit Rules:", "color: #ef4444; font-weight: bold;", tmpl.exit_rules);
    console.groupEnd();
  };

  const openPresetInStudio = (presetId: string) => {
    setActiveTab("custom");
    if (presetId === "EMA") {
      loadTemplate("🌟 Golden Cross Trend-Follower");
    } else if (presetId === "RSI") {
      loadTemplate("⚡ RSI Mean-Reversion Scalper");
    } else if (presetId === "MACD") {
      loadTemplate("🎯 MACD + SuperTrend Momentum");
    } else if (presetId === "SuperTrend") {
      loadTemplate("🚀 Multi-Timeframe SuperTrend Breakout");
    } else if (presetId === "VWAP") {
      loadTemplate("📊 Institutional VWAP Squeeze");
    } else if (presetId === "BollingerBands") {
      loadTemplate("📐 Bollinger Bands Squeeze & Breakout");
    } else {
      loadTemplate("🌟 Golden Cross Trend-Follower");
    }
  };

  const runPresetStrategy = (presetId: string) => {
    setStrategy(presetId);
    setTimeout(() => {
      runBacktest();
    }, 50);
  };

  const handleBasketChange = (basket: string) => {
    setSelectedBasket(basket);
    if (basket !== "Single Stock" && BASKET_PRESETS[basket]?.length) {
      setSymbol(BASKET_PRESETS[basket][0]);
    }
  };

  const addIndicatorByType = (type: string) => {
    let newInd: IndicatorConfig;
    switch (type) {
      case "EMA": {
        const existing = indicators.filter(i => i.name === "EMA").length;
        const periodVal = existing === 0 ? 50 : (existing === 1 ? 200 : (existing + 1) * 20);
        newInd = { name: "EMA", key: `ema_${periodVal}`, params: { period: periodVal } };
        break;
      }
      case "SMA": {
        const existing = indicators.filter(i => i.name === "SMA").length;
        const periodVal = existing === 0 ? 50 : 200;
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
    // Clean up conditions referencing removed indicator
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
        setEntryConditions(cur => cur.map(c => ({
          ...c,
          args: c.args.map(a => a === oldKey ? newKey : a)
        })));
        setExitConditions(cur => cur.map(c => ({
          ...c,
          args: c.args.map(a => a === oldKey ? newKey : a)
        })));
        setTrendFilter(cur => ({
          ...cur,
          args: cur.args.map(a => a === oldKey ? newKey : a)
        }));
      }

      return prev.map((ind, i) => (i === index ? newInd : ind));
    });
  };

  const previewCustomIndicator = async (ind: IndicatorConfig) => {
    setPreviewLoading(true);
    setPreviewOutput(null);
    try {
      const res = await fetch(`${ALGO_HOST}/indicators/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          period: "1mo",
          interval: candleInterval,
          indicator_name: ind.name,
          formula: ind.formula,
          params: ind.params
        })
      });
      const data = await res.json();
      if (data.success) {
        const lastFew = Array.isArray(data.data) ? data.data.slice(-5) : data.data;
        setPreviewOutput(`✓ [${ind.key}] preview on ${symbol} (${candleInterval}): Last 5 values = ${JSON.stringify(lastFew)}`);
      } else {
        setPreviewOutput(`⚠️ Preview error: ${data.error}`);
      }
    } catch (e: any) {
      setPreviewOutput(`⚠️ Failed to connect: ${e.message}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const startScanAnimation = () => {
    setIsScanning(true);
    setScanProgress(0);
    let progress = 0;
    const duration = 1800;
    const intervalMs = 30;
    const step = 100 / (duration / intervalMs);

    const timer = window.setInterval(() => {
      progress += step;
      if (progress >= 100) {
        progress = 100;
        window.clearInterval(timer);
        setIsScanning(false);
      }
      setScanProgress(progress);
    }, intervalMs);
  };

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    if (newPeriod === "1d" || newPeriod === "single_day") {
      setCandleInterval("1m"); // Minimum possible for <= 1d
      if (!startDate) {
        const todayStr = new Date().toISOString().split("T")[0];
        setStartDate(todayStr);
        setEndDate(todayStr);
      }
    } else if (newPeriod === "5d") {
      setCandleInterval("1m"); // Minimum possible for <= 7d (Yahoo supports 1m up to 7d)
    } else if (newPeriod === "1mo") {
      setCandleInterval("2m"); // Minimum possible for <= 30d (Yahoo supports 2m up to 60d)
    } else if (newPeriod === "3mo") {
      setCandleInterval("5m"); // Minimum possible for 3mo
    } else if (["6mo", "1y", "2y", "5y"].includes(newPeriod)) {
      setCandleInterval("1h"); // User rule: 6m, 1y, 2y, 5y use 1hr
    } else if (newPeriod === "max") {
      setCandleInterval("1d");
    }
  };

  const scrollToGraph = () => {
    setTimeout(() => {
      const el = document.getElementById("algo-simulation-chart-canvas") ||
                 document.getElementById("algo-backtest-results-section") ||
                 document.querySelector(".pb-section-card");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 120);
  };

  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    setReport(null);
    setReports([]);
    setPreviewOutput(null);

    // Scroll smoothly to the simulation chart canvas immediately upon click
    scrollToGraph();

    try {
      const isDateCustom = period === "custom" || period === "single_day";
      let payload: any = {
        symbol,
        period: isDateCustom ? null : period,
        interval: candleInterval,
        start_date: isDateCustom ? startDate : null,
        end_date: isDateCustom ? (period === "single_day" ? startDate : endDate) : null,
        initial_capital: initialCapital
      };

      if (activeTab === "custom") {
        let strategyConfigObj: any;
        if (customViewMode === "json") {
          try {
            strategyConfigObj = JSON.parse(rawJson);
          } catch {
            setError("Invalid JSON in the JSON editor. Please fix syntax errors.");
            setLoading(false);
            return;
          }
        } else {
          strategyConfigObj = {
            strategy_name: customStrategyName,
            universe: {
              type: selectedBasket === "Single Stock" ? "single" : "basket",
              symbols: selectedBasket === "Single Stock" ? [symbol] : BASKET_PRESETS[selectedBasket] || [symbol]
            },
            timeframe: {
              interval: candleInterval,
              period: isDateCustom ? "custom" : period,
              start_date: isDateCustom ? startDate : undefined,
              end_date: isDateCustom ? (period === "single_day" ? startDate : endDate) : undefined
            },
            indicators: indicators.map(ind => ({
              name: ind.name,
              key: ind.key,
              ...(ind.name === "Formula" ? { formula: ind.formula } : {}),
              params: ind.params
            })),
            trend_filter: trendFilter.enabled ? { type: trendFilter.type, args: trendFilter.args } : undefined,
            entry_rules: buildRuleTree(entryLogicType, entryConditions),
            exit_rules: buildRuleTree(exitLogicType, exitConditions),
            position_sizing: positionSizing,
            risk_management: {
              stop_loss: stopLoss,
              take_profit: takeProfit,
              breakeven_trigger_pct: breakevenTriggerPct > 0 ? breakevenTriggerPct : undefined
            },
            portfolio_guardrails: portfolioGuardrails
          };
        }
        payload.strategy = "CustomStrategy";
        payload.strategy_config = strategyConfigObj;
      } else {
        if (strategy === "ALL") {
          const res = await fetch(`${ALGO_HOST}/backtest/all`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          if (data.success && data.reports) {
            setReport(null);
            setReports(data.reports);
            scrollToGraph();
          } else {
            setError(data.error || "Failed to run backtests");
          }
          setLoading(false);
          return;
        } else if (strategy.startsWith("proj_")) {
          const pId = strategy.replace("proj_", "");
          const proj = projects.find(p => p.id === pId);
          if (proj) {
            payload.strategy = "CustomStrategy";
            payload.strategy_config = {
              strategy_name: proj.name,
              universe: {
                type: proj.selectedBasket === "Single Stock" ? "single" : "basket",
                symbols: [proj.symbol]
              },
              timeframe: {
                interval: proj.candleInterval,
                period: isDateCustom ? "custom" : proj.period,
                start_date: isDateCustom ? startDate : undefined,
                end_date: isDateCustom ? (period === "single_day" ? startDate : endDate) : undefined
              },
              indicators: proj.indicators.map(ind => ({
                name: ind.name,
                key: ind.key,
                ...(ind.name === "Formula" ? { formula: ind.formula } : {}),
                params: ind.params
              })),
              trend_filter: proj.trendFilter.enabled ? { type: proj.trendFilter.type, args: proj.trendFilter.args } : undefined,
              entry_rules: buildRuleTree(proj.entryLogicType, proj.entryConditions),
              exit_rules: buildRuleTree(proj.exitLogicType, proj.exitConditions),
              position_sizing: proj.positionSizing,
              risk_management: {
                stop_loss: proj.stopLoss,
                take_profit: proj.takeProfit,
                breakeven_trigger_pct: proj.breakevenTriggerPct
              },
              portfolio_guardrails: proj.portfolioGuardrails
            };
          } else {
            payload.strategy = "EMA";
          }
        } else {
          payload.strategy = strategy;
        }
      }

      const res = await fetch(`${ALGO_HOST}/backtest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success && data.report) {
        setReports([]);
        setReport(data.report);
        setIndicatorSeries(data.indicator_series || []);
        startScanAnimation();
        scrollToGraph();
      } else {
        setError(data.error || "Failed to run backtest");
      }
    } catch (err: any) {
      setError(`Cannot connect to AlgoTrading server. Make sure api_server.py is running on port 5001. (${err.message})`);
    } finally {
      setLoading(false);
    }
  };

  // Always-current ref so effects don't capture stale closures
  const runBacktestLatest = useRef<() => Promise<void>>(() => Promise.resolve());
  useEffect(() => { runBacktestLatest.current = runBacktest; });

  // Initial load only: do NOT re-run when user changes parameters (wait for explicit Run button click)
  useEffect(() => {
    runBacktestLatest.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmtInr = (n: number | null | undefined) =>
    n != null && !isNaN(Number(n))
      ? `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "₹0.00";

  const fmtPct = (n: number | null | undefined) =>
    n != null && !isNaN(Number(n))
      ? `${Number(n).toFixed(2)}%`
      : "0.00%";

  let visibleTrades = report?.signals || [];
  if (isScanning && report?.price_data?.length) {
    const dataCount = report.price_data.length;
    const currentDataIndex = Math.min(
      Math.max(0, Math.floor((scanProgress / 100) * (dataCount - 1))),
      dataCount - 1
    );
    const point = report.price_data[currentDataIndex];
    if (point && point.x) {
      const currentTs = new Date(point.x).getTime();
      if (!isNaN(currentTs)) {
        visibleTrades = (report.signals || []).filter(sig => {
          if (!sig || !sig.executed_at) return false;
          const sigTs = new Date(sig.executed_at).getTime();
          return !isNaN(sigTs) && sigTs <= currentTs;
        });
      }
    }
  }

  const simulationChartData = useMemo(() => {
    if (!report?.price_data?.length) return [];
    return report.price_data.map(p => {
      const ts = new Date(p.x).getTime();
      return { x: isNaN(ts) ? 0 : ts, y: p.y };
    });
  }, [report]);

  const simulationTrades = useMemo(() => {
    return visibleTrades.map(t => ({
      side: (t.type === "BUY" ? "BUY" : "SELL") as "BUY" | "SELL",
      pricePerShare: t.price,
      createdAtIST: t.executed_at
    }));
  }, [visibleTrades]);

  return (
    <div className="backtest-container">
      <div className="backtest-header">
        <h1>🔬 PaperBull Strategy & Backtest Lab</h1>
        <p>Institutional Visual Algorithmic Studio: Interactive Indicator Charts, Visual Crossovers, Threshold Sliders, Node Pipelines, and Instant Historical Simulation.</p>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="strategy-mode-tabs">
        <button
          className={`mode-tab ${activeTab === "preset" ? "active" : ""}`}
          onClick={() => setActiveTab("preset")}
        >
          ⚡ Built-in Presets
        </button>
        <button
          className={`mode-tab ${activeTab === "custom" ? "active" : ""}`}
          onClick={() => setActiveTab("custom")}
        >
          🛠️ PaperBull Institutional Studio
        </button>
      </div>

      {/* ── Compact Control Strip ── */}
      <div className="control-strip">
        <div className="strip-group">
          <label>Stock / Symbol</label>
          <input
            className="strip-input"
            value={symbol}
            onChange={e => setSymbol(e.target.value.toUpperCase())}
            placeholder="e.g. TCS or RELIANCE"
          />
        </div>

        <div className="strip-group">
          <label>Basket</label>
          <select className="strip-select" value={selectedBasket} onChange={e => handleBasketChange(e.target.value)}>
            {Object.keys(BASKET_PRESETS).map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <div className="strip-group">
          <label>Period / Timeframe</label>
          <select className="strip-select" value={period} onChange={e => handlePeriodChange(e.target.value)}>
            <option value="1d">1 Day (Intraday)</option>
            <option value="5d">5 Days</option>
            <option value="1mo">1 Mo</option>
            <option value="3mo">3 Mo</option>
            <option value="6mo">6 Mo</option>
            <option value="1y">1 Yr</option>
            <option value="2y">2 Yr</option>
            <option value="5y">5 Yr</option>
            <option value="max">Max History</option>
            <option value="single_day">📅 Specific Single Day</option>
            <option value="custom">🗓️ Custom Date Range</option>
          </select>
        </div>

        <div className="strip-group">
          <label>Interval Time</label>
          <select className="strip-select" value={candleInterval} onChange={e => setCandleInterval(e.target.value)}>
            <option value="1m">1m (Intraday)</option>
            <option value="2m">2m</option>
            <option value="5m">5m</option>
            <option value="15m">15m</option>
            <option value="30m">30m</option>
            <option value="1h">1h (60m)</option>
            <option value="1d">1D (Daily)</option>
            <option value="5d">5D</option>
            <option value="1wk">1W (Weekly)</option>
          </select>
        </div>

        {period === "single_day" && (
          <div className="strip-group">
            <label>Specific Day</label>
            <input
              type="date"
              className="strip-input"
              value={startDate}
              onChange={e => {
                setStartDate(e.target.value);
                setEndDate(e.target.value);
              }}
            />
          </div>
        )}

        {period === "custom" && (
          <>
            <div className="strip-group">
              <label>From</label>
              <input type="date" className="strip-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="strip-group">
              <label>To</label>
              <input type="date" className="strip-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </>
        )}

        <div className="strip-group">
          <label>Capital (₹)</label>
          <input
            type="number"
            className="strip-input capital-input"
            value={initialCapital}
            onChange={e => setInitialCapital(Number(e.target.value))}
          />
        </div>

        {activeTab === "preset" && (
          <div className="strip-group">
            <label>Strategy / Project</label>
            <select className="strip-select" value={strategy} onChange={e => setStrategy(e.target.value)}>
              <optgroup label="⚡ Built-in Presets">
                <option value="ALL">All Strategies (Comparison)</option>
                <option value="EMA">EMA 50/200 Crossover</option>
                <option value="RSI">RSI 14 Reversion</option>
                <option value="MACD">MACD Momentum</option>
                <option value="VWAP">VWAP Breakout</option>
                <option value="SuperTrend">SuperTrend Trend Follower</option>
                <option value="BollingerBands">Bollinger Bands Mean Reversion</option>
              </optgroup>
              {projects.length > 0 && (
                <optgroup label={`📁 My Saved Projects (${projects.length})`}>
                  {projects.map(p => (
                    <option key={p.id} value={`proj_${p.id}`}>
                      {p.name} ({p.symbol})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        )}

        <button className="strip-run-btn" onClick={runBacktest} disabled={loading}>
          {loading ? <><span className="spin-dot" />Simulating…</> : <>▶ Run</>}
        </button>
      </div>

      {/* Built-in Presets & Saved Strategy Projects Visual Strip */}
      {activeTab === "preset" && (
        <div style={{
          background: "#0d1a2d",
          border: "1px solid #1e3a5f",
          borderRadius: "12px",
          padding: "20px",
          marginBottom: "24px",
          display: "flex",
          flexDirection: "column",
          gap: "16px"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "1.15rem", color: "#f8fafc", fontWeight: "700" }}>
                ⚡ Built-in Presets &amp; Strategy Templates
              </h3>
              <p style={{ margin: "3px 0 0 0", fontSize: "0.82rem", color: "#94a3b8" }}>
                Select any institutional algorithm preset or your saved projects to run simulations or customize in the Studio.
              </p>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setIsProjectsModalOpen(true)}
                style={{
                  background: "#08111d",
                  border: "1px solid #38bdf8",
                  color: "#38bdf8",
                  padding: "8px 14px",
                  borderRadius: "8px",
                  fontSize: "0.82rem",
                  fontWeight: "700",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                📁 Projects Hub ({projects.length})
              </button>
            </div>
          </div>

          {/* Preset Cards Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
            {[
              { id: "ALL", name: "🏆 All Strategies Benchmark", desc: "Runs all 6 strategies simultaneously and builds a comparative leaderboard.", tag: "Multi-Strategy", inds: ["EMA", "RSI", "MACD", "SuperTrend", "VWAP", "BB"] },
              { id: "EMA", name: "📈 EMA Golden Crossover", desc: "Trades trend acceleration when 50 EMA crosses above 200 EMA with 200 EMA trend filter.", tag: "Trend Following", inds: ["EMA (50)", "EMA (200)"] },
              { id: "RSI", name: "⚡ RSI 14 Mean-Reversion", desc: "Buys oversold bounce dips when RSI < 30 and takes profit when RSI rebounds above 70.", tag: "Oscillator", inds: ["RSI (14)"] },
              { id: "MACD", name: "🎯 MACD Momentum Crossover", desc: "Captures momentum breakout when MACD line crosses above the 9-period Signal line.", tag: "Momentum", inds: ["MACD (12,26,9)"] },
              { id: "SuperTrend", name: "🚀 SuperTrend Trend Breakout", desc: "Volatility-based trailing trend following with ATR factor 3.0 and 10-period ATR.", tag: "Breakout", inds: ["SuperTrend (10, 3)"] },
              { id: "VWAP", name: "📊 VWAP Intraday Breakout", desc: "Institutional volume-weighted average price momentum and mean-reversion filter.", tag: "Volume / Price", inds: ["VWAP"] },
              { id: "BollingerBands", name: "📐 Bollinger Bands Reversal", desc: "Mean reversion channel buying at lower band and selling at upper band.", tag: "Volatility", inds: ["BB (20, 2)"] },
            ].map(pst => {
              const isSel = strategy === pst.id;
              return (
                <div
                  key={pst.id}
                  style={{
                    background: isSel ? "linear-gradient(145deg, #0f243c 0%, #0b1523 100%)" : "#08111d",
                    border: `1px solid ${isSel ? "#38bdf8" : "#1e3a5f"}`,
                    borderRadius: "10px",
                    padding: "14px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "10px",
                    boxShadow: isSel ? "0 0 12px rgba(56, 189, 248, 0.2)" : "none",
                    transition: "all 0.15s ease"
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ fontWeight: "700", fontSize: "0.9rem", color: isSel ? "#38bdf8" : "#f8fafc" }}>
                        {pst.name}
                      </span>
                      <span style={{ fontSize: "0.68rem", background: "rgba(56, 189, 248, 0.12)", color: "#38bdf8", padding: "2px 6px", borderRadius: "4px", fontWeight: "600" }}>
                        {pst.tag}
                      </span>
                    </div>
                    <p style={{ fontSize: "0.78rem", color: "#94a3b8", margin: "4px 0 8px 0", lineHeight: "1.35" }}>
                      {pst.desc}
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                      {pst.inds.map((ind, i) => (
                        <span key={i} style={{ fontSize: "0.7rem", background: "#0d1a2d", border: "1px solid #1e3a5f", color: "#cbd5e1", padding: "1px 5px", borderRadius: "4px" }}>
                          {ind}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                    <button
                      type="button"
                      onClick={() => runPresetStrategy(pst.id)}
                      disabled={loading}
                      style={{
                        flex: 1,
                        background: isSel ? "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)" : "#0d1a2d",
                        border: `1px solid ${isSel ? "#38bdf8" : "#1e3a5f"}`,
                        color: "#fff",
                        padding: "6px 8px",
                        borderRadius: "6px",
                        fontSize: "0.76rem",
                        fontWeight: "700",
                        cursor: "pointer"
                      }}
                    >
                      ▶ Run Simulation
                    </button>
                    {pst.id !== "ALL" && (
                      <button
                        type="button"
                        onClick={() => openPresetInStudio(pst.id)}
                        style={{
                          background: "transparent",
                          border: "1px solid #334155",
                          color: "#94a3b8",
                          padding: "6px 8px",
                          borderRadius: "6px",
                          fontSize: "0.74rem",
                          fontWeight: "600",
                          cursor: "pointer"
                        }}
                        title="Customize this preset in the 9-stage Studio"
                      >
                        🛠️ Customize
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* User Projects in Presets Tab */}
          {projects.length > 0 && (
            <div style={{ marginTop: "8px" }}>
              <h4 style={{ margin: "0 0 10px 0", fontSize: "0.95rem", color: "#10b981", fontWeight: "700" }}>
                📁 My Saved Strategy Projects ({projects.length})
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "12px" }}>
                {projects.map(p => {
                  const isSel = strategy === `proj_${p.id}`;
                  return (
                    <div
                      key={p.id}
                      style={{
                        background: isSel ? "linear-gradient(145deg, #06281e 0%, #0b1523 100%)" : "#08111d",
                        border: `1px solid ${isSel ? "#10b981" : "#1e3a5f"}`,
                        borderRadius: "10px",
                        padding: "14px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        gap: "10px",
                        boxShadow: isSel ? "0 0 12px rgba(16, 185, 129, 0.2)" : "none"
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontWeight: "700", fontSize: "0.9rem", color: isSel ? "#10b981" : "#f8fafc" }}>
                            📁 {p.name}
                          </span>
                          <span style={{ fontSize: "0.68rem", background: "rgba(16, 185, 129, 0.15)", color: "#10b981", padding: "2px 6px", borderRadius: "4px", fontWeight: "700" }}>
                            {p.symbol} • {p.candleInterval}
                          </span>
                        </div>
                        <p style={{ fontSize: "0.78rem", color: "#94a3b8", margin: "4px 0 8px 0" }}>
                          {p.description || "Custom algorithmic strategy project."}
                        </p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          {(p.indicators || []).map((ind, i) => (
                            <span key={i} style={{ fontSize: "0.7rem", background: "#0d1a2d", border: "1px solid #1e3a5f", color: "#cbd5e1", padding: "1px 5px", borderRadius: "4px" }}>
                              {ind.name} {ind.params?.period ? `(${ind.params.period})` : ""}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "6px", marginTop: "4px" }}>
                        <button
                          type="button"
                          onClick={() => runPresetStrategy(`proj_${p.id}`)}
                          disabled={loading}
                          style={{
                            flex: 1,
                            background: isSel ? "linear-gradient(135deg, #059669 0%, #047857 100%)" : "#0d1a2d",
                            border: `1px solid ${isSel ? "#10b981" : "#1e3a5f"}`,
                            color: "#fff",
                            padding: "6px 8px",
                            borderRadius: "6px",
                            fontSize: "0.76rem",
                            fontWeight: "700",
                            cursor: "pointer"
                          }}
                        >
                          ▶ Run Project
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLoadProject(p)}
                          style={{
                            background: "transparent",
                            border: "1px solid #334155",
                            color: "#94a3b8",
                            padding: "6px 8px",
                            borderRadius: "6px",
                            fontSize: "0.74rem",
                            fontWeight: "600",
                            cursor: "pointer"
                          }}
                        >
                          ✏️ Edit in Studio
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3 Studio View Modes: Interactive Chart Builder / Form Studio / Direct JSON */}
      {activeTab === "custom" && (
        <div className="custom-builder-card">
          <div className="builder-header">
            <div className="builder-header-left">
              <h3>🛠️ Institutional Strategy Studio</h3>
              <div className="studio-view-toggle">
                <button
                  className={`studio-view-btn ${customViewMode === "chart_builder" ? "active" : ""}`}
                  onClick={() => setCustomViewMode("chart_builder")}
                >
                  📈 Interactive Visual Chart Builder
                </button>
                <button
                  className={`studio-view-btn ${customViewMode === "form_studio" ? "active" : ""}`}
                  onClick={() => setCustomViewMode("form_studio")}
                >
                  ⚙️ 9-Stage Form Studio
                </button>
                <button
                  className={`studio-view-btn ${customViewMode === "json" ? "active" : ""}`}
                  onClick={() => setCustomViewMode("json")}
                >
                  📝 Direct JSON Code
                </button>
              </div>
            </div>

            <div className="builder-actions" style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              {activeProjectId && (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "rgba(16, 185, 129, 0.12)",
                  border: "1px solid #10b981",
                  borderRadius: "8px",
                  padding: "4px 10px"
                }}>
                  <span style={{ fontSize: "0.78rem", color: "#10b981", fontWeight: "bold" }}>
                    📂 Editing: {projects.find(p => p.id === activeProjectId)?.name || customStrategyName}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const existing = projects.find(p => p.id === activeProjectId);
                      if (existing) {
                        handleSaveProject({
                          ...currentStudioSnapshot,
                          name: existing.name,
                          description: existing.description,
                          category: existing.category
                        }, activeProjectId);
                        alert(`Strategy project "${existing.name}" updated successfully!`);
                      }
                    }}
                    style={{
                      background: "#10b981",
                      border: "none",
                      color: "#fff",
                      borderRadius: "5px",
                      padding: "3px 8px",
                      fontSize: "0.72rem",
                      fontWeight: "bold",
                      cursor: "pointer"
                    }}
                    title="Save edits directly to this project"
                  >
                    💾 Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveProjectId(null)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#94a3b8",
                      fontSize: "0.8rem",
                      cursor: "pointer"
                    }}
                    title="Unlink project and edit as new"
                  >
                    ✕
                  </button>
                </div>
              )}

              <button
                type="button"
                className="studio-view-btn"
                onClick={() => setIsProjectsModalOpen(true)}
                style={{
                  background: "#0d1a2d",
                  border: "1px solid #38bdf8",
                  color: "#38bdf8",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontWeight: "700"
                }}
              >
                📁 My Strategy Projects
                <span style={{
                  background: "#0284c7",
                  color: "#fff",
                  fontSize: "0.72rem",
                  padding: "1px 6px",
                  borderRadius: "10px"
                }}>
                  {projects.length}
                </span>
              </button>

              <button
                type="button"
                className="studio-view-btn"
                onClick={() => setIsProjectsModalOpen(true)}
                style={{
                  background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                  border: "1px solid #38bdf8",
                  color: "#fff",
                  fontWeight: "700",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px"
                }}
              >
                💾 Save As Project
              </button>

              <button
                type="button"
                className="studio-view-btn"
                onClick={() => handleExecuteProject()}
                disabled={executeLoading}
                style={{
                  background: "rgba(245, 158, 11, 0.15)",
                  border: "1px solid #f59e0b",
                  color: "#f59e0b",
                  fontWeight: "700",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px"
                }}
                title="Evaluate strategy on live latest candles"
              >
                {executeLoading ? "⚡ Executing..." : "⚡ Execute Live"}
              </button>

              <select onChange={e => e.target.value && loadTemplate(e.target.value)} defaultValue="">
                <option value="" disabled>Load Strategy Template...</option>
                {Object.keys(INSTITUTIONAL_TEMPLATES).map(tmpl => (
                  <option key={tmpl} value={tmpl}>{tmpl}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* VIEW MODE 1: PAPERBULL INSTITUTIONAL STRATEGY BUILDER                     */}
          {/* ========================================================================= */}
          {customViewMode === "chart_builder" && (
            <StrategyBuilder
              symbol={symbol}
              candleInterval={candleInterval}
              period={period}
              indicators={indicators}
              setIndicators={setIndicators}
              trendFilter={trendFilter}
              setTrendFilter={setTrendFilter}
              entryLogicType={entryLogicType}
              setEntryLogicType={setEntryLogicType}
              entryConditions={entryConditions}
              setEntryConditions={setEntryConditions}
              exitLogicType={exitLogicType}
              setExitLogicType={setExitLogicType}
              exitConditions={exitConditions}
              setExitConditions={setExitConditions}
              positionSizing={positionSizing}
              setPositionSizing={setPositionSizing}
              stopLoss={stopLoss}
              setStopLoss={setStopLoss}
              takeProfit={takeProfit}
              setTakeProfit={setTakeProfit}
              breakevenTriggerPct={breakevenTriggerPct}
              setBreakevenTriggerPct={setBreakevenTriggerPct}
              portfolioGuardrails={portfolioGuardrails}
              setPortfolioGuardrails={setPortfolioGuardrails}
              availableVariables={availableVariables}
              report={report}
              indicatorSeries={indicatorSeries}
              isScanning={isScanning}
              scanProgress={scanProgress}
              visibleTrades={visibleTrades}
            />
          )}

          {/* ========================================================================= */}
          {/* VIEW MODE 2: 9-STAGE FORM STUDIO                                          */}
          {/* ========================================================================= */}
          {customViewMode === "form_studio" && (
            <FormStudio9Stage
              symbol={symbol}
              setSymbol={setSymbol}
              selectedBasket={selectedBasket}
              setSelectedBasket={setSelectedBasket}
              handleBasketChange={handleBasketChange}
              basketPresets={BASKET_PRESETS}
              period={period}
              setPeriod={setPeriod}
              candleInterval={candleInterval}
              setCandleInterval={setCandleInterval}
              startDate={startDate}
              setStartDate={setStartDate}
              endDate={endDate}
              setEndDate={setEndDate}
              initialCapital={initialCapital}
              setInitialCapital={setInitialCapital}
              indicators={indicators}
              setIndicators={setIndicators}
              addIndicatorByType={addIndicatorByType}
              removeIndicator={removeIndicator}
              updateIndicator={updateIndicator}
              trendFilter={trendFilter}
              setTrendFilter={setTrendFilter}
              entryLogicType={entryLogicType}
              setEntryLogicType={setEntryLogicType}
              entryConditions={entryConditions}
              setEntryConditions={setEntryConditions}
              exitLogicType={exitLogicType}
              setExitLogicType={setExitLogicType}
              exitConditions={exitConditions}
              setExitConditions={setExitConditions}
              positionSizing={positionSizing}
              setPositionSizing={setPositionSizing}
              stopLoss={stopLoss}
              setStopLoss={setStopLoss}
              takeProfit={takeProfit}
              setTakeProfit={setTakeProfit}
              breakevenTriggerPct={breakevenTriggerPct}
              setBreakevenTriggerPct={setBreakevenTriggerPct}
              portfolioGuardrails={portfolioGuardrails}
              setPortfolioGuardrails={setPortfolioGuardrails}
              availableVariables={availableVariables}
              previewCustomIndicator={previewCustomIndicator}
              previewLoading={previewLoading}
              previewOutput={previewOutput}
              report={report}
              indicatorSeries={indicatorSeries}
              isScanning={isScanning}
              scanProgress={scanProgress}
              visibleTrades={visibleTrades}
            />
          )}

          {/* ========================================================================= */}
          {/* VIEW MODE 3: DIRECT JSON CODE                                            */}
          {/* ========================================================================= */}
          {customViewMode === "json" && (
            <div className="builder-section">
              <div className="builder-section-title">
                <span>Direct Institutional Strategy JSON Code</span>
              </div>
              <textarea
                className="json-textarea"
                value={rawJson}
                onChange={e => setRawJson(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="error-banner">
          ⚠️ {error}
        </div>
      )}

      {/* Stage 9: Results, Simulation & Chart */}
      {report && (
        <div className="backtest-results" id="algo-backtest-results-section" style={{ scrollMarginTop: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "16px" }}>
            <div>
              <h2 style={{ margin: 0 }}>📊 Simulation Report: {report.strategy_name} on {report.symbol}</h2>
              <div className="period-subtitle">{report.period_from} to {report.period_to} ({report.n_candles} candles)</div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setIsProjectsModalOpen(true)}
                style={{
                  background: "#0d1a2d",
                  border: "1px solid #38bdf8",
                  color: "#38bdf8",
                  borderRadius: "6px",
                  padding: "6px 14px",
                  fontSize: "0.82rem",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                💾 Save as Project
              </button>
            </div>
          </div>

          {/* Interactive Simulation Chart (Price Action, Indicator Overlays & Buy/Sell Marker Executions) - Only rendered here if NOT already displayed inside StrategyBuilder to avoid duplicate graphs */}
          {(activeTab === "preset" || customViewMode !== "chart_builder") && (
            <div className="pb-section-card" id="algo-simulation-chart-canvas" style={{ background: "#0b1523", borderRadius: "12px", padding: "16px", marginBottom: "20px", border: "1px solid #1e3a5f" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <span style={{ fontSize: "0.92rem", color: "#38bdf8", fontWeight: "bold" }}>
                  📈 Interactive Algorithmic Simulation Chart &amp; Indicator Overlays
                </span>
                <span style={{ fontSize: "0.76rem", color: "#94a3b8" }}>
                  {report.price_data?.length || 0} Candles • {visibleTrades.length} Trade Signals Executed
                </span>
              </div>
              <AlgoSimulationChart
                lineData={simulationChartData}
                timeframe={candleInterval}
                trades={simulationTrades}
                indicatorSeries={indicatorSeries}
                isScanning={isScanning}
                scanProgress={scanProgress}
              />
            </div>
          )}

          {!isScanning && (
            <>
              <div className="stats-grid">
                <div className="stat-card">
                  <span className="stat-label">Final Equity</span>
                  <span className={`stat-value ${(report.final_equity ?? 0) >= (report.initial_capital ?? 0) ? "green" : "red"}`}>
                    {fmtInr(report.final_equity)}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Total Return</span>
                  <span className={`stat-value ${(report.total_return_pct ?? 0) >= 0 ? "green" : "red"}`}>
                    {(report.total_return_pct ?? 0) >= 0 ? "+" : ""}{fmtPct(report.total_return_pct)}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Win Rate</span>
                  <span className="stat-value">{fmtPct(report.win_rate_pct)}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Max Drawdown</span>
                  <span className="stat-value red">-{fmtPct(report.max_drawdown_pct)}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Profit Factor</span>
                  <span className="stat-value">{report.profit_factor != null ? report.profit_factor.toFixed(2) : "N/A"}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Total Trades</span>
                  <span className="stat-value">{report.total_trades ?? 0}</span>
                </div>
              </div>

              <div className="trades-section">
                <h3>Trade Log ({report.signals.length} Executions)</h3>
                {report.signals.length === 0 ? (
                  <p>No trades executed during this period with the current strategy conditions.</p>
                ) : (
                  <table className="trades-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Action</th>
                        <th>Price</th>
                        <th>Reason</th>
                        <th>PnL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.signals.map((sig, idx) => (
                        <tr key={idx} className={sig.type.toLowerCase()}>
                          <td>{new Date(sig.executed_at).toLocaleString()}</td>
                          <td>
                            <span className={`badge ${sig.type.toLowerCase()}`}>
                              {sig.type}
                            </span>
                          </td>
                          <td>{fmtInr(sig.price)}</td>
                          <td>{sig.reason || sig.label || "Condition Met"}</td>
                          <td className={sig.pnl > 0 ? "green" : sig.pnl < 0 ? "red" : ""}>
                            {sig.pnl !== undefined ? (sig.pnl >= 0 ? `+${fmtInr(sig.pnl)}` : `-${fmtInr(Math.abs(sig.pnl))}`) : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Preset Multi-Strategy Comparison Table */}
      {reports.length > 0 && !report && (
        <div className="backtest-results">
          <h2>🏆 Multi-Strategy Backtest Comparison</h2>
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Strategy Name</th>
                <th>Total Return</th>
                <th>Win Rate</th>
                <th>Total Trades</th>
                <th>Profit Factor</th>
                <th>Max Drawdown</th>
                <th>Final Equity</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r, i) => (
                <tr key={i}>
                  <td className="strategy-name">{r.strategy_name}</td>
                  <td className={(r.total_return_pct ?? 0) >= 0 ? "green" : "red"}>
                    {(r.total_return_pct ?? 0) >= 0 ? "+" : ""}{fmtPct(r.total_return_pct)}
                  </td>
                  <td>{fmtPct(r.win_rate_pct)}</td>
                  <td>{r.total_trades ?? 0}</td>
                  <td>{r.profit_factor != null ? r.profit_factor.toFixed(2) : "N/A"}</td>
                  <td className="red">-{fmtPct(r.max_drawdown_pct)}</td>
                  <td>{fmtInr(r.final_equity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Strategy Projects Hub Modal */}
      <StrategyProjectsModal
        isOpen={isProjectsModalOpen}
        onClose={() => setIsProjectsModalOpen(false)}
        projects={projects}
        activeProjectId={activeProjectId}
        onSaveProject={handleSaveProject}
        onLoadProject={handleLoadProject}
        onDeleteProject={handleDeleteProject}
        onBacktestProject={handleBacktestProject}
        onExecuteProject={handleExecuteProject}
        currentStudioState={currentStudioSnapshot}
      />

      {/* Live Signal Execution Results Modal */}
      {executeModalOpen && (
        <div className="pb-modal-overlay" style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(3, 7, 18, 0.85)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10000,
          padding: "20px"
        }}>
          <div style={{
            background: "#0b1523",
            border: "1px solid #1e3a5f",
            borderRadius: "14px",
            width: "100%",
            maxWidth: "680px",
            boxShadow: "0 25px 60px -15px rgba(0,0,0,0.9), 0 0 30px rgba(245, 158, 11, 0.2)",
            overflow: "hidden"
          }}>
            <div style={{
              padding: "16px 20px",
              borderBottom: "1px solid #1e3a5f",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "linear-gradient(90deg, #18283e 0%, #0b1523 100%)"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "1.3rem" }}>⚡</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#f8fafc", fontWeight: "700" }}>
                    Live Strategy Execution & Signal Engine
                  </h3>
                  <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                    Real-time market evaluation on {symbol}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExecuteModalOpen(false)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", fontSize: "1.2rem", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "20px" }}>
              {executeLoading ? (
                <div style={{ padding: "30px", textAlign: "center", color: "#38bdf8" }}>
                  <span className="spin-dot" style={{ display: "inline-block", width: "24px", height: "24px", borderWidth: "3px" }} />
                  <p style={{ marginTop: "14px", fontSize: "0.95rem" }}>Evaluating strategy signals against live market price action...</p>
                </div>
              ) : executeResult?.success ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div style={{
                    background: "#0d1a2d",
                    border: "1px solid #1e3a5f",
                    borderRadius: "10px",
                    padding: "14px 16px",
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "10px",
                    textAlign: "center"
                  }}>
                    <div>
                      <span style={{ fontSize: "0.74rem", color: "#94a3b8", display: "block" }}>Latest Price</span>
                      <span style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#38bdf8" }}>
                        {fmtInr(executeResult.latest_candle?.close || 0)}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: "0.74rem", color: "#94a3b8", display: "block" }}>Candles Processed</span>
                      <span style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#f8fafc" }}>
                        {executeResult.candles_analyzed}
                      </span>
                    </div>
                    <div>
                      <span style={{ fontSize: "0.74rem", color: "#94a3b8", display: "block" }}>Signals Generated</span>
                      <span style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#10b981" }}>
                        {executeResult.total_signals_generated}
                      </span>
                    </div>
                  </div>

                  {/* Signal Decision Card */}
                  <div style={{
                    background: executeResult.latest_signal?.type === "BUY" ? "rgba(16, 185, 129, 0.1)" : executeResult.latest_signal?.type === "SELL" ? "rgba(239, 68, 68, 0.1)" : "#0d1a2d",
                    border: `1px solid ${executeResult.latest_signal?.type === "BUY" ? "#10b981" : executeResult.latest_signal?.type === "SELL" ? "#ef4444" : "#1e3a5f"}`,
                    borderRadius: "10px",
                    padding: "16px"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.85rem", color: "#cbd5e1", fontWeight: "600" }}>Live Signal Action:</span>
                      <span style={{
                        background: executeResult.latest_signal?.type === "BUY" ? "#10b981" : executeResult.latest_signal?.type === "SELL" ? "#ef4444" : "#64748b",
                        color: "#fff",
                        padding: "4px 12px",
                        borderRadius: "6px",
                        fontWeight: "800",
                        fontSize: "0.9rem"
                      }}>
                        {executeResult.latest_signal ? executeResult.latest_signal.type : "NEUTRAL / HOLD"}
                      </span>
                    </div>

                    {executeResult.latest_signal && (
                      <div style={{ marginTop: "10px", fontSize: "0.82rem", color: "#cbd5e1" }}>
                        <p style={{ margin: "4px 0" }}><strong>Execution Price:</strong> {fmtInr(executeResult.latest_signal.price)}</p>
                        <p style={{ margin: "4px 0" }}><strong>Reason:</strong> {executeResult.latest_signal.reason || "Rule Conditions Met"}</p>
                        <p style={{ margin: "4px 0" }}><strong>Triggered At:</strong> {new Date(executeResult.latest_signal.executed_at).toLocaleString()}</p>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                    <button
                      type="button"
                      onClick={() => setExecuteModalOpen(false)}
                      style={{ background: "#1e293b", border: "1px solid #334155", color: "#cbd5e1", padding: "6px 14px", borderRadius: "6px", cursor: "pointer", fontWeight: "600" }}
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setExecuteModalOpen(false);
                        runBacktest();
                      }}
                      style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)", border: "none", color: "#fff", padding: "6px 16px", borderRadius: "6px", fontWeight: "bold", cursor: "pointer" }}
                    >
                      ▶ Run Full Historical Backtest
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "20px" }}>
                  <p style={{ color: "#ef4444" }}>⚠️ Execution Error: {executeResult?.error || "Unable to execute strategy on current data."}</p>
                  <button
                    type="button"
                    onClick={() => setExecuteModalOpen(false)}
                    style={{ background: "#1e293b", border: "1px solid #334155", color: "#cbd5e1", padding: "6px 14px", borderRadius: "6px", cursor: "pointer", marginTop: "10px" }}
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
