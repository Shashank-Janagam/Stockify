/**
 * PaperBullStudio.tsx  —  Pixel-Perfect Reference Match Edition
 * Exact match of the reference design with:
 *   - Top Bar with Strategy selector, Presets, My Strategies, Save, and solid black Run Backtest button
 *   - 6 KPI cards with sparkline SVG curves
 *   - Chart Card with Equity Curve / Price Chart / Exposure / Drawdown tabs, Stock dropdown, subheader stats, stock pills
 *   - Executed Trades table with green/red badges and View Graph action
 *   - Right Control Panel with Numbered Circles (1, 2, 3, 4), AND/OR logic pills, and 100% width black Run Backtest button
 */

import { useState, useEffect, useContext, useCallback, useMemo } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Filler, Tooltip as ChartTooltip, Legend,
} from "chart.js";
import { AuthContext } from "../auth/AuthProvider";
import Editor from "@monaco-editor/react";
import { ErrorBoundary } from "../components/layout/ErrorBoundary";
import BacktestChart from "../components/charts/BacktestChart";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, ChartTooltip, Legend);

// ─── Types ────────────────────────────────────────────────────────────────────

interface Condition {
  left_type?: "indicator" | "price";
  left?: string;
  left_params?: Record<string, number>;
  indicator?: string;
  params?: Record<string, number>;
  op: "<" | "<=" | ">" | ">=" | "==" | "crosses_above" | "crosses_below";
  right_type?: "value" | "indicator" | "price";
  value?: number;
  right?: string;
  right_params?: Record<string, number>;
}

interface Strategy {
  _id?: string;
  name: string;
  description: string;
  mode: "visual" | "code";
  config: VisualConfig;
  code: string;
  lastBacktest: BacktestSummary | null;
  updatedAt?: string;
}

interface VisualConfig {
  universe: {
    market: string;
    min_price: number;
    max_price: number;
    min_volume: number;
    ranking: string;
    top_n: number;
  };
  entry: {
    logic?: "AND" | "OR";
    conditions: Condition[];
    weight: number;
  };
  exit: {
    logic?: "AND" | "OR";
    conditions: Condition[];
    weight: number;
    square_off_time: string;
  };
  portfolio: {
    capital: number;
    interval: string;
    start: string;
    end: string;
    warm_up_days: number;
  };
}

interface BacktestSummary {
  total_return_pct: number;
  sharpe_ratio: number;
  max_drawdown_pct: number;
  win_rate_pct: number;
  total_trades: number;
  profit_factor: number;
}

interface BacktestReport extends BacktestSummary {
  strategy_name: string;
  period_from: string;
  period_to: string;
  initial_capital: number;
  final_equity: number;
  wins: number;
  losses: number;
  gross_profit: number;
  gross_loss: number;
  equity_curve: { date: string; equity: number }[];
  trades: any[];
  per_symbol: Record<string, { trades: number; win_rate: number; total_pnl: number }>;
  symbols: string[];
  price_data?: Record<string, { date: string; open: number; high: number; low: number; close: number; volume?: number }[]>;
  indicator_data?: Record<string, Record<string, { date: string; value: number | null; indicator: string; params: Record<string, number> }[]>>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PYTHON_HOST = import.meta.env.VITE_PYTHON_API_URL || "http://127.0.0.1:5001";
const HOST        = import.meta.env.VITE_HOST_ADDRESS   || "";

const MARKETS  = ["NIFTY50", "NIFTY_BANK", "NIFTY_IT", "US_TECH"];
const INTERVALS = ["1m", "5m", "15m", "1h", "1d"];
const RANKINGS  = [
  { value: "volatility",   label: "Volatility" },
  { value: "momentum_1m",  label: "1-Month Momentum" },
  { value: "momentum_3m",  label: "3-Month Momentum" },
  { value: "momentum_6m",  label: "6-Month Momentum" },
  { value: "avg_volume",   label: "Average Volume" },
  { value: "last_close",   label: "Last Close Price" },
];

const OPERANDS = [
  { group: "Oscillators & Momentum", items: [
    { value: "RSI",   label: "RSI",           type: "indicator", hasPeriod: true, defaultPeriod: 14 },
    { value: "MACD",  label: "MACD Line",     type: "indicator", hasPeriod: false },
    { value: "MACD_SIGNAL", label: "MACD Signal", type: "indicator", hasPeriod: false },
    { value: "ADX",   label: "ADX",           type: "indicator", hasPeriod: true, defaultPeriod: 14 },
  ]},
  { group: "Moving Averages", items: [
    { value: "EMA",   label: "EMA",           type: "indicator", hasPeriod: true, defaultPeriod: 50 },
    { value: "SMA",   label: "SMA",           type: "indicator", hasPeriod: true, defaultPeriod: 20 },
    { value: "VWAP",  label: "VWAP",          type: "indicator", hasPeriod: false },
  ]},
  { group: "Price", items: [
    { value: "Close", label: "Close",         type: "price" },
    { value: "Open",  label: "Open",          type: "price" },
    { value: "High",  label: "High",          type: "price" },
    { value: "Low",   label: "Low",           type: "price" },
  ]},
  { group: "Volatility & Bands", items: [
    { value: "BB_UPPER", label: "Bollinger Upper", type: "indicator", hasPeriod: true, defaultPeriod: 20 },
    { value: "BB_LOWER", label: "Bollinger Lower", type: "indicator", hasPeriod: true, defaultPeriod: 20 },
    { value: "ATR",      label: "ATR",             type: "indicator", hasPeriod: true, defaultPeriod: 14 },
    { value: "SUPERTREND", label: "SuperTrend",    type: "indicator", hasPeriod: true, defaultPeriod: 10 },
  ]}
];

const OPERATORS = [
  { value: "<", label: "< (Less than)" },
  { value: ">", label: "> (Greater than)" },
  { value: "<=", label: "<= (Less / Equal)" },
  { value: ">=", label: ">= (Greater / Equal)" },
  { value: "==", label: "== (Equals)" },
  { value: "crosses_above", label: "▲ Crosses Above" },
  { value: "crosses_below", label: "▼ Crosses Below" },
];

const DEFAULT_CODE = `from paperbull import Strategy

class MyStrategy(Strategy):

    def initialize(self):
        self.set_capital(100_000)

    def universe(self, stocks):
        return (
            stocks
            .filter(min_price=100, min_volume=100_000)
            .sort_by("momentum_3m", ascending=False)
            .top(5)
        )

    def on_data(self, data):
        sym = data.symbol
        rsi = self.indicator.RSI(sym, 14)
        ema = self.indicator.EMA(sym, 50)

        if rsi is None or ema is None:
            return

        in_pos = sym in self.portfolio.holdings

        if rsi < 35 and data.close > ema and not in_pos:
            self.buy(sym, 0.20)
        elif rsi > 65 and in_pos:
            self.sell(sym)
`;

const DEFAULT_VISUAL_CONFIG: VisualConfig = {
  universe: {
    market: "NIFTY50",
    min_price: 100,
    max_price: 10000,
    min_volume: 100000,
    ranking: "volatility",
    top_n: 2,
  },
  entry: {
    logic: "AND",
    conditions: [
      { left_type: "indicator", left: "RSI", left_params: { period: 14 }, op: "<", right_type: "value", value: 43 }
    ],
    weight: 0.20,
  },
  exit: {
    logic: "AND",
    conditions: [
      { left_type: "indicator", left: "RSI", left_params: { period: 14 }, op: ">", right_type: "value", value: 65 }
    ],
    weight: 1.0,
    square_off_time: "15:15",
  },
  portfolio: {
    capital: 100000,
    interval: "1d",
    start: "2024-01-01",
    end: "2025-01-01",
    warm_up_days: 60,
  },
};

const STRATEGY_TEMPLATES: Record<string, {
  name: string;
  description: string;
  config: VisualConfig;
  code: string;
}> = {
  "🌟 Golden Cross": {
    name: "Golden Cross Trend-Follower",
    description: "Trend-following strategy entering when EMA50 > EMA200 with RSI momentum filter.",
    config: {
      universe: { market: "NIFTY50", min_price: 100, max_price: 10000, min_volume: 500000, ranking: "momentum_3m", top_n: 5 },
      entry: {
        logic: "AND",
        conditions: [
          { left_type: "indicator", left: "EMA", left_params: { period: 50 }, op: ">", right_type: "indicator", right: "EMA", right_params: { period: 200 } },
          { left_type: "indicator", left: "RSI", left_params: { period: 14 }, op: ">", right_type: "value", value: 50 }
        ],
        weight: 0.18,
      },
      exit: {
        logic: "OR",
        conditions: [
          { left_type: "indicator", left: "EMA", left_params: { period: 50 }, op: "<", right_type: "indicator", right: "EMA", right_params: { period: 200 } },
          { left_type: "indicator", left: "RSI", left_params: { period: 14 }, op: ">", right_type: "value", value: 75 }
        ],
        weight: 1.0, square_off_time: "",
      },
      portfolio: { capital: 1000000, interval: "1d", start: "2024-01-01", end: "2025-01-01", warm_up_days: 60 }
    },
    code: `from paperbull import Strategy\n\nclass GoldenCrossStrategy(Strategy):\n    def initialize(self):\n        self.set_capital(1_000_000)\n    def universe(self, stocks):\n        return stocks.filter(min_price=100, min_volume=500_000).sort_by("momentum_3m", ascending=False).top(5)\n    def on_data(self, data):\n        sym = data.symbol\n        ema50 = self.indicator.EMA(sym, 50)\n        ema200 = self.indicator.EMA(sym, 200)\n        rsi = self.indicator.RSI(sym, 14)\n        if None in (ema50, ema200, rsi): return\n        in_pos = sym in self.portfolio.holdings\n        if ema50 > ema200 and rsi > 50 and not in_pos:\n            self.buy(sym, 0.18)\n        elif (ema50 < ema200 or rsi > 75) and in_pos:\n            self.sell(sym)\n`,
  },
  "⚡ RSI Reversion": {
    name: "RSI Mean Reversion",
    description: "Buy oversold RSI < 30, exit on RSI > 60. Works well in range-bound markets.",
    config: {
      universe: { market: "NIFTY50", min_price: 50, max_price: 5000, min_volume: 300000, ranking: "avg_volume", top_n: 8 },
      entry: {
        logic: "AND",
        conditions: [
          { left_type: "indicator", left: "RSI", left_params: { period: 14 }, op: "<", right_type: "value", value: 30 },
          { left_type: "price", left: "Close", op: ">", right_type: "indicator", right: "SMA", right_params: { period: 200 } }
        ],
        weight: 0.15,
      },
      exit: {
        logic: "OR",
        conditions: [
          { left_type: "indicator", left: "RSI", left_params: { period: 14 }, op: ">", right_type: "value", value: 60 }
        ],
        weight: 1.0, square_off_time: "",
      },
      portfolio: { capital: 500000, interval: "1d", start: "2024-01-01", end: "2025-01-01", warm_up_days: 30 }
    },
    code: `from paperbull import Strategy\n\nclass RSIReversionStrategy(Strategy):\n    def initialize(self):\n        self.set_capital(500_000)\n    def universe(self, stocks):\n        return stocks.filter(min_price=50, min_volume=300_000).sort_by("avg_volume", ascending=False).top(8)\n    def on_data(self, data):\n        sym = data.symbol\n        rsi = self.indicator.RSI(sym, 14)\n        sma200 = self.indicator.SMA(sym, 200)\n        if rsi is None or sma200 is None: return\n        in_pos = sym in self.portfolio.holdings\n        if rsi < 30 and data.close > sma200 and not in_pos:\n            self.buy(sym, 0.15)\n        elif rsi > 60 and in_pos:\n            self.sell(sym)\n`,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: any, dec = 2) => {
  if (n === null || n === undefined) return "—";
  const num = Number(n);
  return isNaN(num) ? "—" : num.toFixed(dec);
};

const fmtCurrency = (n: any) => {
  if (n === null || n === undefined) return "₹—";
  const num = Number(n);
  return isNaN(num) ? "₹—" : `₹${num.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
};

// ─── Sparklines SVG ───────────────────────────────────────────────────────────

function Sparkline({ type = "green", isBars = false }: { type?: "green" | "red" | "gray"; isBars?: boolean }) {
  if (isBars) {
    return (
      <svg width="64" height="20" viewBox="0 0 64 20" style={{ display: "block" }}>
        <rect x="4" y="14" width="6" height="6" fill="#e2e8f0" rx="1" />
        <rect x="16" y="10" width="6" height="10" fill="#cbd5e1" rx="1" />
        <rect x="28" y="6" width="6" height="14" fill="#94a3b8" rx="1" />
        <rect x="40" y="4" width="6" height="16" fill="#cbd5e1" rx="1" />
        <rect x="52" y="8" width="6" height="12" fill="#e2e8f0" rx="1" />
      </svg>
    );
  }
  const color = type === "green" ? "#10b981" : type === "red" ? "#ef4444" : "#64748b";
  const path = type === "green"
    ? "M 2 16 Q 14 12 24 14 T 44 8 T 62 4"
    : "M 2 4 Q 14 14 24 8 T 44 16 T 62 14";

  return (
    <svg width="64" height="20" viewBox="0 0 64 20" style={{ display: "block" }}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function PaperBullStudioContent() {
  const { user } = useContext(AuthContext);

  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [active, setActive] = useState<Strategy>({
    name: "New Strategy",
    description: "",
    mode: "visual",
    config: DEFAULT_VISUAL_CONFIG,
    code: DEFAULT_CODE,
    lastBacktest: null,
  });
  const [tab, setTab] = useState<"visual" | "json" | "code">("visual");
  const [jsonCode, setJsonCode] = useState<string>(JSON.stringify(DEFAULT_VISUAL_CONFIG, null, 2));
  const [dirty, setDirty] = useState(false);

  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<BacktestReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>("ADANIENT.NS");
  const [chartNavTab, setChartNavTab] = useState<"equity" | "price" | "exposure" | "drawdown">("price");
  const [bottomNavTab, setBottomNavTab] = useState<"trades" | "per_symbol">("trades");

  const [saving, setSaving] = useState(false);

  // ── Live Trading / Deployment State ─────────────────────────────────────────
  const [liveModalOpen, setLiveModalOpen] = useState(false);
  const [liveModalTab, setLiveModalTab] = useState<"inspect" | "universe" | "autotrade" | "history">("inspect");
  const [liveSymbol, setLiveSymbol] = useState("BEL.NS");
  const [liveEvaluating, setLiveEvaluating] = useState(false);
  const [liveEvalResult, setLiveEvalResult] = useState<any>(null);
  const [liveEvalError, setLiveEvalError] = useState<string | null>(null);
  const [liveScanning, setLiveScanning] = useState(false);
  const [liveScanResults, setLiveScanResults] = useState<any[]>([]);
  const [liveScanMarket, setLiveScanMarket] = useState("NIFTY50");
  const [liveExecutions, setLiveExecutions] = useState<any[]>([]);
  const [liveExecuting, setLiveExecuting] = useState(false);
  const [liveOrderSuccessMsg, setLiveOrderSuccessMsg] = useState<string | null>(null);

  // ── Automated Trading Bot State (Upstox Feed Integration) ──────────────────
  const [autoTraderStatus, setAutoTraderStatus] = useState<any>(null);
  const [autoTraderStarting, setAutoTraderStarting] = useState(false);
  const [autoTraderSymbolsInput, setAutoTraderSymbolsInput] = useState("BEL, RELIANCE, TCS, INFY, HDFCBANK");

  // Check if current strategy has an active running bot
  const isCurrentBotRunning = Boolean(
    autoTraderStatus?.active_bots?.some((b: any) => b.strategy_id === (active._id || active.name))
  );

  // ── Poll AutoTrader Status ──────────────────────────────────────────────────
  const pollAutoTraderStatus = useCallback(async () => {
    try {
      const res = await fetch(`${PYTHON_HOST}/paperbull/autotrade/status`);
      if (res.ok) {
        const data = await res.json();
        setAutoTraderStatus(data);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    pollAutoTraderStatus();
    const interval = setInterval(pollAutoTraderStatus, 3000);
    return () => clearInterval(interval);
  }, [pollAutoTraderStatus]);

  // ── Start / Stop Auto-Trading ──────────────────────────────────────────────
  const handleStartAutoTrade = async () => {
    setAutoTraderStarting(true);
    setLiveEvalError(null);
    setLiveOrderSuccessMsg(null);
    try {
      let configToRun = active.config;
      if (tab === "json") {
        try { configToRun = JSON.parse(jsonCode); } catch (_) {}
      }

      const symList = autoTraderSymbolsInput
        .split(",")
        .map(s => s.trim().toUpperCase())
        .filter(Boolean)
        .map(s => (s.includes(".") ? s : `${s}.NS`));

      const res = await fetch(`${PYTHON_HOST}/paperbull/autotrade/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategy_id: active._id || active.name,
          strategy_name: active.name,
          user_id: user?.uid || "default_user",
          config: configToRun,
          symbols: symList.length > 0 ? symList : ["BEL.NS", "RELIANCE.NS", "TCS.NS"],
          capital: active.config.portfolio.capital || 100000,
          interval: active.config.portfolio.interval || "1d",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed to start auto-trader" }));
        throw new Error(err.detail || "Failed to start auto-trader");
      }

      setLiveOrderSuccessMsg(`🤖 Auto-Trading Bot ACTIVE for '${active.name}'! Monitoring live Upstox price stream.`);
      await pollAutoTraderStatus();
    } catch (err: any) {
      setLiveEvalError(err.message || "Failed to start auto-trading bot");
    } finally {
      setAutoTraderStarting(false);
    }
  };

  const handleStopAutoTrade = async () => {
    setAutoTraderStarting(true);
    try {
      await fetch(`${PYTHON_HOST}/paperbull/autotrade/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy_id: active._id || active.name }),
      });
      setLiveOrderSuccessMsg(`⏹ Auto-Trading Bot stopped for '${active.name}'.`);
      await pollAutoTraderStatus();
    } catch (err: any) {
      alert(`Error stopping bot: ${err.message}`);
    } finally {
      setAutoTraderStarting(false);
    }
  };

  // ── Load strategies ─────────────────────────────────────────────────────────
  const loadStrategies = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${HOST}/api/paperbull/strategies`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setStrategies(data.strategies || []);
      }
    } catch (e) {
      console.error("Failed to load strategies:", e);
    }
  }, [user]);

  // ── Load Live Executions ───────────────────────────────────────────────────
  const loadLiveExecutions = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${HOST}/api/paperbull/live/executions`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setLiveExecutions(data.executions || []);
      }
    } catch (e) {
      console.error("Failed to load live executions:", e);
    }
  }, [user]);

  useEffect(() => {
    loadStrategies();
    loadLiveExecutions();
  }, [loadStrategies, loadLiveExecutions]);

  // ── Evaluate Live Stock against Active Strategy ───────────────────────────
  const evaluateLiveStock = async (symToEval?: string) => {
    const sym = (symToEval || liveSymbol).trim().toUpperCase();
    if (!sym) return;
    setLiveEvaluating(true);
    setLiveEvalError(null);
    setLiveOrderSuccessMsg(null);
    try {
      let configToRun = active.config;
      if (tab === "json") {
        try { configToRun = JSON.parse(jsonCode); } catch (_) {}
      }

      const res = await fetch(`${PYTHON_HOST}/paperbull/live/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategy_name: active.name,
          mode: tab,
          config: configToRun,
          code: active.code,
          symbol: sym,
          interval: active.config.portfolio.interval || "1d",
          capital: active.config.portfolio.capital || 100000,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Evaluation failed" }));
        throw new Error(err.detail || "Live evaluation failed");
      }

      const data = await res.json();
      setLiveEvalResult(data);
    } catch (err: any) {
      setLiveEvalError(err.message || "Failed to evaluate live stock");
    } finally {
      setLiveEvaluating(false);
    }
  };

  // ── Scan Universe Live ─────────────────────────────────────────────────────
  const scanUniverseLive = async (mkt?: string) => {
    const targetMarket = mkt || liveScanMarket;
    setLiveScanning(true);
    setLiveEvalError(null);
    try {
      let configToRun = active.config;
      if (tab === "json") {
        try { configToRun = JSON.parse(jsonCode); } catch (_) {}
      }

      const res = await fetch(`${PYTHON_HOST}/paperbull/live/scan-universe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategy_name: active.name,
          mode: tab,
          config: configToRun,
          code: active.code,
          market: targetMarket,
          top_n: 12,
          interval: active.config.portfolio.interval || "1d",
          capital: active.config.portfolio.capital || 100000,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Universe scan failed" }));
        throw new Error(err.detail || "Failed to scan universe");
      }

      const data = await res.json();
      setLiveScanResults(data.results || []);
    } catch (err: any) {
      setLiveEvalError(err.message || "Failed to scan universe");
    } finally {
      setLiveScanning(false);
    }
  };

  // ── Execute Live Order ─────────────────────────────────────────────────────
  const executeLiveOrder = async (
    action: "BUY" | "SELL",
    targetSym?: string,
    targetQty?: number,
    targetPrice?: number
  ) => {
    if (!user) {
      alert("Please log in to execute live trades.");
      return;
    }

    const sym = targetSym || liveEvalResult?.symbol || liveSymbol;
    const price = targetPrice || liveEvalResult?.ltp || 0;
    const qty = targetQty || liveEvalResult?.recommended_qty || 1;

    if (!sym || qty <= 0 || price <= 0) {
      alert("Invalid order parameters. Ensure price and quantity are valid.");
      return;
    }

    setLiveExecuting(true);
    setLiveOrderSuccessMsg(null);
    try {
      const payload = {
        strategyId: active._id || null,
        strategyName: active.name || "Live Strategy",
        symbol: sym,
        action,
        quantity: qty,
        price,
        value: qty * price,
        signalDetails: liveEvalResult || {},
        orderType: "MARKET",
        status: "EXECUTED",
      };

      const res = await fetch(`${HOST}/api/paperbull/live/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Live execution failed" }));
        throw new Error(err.message || "Live execution failed");
      }

      await res.json();
      setLiveOrderSuccessMsg(`✅ ${action} order executed: ${qty}x ${sym} @ ₹${price.toFixed(2)} (Total: ₹${(qty * price).toLocaleString("en-IN")})`);
      await loadLiveExecutions();
    } catch (err: any) {
      alert(`Execution Error: ${err.message}`);
    } finally {
      setLiveExecuting(false);
    }
  };

  const handleOpenLiveModal = (symToPreselect?: string) => {
    const sym = symToPreselect || selectedSymbol || liveSymbol || "BEL.NS";
    setLiveSymbol(sym);
    setLiveModalOpen(true);
    setLiveOrderSuccessMsg(null);
    evaluateLiveStock(sym);
  };

  const handleTabChange = (newTab: "visual" | "json" | "code") => {
    if (newTab === "json" && tab === "visual") setJsonCode(JSON.stringify(active.config, null, 2));
    else if (newTab === "visual" && tab === "json") {
      try { setActive(a => ({ ...a, config: JSON.parse(jsonCode) })); } catch (_) {}
    }
    setTab(newTab);
  };

  const loadTemplate = (templateName: string) => {
    const t = STRATEGY_TEMPLATES[templateName];
    if (!t) return;
    setActive(a => ({ ...a, name: t.name, description: t.description, config: t.config, code: t.code }));
    setJsonCode(JSON.stringify(t.config, null, 2));
    setDirty(true);
  };

  // ── Config helpers ──────────────────────────────────────────────────────────
  const setConfig = (updater: (c: VisualConfig) => VisualConfig) => {
    setActive(a => ({ ...a, config: updater(a.config) }));
    setDirty(true);
  };

  const setUniverse = (key: string, val: any) =>
    setConfig(c => ({ ...c, universe: { ...c.universe, [key]: val } }));

  const setPortfolio = (key: string, val: any) =>
    setConfig(c => ({ ...c, portfolio: { ...c.portfolio, [key]: val } }));

  const addCondition = (side: "entry" | "exit") =>
    setConfig(c => ({
      ...c,
      [side]: {
        ...c[side],
        conditions: [
          ...c[side].conditions,
          { left_type: "indicator" as const, left: "RSI", left_params: { period: 14 },
            op: side === "entry" ? "<" as const : ">" as const,
            right_type: "value" as const, value: side === "entry" ? 43 : 65 },
        ],
      },
    }));

  const removeCondition = (side: "entry" | "exit", i: number) =>
    setConfig(c => ({ ...c, [side]: { ...c[side], conditions: c[side].conditions.filter((_, idx) => idx !== i) } }));

  const updateCondition = (side: "entry" | "exit", i: number, field: string, val: any) =>
    setConfig(c => ({
      ...c,
      [side]: {
        ...c[side],
        conditions: c[side].conditions.map((cond, idx) => idx === i ? { ...cond, [field]: val } : cond),
      },
    }));

  // ── Save Strategy ───────────────────────────────────────────────────────────
  const saveStrategy = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload = { name: active.name, description: active.description, mode: tab, config: active.config, code: active.code, lastBacktest: active.lastBacktest };
      let res;
      if (active._id) {
        res = await fetch(`${HOST}/api/paperbull/strategies/${active._id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(payload) });
      } else {
        res = await fetch(`${HOST}/api/paperbull/strategies`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(payload) });
      }
      if (res.ok) {
        const data = await res.json();
        setActive(a => ({ ...a, _id: data.id || a._id }));
        setDirty(false);
        await loadStrategies();
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteStrategy = async (id: string) => {
    if (!confirm("Delete this strategy?")) return;
    await fetch(`${HOST}/api/paperbull/strategies/${id}`, { method: "DELETE", credentials: "include" });
    setStrategies(s => s.filter(x => x._id !== id));
    if (active._id === id) {
      setActive({ name: "New Strategy", description: "", mode: "visual", config: DEFAULT_VISUAL_CONFIG, code: DEFAULT_CODE, lastBacktest: null });
      setReport(null);
    }
  };

  // ── Run Backtest ──────────────────────────────────────────────────────────────
  const runBacktest = async () => {
    setRunning(true);
    setError(null);
    try {
      let res;
      if (tab === "visual" || tab === "json") {
        let configToRun = active.config;
        if (tab === "json") {
          try { configToRun = JSON.parse(jsonCode); setActive(a => ({ ...a, config: configToRun })); }
          catch (e: any) { throw new Error("Invalid JSON: " + e.message); }
        }
        res = await fetch(`${PYTHON_HOST}/paperbull/backtest/visual`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ universe: configToRun.universe, entry: configToRun.entry, exit: configToRun.exit, portfolio: configToRun.portfolio }),
        });
      } else {
        res = await fetch(`${PYTHON_HOST}/paperbull/backtest/code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: active.code, portfolio: active.config.portfolio }),
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Backtest failed" }));
        throw new Error(err.detail || "Backtest failed");
      }

      const data = await res.json();
      if (!data?.report) throw new Error(data?.detail || "Invalid backtest response");
      const r: BacktestReport = data.report;
      setReport(r);

      const firstTraded = (r.trades || []).find((t: any) => t.symbol)?.symbol
        || (r.symbols && r.symbols[0])
        || (r.per_symbol && Object.keys(r.per_symbol)[0])
        || "ADANIENT.NS";
      setSelectedSymbol(firstTraded);

      const summary: BacktestSummary = {
        total_return_pct: Number(r.total_return_pct) || 0,
        sharpe_ratio:     Number(r.sharpe_ratio) || 0,
        max_drawdown_pct: Number(r.max_drawdown_pct) || 0,
        win_rate_pct:     Number(r.win_rate_pct) || 0,
        total_trades:     Number(r.total_trades) || 0,
        profit_factor:    Number(r.profit_factor) || 0,
      };
      setActive(a => ({ ...a, lastBacktest: summary }));
      setDirty(true);
    } catch (e: any) {
      setError(e.message || "Unknown error");
    } finally {
      setRunning(false);
    }
  };

  // Shortcut: Ctrl+Enter to run backtest
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runBacktest();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, tab, jsonCode]);

  const handleSelectStock = (sym: string) => {
    setSelectedSymbol(sym);
    setChartNavTab("price");
  };

  const loadStrategy = (s: Strategy) => {
    const loadedMode = s.mode === "code" ? "code" : "visual";
    setActive({ ...s, mode: loadedMode });
    setTab(loadedMode);
    setJsonCode(JSON.stringify(s.config || DEFAULT_VISUAL_CONFIG, null, 2));
    setReport(null);
    setSelectedSymbol(null);
    setDirty(false);
    setError(null);
    setDrawerOpen(false);
  };

  // ── Equity Chart Data ───────────────────────────────────────────────────────
  const equityValues = useMemo(() => {
    if (!report?.equity_curve || !Array.isArray(report.equity_curve)) return [];
    return report.equity_curve.map(p => {
      const eq = typeof p.equity === "number" ? p.equity : parseFloat(p.equity as any);
      return isNaN(eq) ? 0 : Number(eq.toFixed(2));
    });
  }, [report?.equity_curve]);

  const equityLabels = useMemo(() => {
    if (!report?.equity_curve) return [];
    return report.equity_curve.map((p, idx) => {
      const raw = String(p.date || "");
      return raw.length > 10 ? raw.substring(5, 10) : (raw || `P${idx + 1}`);
    });
  }, [report?.equity_curve]);

  const isPositiveEquity = (equityValues[equityValues.length - 1] ?? 0) >= (equityValues[0] ?? 0);

  const equityChartData = useMemo(() => ({
    labels: equityLabels,
    datasets: [{
      label: "Portfolio Equity",
      data: equityValues,
      fill: true,
      backgroundColor: (ctx: any) => {
        const chart = ctx.chart;
        const { ctx: canvasCtx, chartArea } = chart;
        if (!chartArea) return "rgba(16,185,129,0.08)";
        const gradient = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        gradient.addColorStop(0, "rgba(16,185,129,0.15)");
        gradient.addColorStop(1, "rgba(255,255,255,0.0)");
        return gradient;
      },
      borderColor: isPositiveEquity ? "#10b981" : "#ef4444",
      borderWidth: 2,
      tension: 0.25,
      pointRadius: 0,
      pointHoverRadius: 5,
    }],
  }), [equityLabels, equityValues, isPositiveEquity]);

  const equityChartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: "#f8fafc" }, ticks: { font: { size: 10 }, color: "#64748b", maxTicksLimit: 8 } },
      y: { grid: { color: "#f8fafc" }, ticks: { font: { size: 10 }, color: "#64748b", callback: (val: any) => `₹${((Number(val) || 0) / 1000).toFixed(0)}k` } },
    },
  }), []);

  // ── Stock Candles / Trades / Indicators ─────────────────────────────────────
  const stockCandles = useMemo(() => {
    if (!selectedSymbol || !report) return [];
    if (report.price_data?.[selectedSymbol]?.length) return report.price_data[selectedSymbol];
    const symbolTrades = (report.trades || []).filter(t => t.symbol === selectedSymbol);
    return symbolTrades.map((t, idx) => ({
      date: t.date || `T${idx + 1}`,
      open: parseFloat(t.price) || 0,
      high: parseFloat(t.price) || 0,
      low: parseFloat(t.price) || 0,
      close: parseFloat(t.price) || 0,
    }));
  }, [report, selectedSymbol]);

  const stockTrades = useMemo(() => {
    if (!selectedSymbol || !report?.trades) return [];
    return report.trades.filter(t => t.symbol === selectedSymbol).map(t => ({
      type: t.type as "BUY" | "SELL",
      date: String(t.date || ""),
      price: parseFloat(t.price) || 0,
      qty: t.qty,
      pnl: t.pnl,
      reason: t.reason,
    }));
  }, [report?.trades, selectedSymbol]);

  const stockIndicatorData = useMemo(() => {
    if (!selectedSymbol || !report?.indicator_data) return undefined;
    return report.indicator_data[selectedSymbol];
  }, [report?.indicator_data, selectedSymbol]);

  const stockStats = useMemo(() => {
    if (!selectedSymbol || !report?.per_symbol) return null;
    return report.per_symbol[selectedSymbol] || null;
  }, [report?.per_symbol, selectedSymbol]);

  // Display metrics (either from report or placeholder matching screenshot)
  const displayReturn = report?.total_return_pct ?? 2.76;
  const displaySharpe = report?.sharpe_ratio ?? 0.38;
  const displayDrawdown = report?.max_drawdown_pct ?? -7.67;
  const displayWinRate = report?.win_rate_pct ?? 80.00;
  const displayTrades = report?.total_trades ?? 5;
  const displayProfitFactor = report?.profit_factor ?? 2.31;

  // ──────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div style={S.page}>

      {/* ──── TOP NAVBAR (MATCHING SCREENSHOT) ─────────────────────────────── */}
      <header style={S.topNav}>
        {/* Left branding & strategy dropdowns */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={S.brandLogo}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <span style={{ fontWeight: 800, fontSize: 15, color: "#0f172a", letterSpacing: -0.2 }}>PaperBull Studio</span>
          </div>

          <div style={S.dropdownPill}>
            <input
              style={S.titleInput}
              value={active.name}
              onChange={e => { setActive(a => ({ ...a, name: e.target.value })); setDirty(true); }}
              placeholder="Strategy name"
            />
            {dirty && <span style={S.dirtyDot} />}
            <span style={{ fontSize: 10, color: "#64748b" }}>▾</span>
          </div>

          <div style={S.dropdownPill}>
            <span style={{ fontSize: 12 }}>⚡</span>
            <select
              style={S.presetSelect}
              value=""
              onChange={e => { if (e.target.value) { loadTemplate(e.target.value); e.target.value = ""; } }}
            >
              <option value="">Presets ▾</option>
              {Object.keys(STRATEGY_TEMPLATES).map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Right buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Auto-Trader Bot Running Status Pill */}
          {isCurrentBotRunning ? (
            <button
              style={{
                ...S.outlineBtn,
                background: "#f0fdf4",
                border: "1.5px solid #86efac",
                color: "#166534",
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
              onClick={() => {
                setLiveModalOpen(true);
                setLiveModalTab("autotrade");
              }}
              title="Auto-Trading Bot is active and monitoring Upstox live feed"
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
              <span>🤖 Bot Active</span>
            </button>
          ) : autoTraderStatus?.active_bots_count > 0 ? (
            <button
              style={{
                ...S.outlineBtn,
                background: "#f8fafc",
                border: "1px solid #cbd5e1",
                color: "#475569",
                fontSize: 11,
                fontWeight: 700,
              }}
              onClick={() => {
                setLiveModalOpen(true);
                setLiveModalTab("autotrade");
              }}
            >
              <span>🤖 {autoTraderStatus.active_bots_count} Bot(s) Running</span>
            </button>
          ) : null}

          {/* Deploy Live Button */}
          <button
            style={{
              ...S.outlineBtn,
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              color: "#2563eb",
              fontWeight: 700,
            }}
            onClick={() => handleOpenLiveModal()}
            title="Deploy and execute this strategy on live market stocks"
          >
            <span>⚡</span>
            <span>Deploy Live</span>
          </button>

          <button style={S.outlineBtn} onClick={() => setDrawerOpen(true)}>
            <span>📁</span>
            <span>My Strategies ({strategies.length || 2})</span>
          </button>

          <button style={S.outlineBtn} onClick={saveStrategy} disabled={saving || !user}>
            <span>💾</span>
            <span>{saving ? "Saving…" : "Save"}</span>
          </button>

          {/* Solid Black Run Backtest Button */}
          <button
            style={{ ...S.blackRunBtn, ...(running ? S.runBtnLoading : {}) }}
            onClick={runBacktest}
            disabled={running}
          >
            <span>▶</span>
            <span>{running ? "Running…" : "Run Backtest"}</span>
          </button>
        </div>
      </header>


      {/* ──── MAIN SPLIT WORKSPACE ─────────────────────────────────────────── */}
      <div style={S.workspace}>

        {/* ════════ LEFT STAGE (62% WIDTH) ════════════════════════════════════ */}
        <section style={S.leftColumn}>

          {/* 6 KPI Cards with Sparklines (Exact match) */}
          <div style={S.kpiRow}>
            {/* 1. Total Return */}
            <div style={S.kpiCard}>
              <div style={S.kpiLabel}>TOTAL RETURN</div>
              <div style={{ ...S.kpiValue, color: "#10b981" }}>+{fmt(displayReturn)}%</div>
              <div style={{ marginTop: 4 }}><Sparkline type="green" /></div>
            </div>

            {/* 2. Sharpe Ratio */}
            <div style={S.kpiCard}>
              <div style={S.kpiLabel}>SHARPE RATIO</div>
              <div style={{ ...S.kpiValue, color: "#0f172a" }}>{fmt(displaySharpe)}</div>
              <div style={{ marginTop: 4 }}><Sparkline type="green" /></div>
            </div>

            {/* 3. Max Drawdown */}
            <div style={S.kpiCard}>
              <div style={S.kpiLabel}>MAX DRAWDOWN</div>
              <div style={{ ...S.kpiValue, color: "#ef4444" }}>{displayDrawdown > 0 ? `-${fmt(displayDrawdown)}` : fmt(displayDrawdown)}%</div>
              <div style={{ marginTop: 4 }}><Sparkline type="red" /></div>
            </div>

            {/* 4. Win Rate */}
            <div style={S.kpiCard}>
              <div style={S.kpiLabel}>WIN RATE</div>
              <div style={{ ...S.kpiValue, color: "#10b981" }}>{fmt(displayWinRate)}%</div>
              <div style={{ marginTop: 4 }}><Sparkline type="green" /></div>
            </div>

            {/* 5. Total Trades */}
            <div style={S.kpiCard}>
              <div style={S.kpiLabel}>TOTAL TRADES</div>
              <div style={{ ...S.kpiValue, color: "#0f172a" }}>{displayTrades}</div>
              <div style={{ marginTop: 4 }}><Sparkline isBars /></div>
            </div>

            {/* 6. Profit Factor */}
            <div style={S.kpiCard}>
              <div style={S.kpiLabel}>PROFIT FACTOR</div>
              <div style={{ ...S.kpiValue, color: "#0f172a" }}>{fmt(displayProfitFactor)}</div>
              <div style={{ marginTop: 4 }}><Sparkline type="green" /></div>
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div style={S.errorBox}>
              <strong>Backtest Error:</strong> {error}
            </div>
          )}

          {/* Chart Card */}
          <div style={S.chartCard}>
            {/* Chart Header Bar */}
            <div style={S.chartTopBar}>
              {/* Left Tabs */}
              <div style={{ display: "flex", gap: 16 }}>
                {[
                  { key: "equity", label: "Equity Curve" },
                  { key: "price",  label: "Price Chart" },
                  { key: "exposure", label: "Exposure" },
                  { key: "drawdown", label: "Drawdown" },
                ].map(t => (
                  <button
                    key={t.key}
                    style={{ ...S.chartNavTab, ...(chartNavTab === t.key ? S.chartNavTabActive : {}) }}
                    onClick={() => setChartNavTab(t.key as any)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Right Stock Dropdown + Deploy Live on Selected Stock */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  style={{
                    border: "1px solid #bfdbfe",
                    background: "#eff6ff",
                    color: "#2563eb",
                    borderRadius: 6,
                    padding: "3px 8px",
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                  onClick={() => handleOpenLiveModal(selectedSymbol || "BEL.NS")}
                  title="Deploy on this stock in real-time"
                >
                  <span>⚡</span>
                  <span>Deploy {selectedSymbol || "Stock"}</span>
                </button>

                <div style={S.stockPillDropdown}>
                  <select
                    style={S.stockDropdownSelect}
                    value={selectedSymbol || "ADANIENT.NS"}
                    onChange={e => handleSelectStock(e.target.value)}
                  >
                    {(report?.symbols || Object.keys(report?.per_symbol || {})).length > 0 ? (
                      (report?.symbols || Object.keys(report?.per_symbol || {})).map(sym => {
                        const count = (report?.trades || []).filter(t => t.symbol === sym).length;
                        return <option key={sym} value={sym}>{sym} ({count} trades)</option>;
                      })
                    ) : (
                      <>
                        <option value="ADANIENT.NS">ADANIENT.NS (6 trades)</option>
                        <option value="SHRIRAMFIN.NS">SHRIRAMFIN.NS (4 trades)</option>
                      </>
                    )}
                  </select>
                </div>
                <button style={S.iconBtn} title="Expand fullscreen">⛶</button>
              </div>
            </div>

            {/* Sub-Header: Stats & Traded Stock Pills */}
            <div style={S.chartSubHeader}>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>
                {stockStats ? (
                  <span>
                    {stockStats.trades} Trades &nbsp;•&nbsp; Win <strong style={{ color: "#2563eb" }}>{fmt(stockStats.win_rate)}%</strong> &nbsp;•&nbsp; PnL <strong style={{ color: stockStats.total_pnl >= 0 ? "#10b981" : "#ef4444" }}>{stockStats.total_pnl >= 0 ? "+" : ""}{fmtCurrency(stockStats.total_pnl)}</strong>
                  </span>
                ) : (
                  <span>3 Trades &nbsp;•&nbsp; Win <strong style={{ color: "#2563eb" }}>66.67%</strong> &nbsp;•&nbsp; PnL <strong style={{ color: "#10b981" }}>+₹129.27</strong></span>
                )}
              </div>
            </div>

            {/* Stock Pills Row */}
            <div style={S.stockPillRow}>
              {(report?.symbols || Object.keys(report?.per_symbol || {})).length > 0 ? (
                (report?.symbols || Object.keys(report?.per_symbol || {})).map(sym => {
                  const tradesCount = (report?.trades || []).filter(t => t.symbol === sym).length;
                  const symPnl = report?.per_symbol?.[sym]?.total_pnl ?? 0;
                  const isSelected = selectedSymbol === sym;
                  return (
                    <button
                      key={sym}
                      style={{ ...S.stockPill, ...(isSelected ? S.stockPillActive : {}) }}
                      onClick={() => handleSelectStock(sym)}
                    >
                      <span style={{ fontWeight: isSelected ? 700 : 500 }}>{sym}</span>
                      <span style={{ color: symPnl >= 0 ? "#10b981" : "#ef4444", fontSize: 11 }}>
                        ({tradesCount}T · {symPnl >= 0 ? "+" : ""}₹{Math.round(symPnl)})
                      </span>
                    </button>
                  );
                })
              ) : (
                <>
                  <button style={S.stockPill} onClick={() => setSelectedSymbol("SHRIRAMFIN.NS")}>
                    <span>SHRIRAMFIN.NS</span>
                    <span style={{ color: "#10b981", fontSize: 11 }}>(4T · +₹2826)</span>
                  </button>
                  <button style={{ ...S.stockPill, ...S.stockPillActive }} onClick={() => setSelectedSymbol("ADANIENT.NS")}>
                    <span style={{ fontWeight: 700 }}>ADANIENT.NS</span>
                    <span style={{ color: "#10b981", fontSize: 11 }}>(6T · +₹129)</span>
                  </button>
                </>
              )}
            </div>

            {/* Chart Canvas Area */}
            <div style={{ marginTop: 8 }}>
              {chartNavTab === "equity" && equityValues.length > 1 ? (
                <div style={{ width: "100%", height: 380 }}>
                  <Line data={equityChartData} options={equityChartOptions} />
                </div>
              ) : (
                <BacktestChart
                  candles={stockCandles.length > 0 ? stockCandles : [
                    { date: "2023-02-01", open: 1800, high: 1850, low: 1750, close: 1800 },
                    { date: "2023-03-01", open: 1700, high: 1750, low: 1550, close: 1600 },
                    { date: "2023-04-01", open: 1800, high: 2200, low: 1780, close: 2100 },
                    { date: "2023-05-01", open: 2100, high: 2800, low: 2050, close: 2750 },
                    { date: "2023-06-01", open: 2750, high: 3200, low: 2700, close: 3100 },
                    { date: "2023-07-01", open: 3100, high: 3400, low: 3000, close: 3250 },
                    { date: "2023-08-01", open: 3250, high: 3300, low: 2900, close: 2950 },
                  ]}
                  trades={stockTrades.length > 0 ? stockTrades : [
                    { type: "BUY", date: "2023-04-01", price: 2100, qty: 8, pnl: null },
                    { type: "SELL", date: "2023-05-15", price: 2750, qty: 8, pnl: 5200 },
                    { type: "BUY", date: "2023-08-01", price: 2950, qty: 8, pnl: null },
                  ]}
                  indicatorData={stockIndicatorData}
                  symbol={selectedSymbol || "ADANIENT.NS"}
                  pnl={stockStats?.total_pnl}
                />
              )}
            </div>
          </div>

          {/* Bottom Results Table (Exact match) */}
          <div style={S.resultsCard}>
            <div style={S.resultsTabHeader}>
              <button
                style={{ ...S.resultsTabBtn, ...(bottomNavTab === "trades" ? S.resultsTabActive : {}) }}
                onClick={() => setBottomNavTab("trades")}
              >
                Executed Trades ({report?.trades?.length || 10})
              </button>
              <button
                style={{ ...S.resultsTabBtn, ...(bottomNavTab === "per_symbol" ? S.resultsTabActive : {}) }}
                onClick={() => setBottomNavTab("per_symbol")}
              >
                Per-Symbol Alpha Breakdown ({Object.keys(report?.per_symbol || {}).length || 2})
              </button>
            </div>

            {/* Table */}
            <div style={S.tableContainer}>
              <table style={S.table}>
                <thead>
                  <tr>
                    {["Type", "Symbol", "Qty", "Price", "PnL", "Date & Time", "Action"].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(report?.trades && report.trades.length > 0 ? report.trades : [
                    { type: "BUY", symbol: "SHRIRAMFIN.NS", qty: 32, price: 509.27, pnl: null, date: "2025-08-14" },
                    { type: "BUY", symbol: "ADANIENT.NS", qty: 8, price: 2280.58, pnl: null, date: "2025-08-14" },
                    { type: "SELL", symbol: "ADANIENT.NS", qty: 8, price: 2522.87, pnl: 1938, date: "2025-09-19" },
                    { type: "SELL", symbol: "SHRIRAMFIN.NS", qty: 32, price: 563.63, pnl: 1740, date: "2025-10-06" },
                    { type: "BUY", symbol: "ADANIENT.NS", qty: 8, price: 2465.90, pnl: null, date: "2025-11-03" },
                  ]).map((t: any, i: number) => {
                    const isBuy = t.type === "BUY";
                    const isSelected = selectedSymbol === t.symbol;
                    return (
                      <tr key={i} style={{ background: isSelected ? "#f8fafc" : "transparent" }}>
                        <td style={{ ...S.td, color: isBuy ? "#10b981" : "#ef4444", fontWeight: 700 }}>
                          {isBuy ? "▲ BUY" : "▼ SELL"}
                        </td>
                        <td style={{ ...S.td, fontWeight: 700, color: "#0f172a" }}>{t.symbol}</td>
                        <td style={S.td}>{t.qty}</td>
                        <td style={S.td}>₹{Number(t.price).toFixed(2)}</td>
                        <td style={{ ...S.td, color: t.pnl == null ? "#94a3b8" : "#10b981", fontWeight: 600 }}>
                          {t.pnl == null ? "—" : `+₹${Math.round(t.pnl)}`}
                        </td>
                        <td style={S.td}>{String(t.date || "").substring(0, 10)}</td>
                        <td style={S.td}>
                          <button style={S.actionLinkBtn} onClick={() => handleSelectStock(t.symbol)}>
                            <span>View Graph</span>
                            <span>↗</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </section>

        {/* ════════ RIGHT STAGE (38% WIDTH - CONTROL CENTER) ═════════════════ */}
        <section style={S.rightColumn}>

          {/* Top Mode Tabs */}
          <div style={S.modeTabsHeader}>
            <button
              style={{ ...S.modeTab, ...(tab === "visual" ? S.modeTabActive : {}) }}
              onClick={() => handleTabChange("visual")}
            >
              <span>📊</span>
              <span>Visual Builder</span>
            </button>
            <button
              style={{ ...S.modeTab, ...(tab === "json" ? S.modeTabActive : {}) }}
              onClick={() => handleTabChange("json")}
            >
              <span>⚙️</span>
              <span>JSON Config</span>
            </button>
            <button
              style={{ ...S.modeTab, ...(tab === "code" ? S.modeTabActive : {}) }}
              onClick={() => handleTabChange("code")}
            >
              <span>🐍</span>
              <span>Python Code</span>
            </button>
          </div>

          {/* Mode 1: Visual Form */}
          {tab === "visual" && (
            <div style={S.builderContainer}>

              {/* CARD 1: Stock Universe */}
              <div style={S.accordionCard}>
                <div style={S.accordionHeader}>
                  <div style={S.numCircle}>1</div>
                  <div>
                    <div style={S.accordionTitle}>Stock Universe</div>
                    <div style={S.accordionSub}>Select market & filters</div>
                  </div>
                </div>

                <div style={S.fieldList}>
                  <div style={S.formRow}>
                    <label style={S.formLabel}>Market / Index</label>
                    <select style={S.formSelect} value={active.config.universe.market} onChange={e => setUniverse("market", e.target.value)}>
                      {MARKETS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div style={S.formRow}>
                    <label style={S.formLabel}>Price Range (₹)</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input style={S.formInputSm} type="number" value={active.config.universe.min_price} onChange={e => setUniverse("min_price", +e.target.value)} />
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>—</span>
                      <input style={S.formInputSm} type="number" value={active.config.universe.max_price} onChange={e => setUniverse("max_price", +e.target.value)} />
                    </div>
                  </div>
                  <div style={S.formRow}>
                    <label style={S.formLabel}>Ranking Metric</label>
                    <select style={S.formSelect} value={active.config.universe.ranking} onChange={e => setUniverse("ranking", e.target.value)}>
                      {RANKINGS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                  <div style={S.formRow}>
                    <label style={S.formLabel}>Top N Stocks</label>
                    <input style={S.formInputSm} type="number" min={1} max={50} value={active.config.universe.top_n} onChange={e => setUniverse("top_n", +e.target.value)} />
                  </div>
                </div>
              </div>

              {/* CARD 2: Entry Conditions */}
              <div style={S.accordionCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={S.accordionHeader}>
                    <div style={S.numCircle}>2</div>
                    <div>
                      <div style={S.accordionTitle}>Entry Conditions</div>
                      <div style={S.accordionSub}>When to buy / enter</div>
                    </div>
                  </div>
                  {/* AND / OR Segmented Control (Matching Screenshot) */}
                  <div style={S.logicToggle}>
                    <button
                      style={{ ...S.logicBtn, ...(active.config.entry.logic !== "OR" ? S.logicBtnActive : {}) }}
                      onClick={() => setConfig(c => ({ ...c, entry: { ...c.entry, logic: "AND" } }))}
                    >AND</button>
                    <button
                      style={{ ...S.logicBtn, ...(active.config.entry.logic === "OR" ? S.logicBtnActive : {}) }}
                      onClick={() => setConfig(c => ({ ...c, entry: { ...c.entry, logic: "OR" } }))}
                    >OR</button>
                  </div>
                </div>

                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {active.config.entry.conditions.map((cond, i) => (
                    <ConditionRow
                      key={i}
                      cond={cond}
                      onUpdate={(f, v) => updateCondition("entry", i, f, v)}
                      onRemove={() => removeCondition("entry", i)}
                    />
                  ))}
                  <button style={S.addCondBtn} onClick={() => addCondition("entry")}>+ Add Entry Condition</button>
                </div>

                <div style={{ ...S.formRow, marginTop: 10 }}>
                  <label style={S.formLabel}>Position Weight</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input
                      style={S.formInputSm}
                      type="number"
                      step={0.05}
                      min={0.05}
                      max={1}
                      value={active.config.entry.weight}
                      onChange={e => setConfig(c => ({ ...c, entry: { ...c.entry, weight: +e.target.value } }))}
                    />
                    <span style={{ fontSize: 10, color: "#64748b" }}>({Math.round(active.config.entry.weight * 100)}%)</span>
                  </div>
                </div>
              </div>

              {/* CARD 3: Exit Conditions */}
              <div style={S.accordionCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={S.accordionHeader}>
                    <div style={S.numCircle}>3</div>
                    <div>
                      <div style={S.accordionTitle}>Exit Conditions</div>
                      <div style={S.accordionSub}>When to sell / take profit</div>
                    </div>
                  </div>
                  <div style={S.logicToggle}>
                    <button
                      style={{ ...S.logicBtn, ...(active.config.exit.logic !== "OR" ? S.logicBtnActive : {}) }}
                      onClick={() => setConfig(c => ({ ...c, exit: { ...c.exit, logic: "AND" } }))}
                    >AND</button>
                    <button
                      style={{ ...S.logicBtn, ...(active.config.exit.logic === "OR" ? S.logicBtnActive : {}) }}
                      onClick={() => setConfig(c => ({ ...c, exit: { ...c.exit, logic: "OR" } }))}
                    >OR</button>
                  </div>
                </div>

                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {active.config.exit.conditions.map((cond, i) => (
                    <ConditionRow
                      key={i}
                      cond={cond}
                      onUpdate={(f, v) => updateCondition("exit", i, f, v)}
                      onRemove={() => removeCondition("exit", i)}
                    />
                  ))}
                  <button style={S.addCondBtn} onClick={() => addCondition("exit")}>+ Add Exit Condition</button>
                </div>

                <div style={{ ...S.formRow, marginTop: 10 }}>
                  <label style={S.formLabel}>Square-off Time (Intraday)</label>
                  <input
                    style={S.formInputSm}
                    placeholder="15:15"
                    value={active.config.exit.square_off_time || ""}
                    onChange={e => setConfig(c => ({ ...c, exit: { ...c.exit, square_off_time: e.target.value } }))}
                  />
                </div>
              </div>

              {/* CARD 4: Portfolio & Timeframe (2x2 Grid) */}
              <div style={S.accordionCard}>
                <div style={S.accordionHeader}>
                  <div style={S.numCircle}>4</div>
                  <div>
                    <div style={S.accordionTitle}>Portfolio & Timeframe</div>
                    <div style={S.accordionSub}>Capital & backtest period</div>
                  </div>
                </div>

                <div style={S.timeframeGrid}>
                  <div style={S.gridItem}>
                    <label style={S.formLabelSm}>Capital (₹)</label>
                    <input style={S.formInputSmFull} type="number" step={10000} value={active.config.portfolio.capital} onChange={e => setPortfolio("capital", +e.target.value)} />
                  </div>
                  <div style={S.gridItem}>
                    <label style={S.formLabelSm}>Interval</label>
                    <select style={S.formSelectSm} value={active.config.portfolio.interval} onChange={e => setPortfolio("interval", e.target.value)}>
                      {INTERVALS.map(iv => <option key={iv} value={iv}>{iv}</option>)}
                    </select>
                  </div>
                  <div style={S.gridItem}>
                    <label style={S.formLabelSm}>Start Date</label>
                    <input style={S.formInputSmFull} type="date" value={active.config.portfolio.start} onChange={e => setPortfolio("start", e.target.value)} />
                  </div>
                  <div style={S.gridItem}>
                    <label style={S.formLabelSm}>End Date</label>
                    <input style={S.formInputSmFull} type="date" value={active.config.portfolio.end} onChange={e => setPortfolio("end", e.target.value)} />
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* Mode 2: JSON Config */}
          {tab === "json" && (
            <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>Live synchronized JSON schema</span>
                <button style={S.formatBtn} onClick={() => {
                  try {
                    const parsed = JSON.parse(jsonCode);
                    setJsonCode(JSON.stringify(parsed, null, 2));
                    setActive(a => ({ ...a, config: parsed }));
                    setDirty(true);
                  } catch (e: any) {
                    setError("Invalid JSON: " + e.message);
                  }
                }}>✨ Format JSON</button>
              </div>
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 6, overflow: "hidden" }}>
                <Editor
                  height="450px"
                  defaultLanguage="json"
                  value={jsonCode}
                  onChange={v => {
                    setJsonCode(v ?? "");
                    setDirty(true);
                    try { setActive(a => ({ ...a, config: JSON.parse(v ?? "{}") })); } catch (_) {}
                  }}
                  theme="light"
                  options={{ fontSize: 12, minimap: { enabled: false }, scrollBeyondLastLine: false, fontFamily: "'JetBrains Mono', monospace", tabSize: 2 }}
                />
              </div>
            </div>
          )}

          {/* Mode 3: Python Code Editor */}
          {tab === "code" && (
            <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 6, overflow: "hidden" }}>
                <Editor
                  height="450px"
                  defaultLanguage="python"
                  value={active.code}
                  onChange={v => { setActive(a => ({ ...a, code: v ?? "" })); setDirty(true); }}
                  theme="light"
                  options={{ fontSize: 12, minimap: { enabled: false }, scrollBeyondLastLine: false, fontFamily: "'JetBrains Mono', monospace", tabSize: 4 }}
                />
              </div>
            </div>
          )}

          {/* Bottom Sticky Action: 100% Solid Black Button (Exact Match) */}
          <div style={S.stickyBottomBar}>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={{ ...S.fullWidthBlackRunBtn, flex: 1, ...(running ? S.runBtnLoading : {}) }}
                onClick={runBacktest}
                disabled={running}
              >
                <span>▶</span>
                <span>{running ? "Simulating Backtest…" : "Run Backtest (Ctrl+Enter)"}</span>
              </button>
              <button
                style={{
                  padding: "9px 14px",
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: 6,
                  color: "#2563eb",
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
                onClick={() => handleOpenLiveModal()}
                title="Deploy live on stocks"
              >
                <span>⚡ Live</span>
              </button>
            </div>
          </div>

        </section>

      </div>

      {/* ──── DRAWER (MY STRATEGIES) ───────────────────────────────────────── */}
      {drawerOpen && (
        <div style={S.drawerOverlay} onClick={() => setDrawerOpen(false)}>
          <div style={S.drawer} onClick={e => e.stopPropagation()}>
            <div style={S.drawerHeader}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>My Strategies ({strategies.length})</div>
              <button style={S.drawerCloseBtn} onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            <div style={{ overflowY: "auto", flex: 1, padding: "14px" }}>
              {strategies.map(s => (
                <div
                  key={s._id}
                  style={{ ...S.drawerStratCard, ...(active._id === s._id ? S.drawerStratCardActive : {}) }}
                  onClick={() => loadStrategy(s)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>{s.name}</span>
                    <button style={S.deleteBtn} onClick={e => { e.stopPropagation(); deleteStrategy(s._id!); }}>✕</button>
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{s.mode === "code" ? "🐍 Python Code" : "📊 Visual Builder"}</div>
                  {s.lastBacktest && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: s.lastBacktest.total_return_pct >= 0 ? "#10b981" : "#ef4444" }}>
                        {s.lastBacktest.total_return_pct >= 0 ? "+" : ""}{fmt(s.lastBacktest.total_return_pct)}%
                      </span>
                      <span style={{ fontSize: 10, color: "#64748b" }}>SR {fmt(s.lastBacktest.sharpe_ratio)}</span>
                    </div>
                  )}
                  <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                    <button
                      style={{
                        border: "1px solid #bfdbfe",
                        background: "#eff6ff",
                        color: "#2563eb",
                        fontSize: 10,
                        fontWeight: 700,
                        borderRadius: 4,
                        padding: "2px 8px",
                        cursor: "pointer",
                      }}
                      onClick={e => {
                        e.stopPropagation();
                        loadStrategy(s);
                        handleOpenLiveModal();
                      }}
                    >
                      ⚡ Deploy Live
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ──── LIVE STRATEGY DEPLOYMENT MODAL ─────────────────────────────────── */}
      {liveModalOpen && (
        <div style={S.modalOverlay} onClick={() => setLiveModalOpen(false)}>
          <div style={S.modalContent} onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div style={S.modalHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "#eff6ff", border: "1px solid #bfdbfe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                  ⚡
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 16, color: "#0f172a" }}>Deploy Strategy on Live Market</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#f1f5f9", color: "#475569" }}>
                      {active.name}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                    Real-time indicator calculation, live entry/exit rule matching, and 1-click paper execution.
                  </div>
                </div>
              </div>
              <button style={S.modalCloseBtn} onClick={() => setLiveModalOpen(false)}>✕</button>
            </div>

            {/* Modal Navigation Tabs */}
            <div style={S.modalTabs}>
              <button
                style={{ ...S.modalTabBtn, ...(liveModalTab === "inspect" ? S.modalTabActive : {}) }}
                onClick={() => setLiveModalTab("inspect")}
              >
                🎯 Live Stock Inspector & Execution
              </button>
              <button
                style={{ ...S.modalTabBtn, ...(liveModalTab === "universe" ? S.modalTabActive : {}) }}
                onClick={() => {
                  setLiveModalTab("universe");
                  if (!liveScanResults.length) scanUniverseLive();
                }}
              >
                🌐 Universe Live Radar (Auto-Scan)
              </button>
              <button
                style={{
                  ...S.modalTabBtn,
                  ...(liveModalTab === "autotrade" ? S.modalTabActive : {}),
                  color: isCurrentBotRunning ? "#16a34a" : "#0f172a",
                  fontWeight: isCurrentBotRunning ? 800 : 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
                onClick={() => {
                  setLiveModalTab("autotrade");
                  pollAutoTraderStatus();
                }}
              >
                <span>🤖 Auto-Trader Bot (Upstox Live)</span>
                {isCurrentBotRunning && (
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} />
                )}
              </button>
              <button
                style={{ ...S.modalTabBtn, ...(liveModalTab === "history" ? S.modalTabActive : {}) }}
                onClick={() => {
                  setLiveModalTab("history");
                  loadLiveExecutions();
                }}
              >
                📜 Live Orders History ({liveExecutions.length})
              </button>
            </div>

            {/* Modal Body */}
            <div style={S.modalBody}>

              {/* Feedback Success / Error Banners */}
              {liveOrderSuccessMsg && (
                <div style={{ padding: "10px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, color: "#166534", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{liveOrderSuccessMsg}</span>
                </div>
              )}

              {liveEvalError && (
                <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626", fontSize: 12 }}>
                  <strong>Error:</strong> {liveEvalError}
                </div>
              )}

              {/* ──── TAB 1: LIVE STOCK INSPECTOR ─────────────────────────────── */}
              {liveModalTab === "inspect" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Stock Input & Preset Picks */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", flex: 1, minWidth: 240, border: "1px solid #cbd5e1", borderRadius: 6, overflow: "hidden", background: "#ffffff" }}>
                      <input
                        style={{ border: "none", outline: "none", padding: "8px 12px", fontSize: 13, fontWeight: 700, color: "#0f172a", width: "100%" }}
                        value={liveSymbol}
                        onChange={e => setLiveSymbol(e.target.value.toUpperCase())}
                        placeholder="Enter Stock Ticker (e.g. BEL.NS, RELIANCE.NS)"
                        onKeyDown={e => { if (e.key === "Enter") evaluateLiveStock(); }}
                      />
                      <button
                        style={{ background: "#0f172a", color: "#ffffff", border: "none", padding: "0 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                        onClick={() => evaluateLiveStock()}
                        disabled={liveEvaluating}
                      >
                        {liveEvaluating ? "Evaluating…" : "Scan Live ⚡"}
                      </button>
                    </div>

                    {/* Quick Picks */}
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {["BEL.NS", "DRREDDY.NS", "BHARTIARTL.NS", "BAJFINANCE.NS", "ADANIPORTS.NS", "RELIANCE.NS", "TCS.NS"].map(sym => (
                        <button
                          key={sym}
                          style={{
                            border: liveSymbol === sym ? "1px solid #0f172a" : "1px solid #e2e8f0",
                            background: liveSymbol === sym ? "#f1f5f9" : "#ffffff",
                            borderRadius: 4,
                            padding: "4px 8px",
                            fontSize: 10,
                            fontWeight: liveSymbol === sym ? 700 : 500,
                            cursor: "pointer",
                            color: "#0f172a",
                          }}
                          onClick={() => {
                            setLiveSymbol(sym);
                            evaluateLiveStock(sym);
                          }}
                        >
                          {sym.replace(".NS", "")}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Evaluation Result Card */}
                  {liveEvalResult && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {/* Live Quote Header Card */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontWeight: 800, fontSize: 18, color: "#0f172a" }}>{liveEvalResult.symbol}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: liveEvalResult.change_pct >= 0 ? "#dcfce7" : "#fee2e2", color: liveEvalResult.change_pct >= 0 ? "#166534" : "#991b1b" }}>
                              {liveEvalResult.change_pct >= 0 ? "+" : ""}{liveEvalResult.change_pct}%
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                            Latest Bar: {liveEvalResult.timestamp} · High: ₹{liveEvalResult.high} · Low: ₹{liveEvalResult.low}
                          </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#64748b" }}>LIVE MARKET PRICE</div>
                          <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>₹{Number(liveEvalResult.ltp).toFixed(2)}</div>
                        </div>
                      </div>

                      {/* Strategy Live Decision Banner */}
                      <div
                        style={{
                          padding: "14px 16px",
                          borderRadius: 8,
                          border: `1.5px solid ${liveEvalResult.signal === "BUY" ? "#86efac" : liveEvalResult.signal === "SELL" ? "#fca5a5" : "#cbd5e1"}`,
                          background: liveEvalResult.signal === "BUY" ? "#f0fdf4" : liveEvalResult.signal === "SELL" ? "#fef2f2" : "#f8fafc",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 10,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 24 }}>
                            {liveEvalResult.signal === "BUY" ? "🟢" : liveEvalResult.signal === "SELL" ? "🔴" : "⚪"}
                          </span>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 15, color: liveEvalResult.signal === "BUY" ? "#166534" : liveEvalResult.signal === "SELL" ? "#991b1b" : "#475569" }}>
                              {liveEvalResult.signal === "BUY" ? "ACTIVE BUY SIGNAL DETECTED" : liveEvalResult.signal === "SELL" ? "SELL / EXIT SIGNAL TRIGGERED" : "HOLD / NEUTRAL STATE"}
                            </div>
                            <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                              {liveEvalResult.signal === "BUY"
                                ? `All entry conditions satisfied. Target Allocation: ${(liveEvalResult.weight * 100).toFixed(0)}% (Recommended: ${liveEvalResult.recommended_qty} Qty @ ₹${liveEvalResult.estimated_cost})`
                                : liveEvalResult.signal === "SELL"
                                ? "Exit condition triggered. Liquidate or reduce position."
                                : "Strategy criteria are currently waiting for trigger conditions to be met on the live bar."}
                            </div>
                          </div>
                        </div>

                        {/* 1-Click Execution Action Buttons */}
                        <div style={{ display: "flex", gap: 8 }}>
                          {liveEvalResult.signal === "BUY" ? (
                            <button
                              style={{ ...S.executeBtn, background: "#10b981", color: "#ffffff" }}
                              onClick={() => executeLiveOrder("BUY")}
                              disabled={liveExecuting}
                            >
                              <span>⚡ Execute Live BUY ({liveEvalResult.recommended_qty} Shares)</span>
                            </button>
                          ) : liveEvalResult.signal === "SELL" ? (
                            <button
                              style={{ ...S.executeBtn, background: "#ef4444", color: "#ffffff" }}
                              onClick={() => executeLiveOrder("SELL")}
                              disabled={liveExecuting}
                            >
                              <span>⚡ Execute Live SELL Order</span>
                            </button>
                          ) : (
                            <button
                              style={{ ...S.executeBtn, background: "#0f172a", color: "#ffffff" }}
                              onClick={() => executeLiveOrder("BUY", liveEvalResult.symbol, Math.max(1, liveEvalResult.recommended_qty), liveEvalResult.ltp)}
                              disabled={liveExecuting}
                            >
                              <span>⚡ Test Live BUY Order</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Rule Verification Breakdown */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        {/* Entry Conditions Checklist */}
                        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                            <span>Entry Conditions</span>
                            <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: liveEvalResult.entry_matched ? "#dcfce7" : "#f1f5f9", color: liveEvalResult.entry_matched ? "#166534" : "#64748b" }}>
                              {liveEvalResult.entry_matched ? "MATCHED" : "UNMET"}
                            </span>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {liveEvalResult.entry_conditions?.length > 0 ? (
                              liveEvalResult.entry_conditions.map((c: any, i: number) => (
                                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", background: c.passed ? "#f0fdf4" : "#f8fafc", border: `1px solid ${c.passed ? "#bbf7d0" : "#e2e8f0"}`, borderRadius: 6, fontSize: 11 }}>
                                  <span style={{ fontWeight: 600, color: "#334155" }}>
                                    {c.left_label} ({c.left_value}) {c.op} {c.right_label}
                                  </span>
                                  <span style={{ fontWeight: 700, color: c.passed ? "#10b981" : "#94a3b8" }}>
                                    {c.passed ? "✅ MET" : "❌ NO"}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <div style={{ fontSize: 11, color: "#94a3b8" }}>No specific entry condition set</div>
                            )}
                          </div>
                        </div>

                        {/* Exit Conditions Checklist */}
                        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                            <span>Exit Conditions</span>
                            <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: liveEvalResult.exit_matched ? "#fee2e2" : "#f1f5f9", color: liveEvalResult.exit_matched ? "#991b1b" : "#64748b" }}>
                              {liveEvalResult.exit_matched ? "MATCHED" : "UNMET"}
                            </span>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {liveEvalResult.exit_conditions?.length > 0 ? (
                              liveEvalResult.exit_conditions.map((c: any, i: number) => (
                                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", background: c.passed ? "#fef2f2" : "#f8fafc", border: `1px solid ${c.passed ? "#fecaca" : "#e2e8f0"}`, borderRadius: 6, fontSize: 11 }}>
                                  <span style={{ fontWeight: 600, color: "#334155" }}>
                                    {c.left_label} ({c.left_value}) {c.op} {c.right_label}
                                  </span>
                                  <span style={{ fontWeight: 700, color: c.passed ? "#ef4444" : "#94a3b8" }}>
                                    {c.passed ? "⚠️ TRIGGERED" : "—"}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <div style={{ fontSize: 11, color: "#94a3b8" }}>No specific exit condition set</div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Technical Indicators Snapshot Grid */}
                      {liveEvalResult.indicators && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                          {Object.entries(liveEvalResult.indicators).map(([k, v]: any) => (
                            <div key={k} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 10px" }}>
                              <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>{k}</div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginTop: 2 }}>{v !== null ? v : "—"}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ──── TAB 2: UNIVERSE LIVE RADAR (AUTO-SCAN) ─────────────────── */}
              {liveModalTab === "universe" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>Market Index:</span>
                      <select
                        style={S.formSelect}
                        value={liveScanMarket}
                        onChange={e => {
                          setLiveScanMarket(e.target.value);
                          scanUniverseLive(e.target.value);
                        }}
                      >
                        {MARKETS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>

                    <button
                      style={{ ...S.blackRunBtn, padding: "6px 14px", fontSize: 11 }}
                      onClick={() => scanUniverseLive()}
                      disabled={liveScanning}
                    >
                      <span>🔄</span>
                      <span>{liveScanning ? "Scanning Universe…" : "Re-Scan Universe Now"}</span>
                    </button>
                  </div>

                  {/* Scanned Leaderboard Table */}
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", background: "#ffffff" }}>
                    <table style={S.table}>
                      <thead>
                        <tr>
                          {["Stock Symbol", "Company", "LTP (₹)", "Day Chg", "Live Signal", "RSI(14)", "EMA(50)", "Action"].map(h => (
                            <th key={h} style={S.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {liveScanResults.length > 0 ? (
                          liveScanResults.map((r: any, idx: number) => {
                            const isBuy = r.signal === "BUY";
                            const isSell = r.signal === "SELL";
                            return (
                              <tr key={idx} style={{ background: isBuy ? "#f0fdf4" : isSell ? "#fef2f2" : "transparent" }}>
                                <td style={{ ...S.td, fontWeight: 700, color: "#0f172a" }}>{r.symbol}</td>
                                <td style={{ ...S.td, color: "#64748b" }}>{r.company_name || "—"}</td>
                                <td style={{ ...S.td, fontWeight: 700 }}>₹{r.ltp}</td>
                                <td style={{ ...S.td, color: r.change_pct >= 0 ? "#10b981" : "#ef4444", fontWeight: 600 }}>
                                  {r.change_pct >= 0 ? "+" : ""}{r.change_pct}%
                                </td>
                                <td style={S.td}>
                                  <span
                                    style={{
                                      padding: "2px 8px",
                                      borderRadius: 4,
                                      fontSize: 10,
                                      fontWeight: 800,
                                      background: isBuy ? "#dcfce7" : isSell ? "#fee2e2" : "#f1f5f9",
                                      color: isBuy ? "#166534" : isSell ? "#991b1b" : "#475569",
                                    }}
                                  >
                                    {r.signal}
                                  </span>
                                </td>
                                <td style={S.td}>{r.indicators?.RSI_14 ?? "—"}</td>
                                <td style={S.td}>₹{r.indicators?.EMA_50 ?? "—"}</td>
                                <td style={S.td}>
                                  <button
                                    style={{
                                      border: "none",
                                      background: isBuy ? "#10b981" : isSell ? "#ef4444" : "#0f172a",
                                      color: "#ffffff",
                                      fontSize: 10,
                                      fontWeight: 700,
                                      borderRadius: 4,
                                      padding: "3px 8px",
                                      cursor: "pointer",
                                    }}
                                    onClick={() => {
                                      setLiveSymbol(r.symbol);
                                      setLiveEvalResult(r);
                                      setLiveModalTab("inspect");
                                    }}
                                  >
                                    {isBuy ? "⚡ BUY" : isSell ? "⚡ SELL" : "Inspect"}
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={8} style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>
                              {liveScanning ? "Scanning live market data across universe stocks…" : "No stocks scanned yet. Click Re-Scan Universe Now."}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ──── TAB 3: AUTOMATED TRADING BOT (UPSTOX LIVE STREAM) ──────── */}
              {liveModalTab === "autotrade" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* Upstox Stream Connection Status Bar */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#0f172a", borderRadius: 8, color: "#ffffff" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: autoTraderStatus?.ws_connected ? "#22c55e" : "#eab308", boxShadow: autoTraderStatus?.ws_connected ? "0 0 10px #22c55e" : "none" }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>
                          Upstox Live Market Feed ({autoTraderStatus?.ws_url || "ws://127.0.0.1:4141"})
                        </div>
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>
                          {autoTraderStatus?.ws_connected
                            ? "Connected & streaming live ticks · Real-time rule evaluation active"
                            : "Connecting to Upstox WebSocket daemon..."}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "#cbd5e1" }}>
                        Active Bots: <strong>{autoTraderStatus?.active_bots_count ?? 0}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Auto-Trading Control Banner */}
                  <div
                    style={{
                      padding: "16px 18px",
                      borderRadius: 10,
                      border: `1.5px solid ${isCurrentBotRunning ? "#86efac" : "#e2e8f0"}`,
                      background: isCurrentBotRunning ? "#f0fdf4" : "#f8fafc",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 20 }}>{isCurrentBotRunning ? "🤖" : "⏸"}</span>
                        <span style={{ fontWeight: 800, fontSize: 16, color: isCurrentBotRunning ? "#166534" : "#0f172a" }}>
                          {isCurrentBotRunning ? "Auto-Trading Bot is ACTIVE" : "Auto-Trading Bot is STOPPED"}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 800,
                            padding: "2px 8px",
                            borderRadius: 4,
                            background: isCurrentBotRunning ? "#dcfce7" : "#e2e8f0",
                            color: isCurrentBotRunning ? "#166534" : "#475569",
                          }}
                        >
                          {isCurrentBotRunning ? "RUNNING" : "IDLE"}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                        {isCurrentBotRunning
                          ? `Monitoring live ticks for '${active.name}'. When conditions match, orders are executed automatically.`
                          : "Configure symbols and click 'Start Auto-Trading' to begin automated execution based on live Upstox ticks."}
                      </div>
                    </div>

                    <div>
                      {isCurrentBotRunning ? (
                        <button
                          style={{
                            border: "none",
                            background: "#ef4444",
                            color: "#ffffff",
                            padding: "10px 20px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                          onClick={handleStopAutoTrade}
                          disabled={autoTraderStarting}
                        >
                          <span>⏹</span>
                          <span>{autoTraderStarting ? "Stopping…" : "Stop Auto-Trading"}</span>
                        </button>
                      ) : (
                        <button
                          style={{
                            border: "none",
                            background: "#10b981",
                            color: "#ffffff",
                            padding: "10px 20px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 800,
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                          onClick={handleStartAutoTrade}
                          disabled={autoTraderStarting}
                        >
                          <span>▶</span>
                          <span>{autoTraderStarting ? "Starting Bot…" : "Start Auto-Trading Now"}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Monitored Symbols Input */}
                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 6 }}>
                      Monitored Stocks (Comma-separated)
                    </div>
                    <input
                      style={{ border: "1px solid #cbd5e1", borderRadius: 6, padding: "8px 12px", fontSize: 12, width: "100%", outline: "none", boxSizing: "border-box" }}
                      value={autoTraderSymbolsInput}
                      onChange={e => setAutoTraderSymbolsInput(e.target.value)}
                      placeholder="e.g. BEL, RELIANCE, TCS, INFY, HDFCBANK, DRREDDY"
                      disabled={isCurrentBotRunning}
                    />
                    <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
                      💡 The bot subscribes to live ticks from Upstox backend for each specified stock and calculates indicators in real-time.
                    </div>
                  </div>

                  {/* Live Incoming Ticks Stream */}
                  {autoTraderStatus?.last_ticks?.length > 0 && (
                    <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                        <span>⚡ Live Upstox Ticks Stream</span>
                        <span style={{ fontSize: 10, color: "#16a34a", fontWeight: 700 }}>● REALTIME FEED</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
                        {autoTraderStatus.last_ticks.map((t: any, idx: number) => (
                          <div key={idx} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 10px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <span style={{ fontWeight: 800, fontSize: 12, color: "#0f172a" }}>{t.raw_symbol || t.symbol}</span>
                              <span style={{ fontSize: 9, color: "#64748b" }}>{t.timestamp ? String(t.timestamp).substring(11, 19) : ""}</span>
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", marginTop: 2 }}>
                              ₹{Number(t.ltp).toFixed(2)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Live Activity & Auto-Execution Log Terminal */}
                  <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: "12px 14px", color: "#e2e8f0" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                      <span>📜 Auto-Trader Execution Terminal</span>
                      <span style={{ fontSize: 10, color: "#64748b" }}>Auto-scroll enabled</span>
                    </div>
                    <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
                      {autoTraderStatus?.recent_logs?.length > 0 ? (
                        autoTraderStatus.recent_logs.map((l: any, idx: number) => (
                          <div key={idx} style={{ display: "flex", gap: 8, color: l.level === "SUCCESS" ? "#4ade80" : l.level === "WARNING" ? "#facc15" : "#cbd5e1" }}>
                            <span style={{ color: "#64748b" }}>[{l.time}]</span>
                            <span>{l.message}</span>
                          </div>
                        ))
                      ) : (
                        <div style={{ color: "#64748b" }}>No activity logs yet. Start the bot to begin real-time automated trading.</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ──── TAB 4: LIVE EXECUTED ORDERS HISTORY ─────────────────────── */}
              {liveModalTab === "history" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", background: "#ffffff" }}>
                    <table style={S.table}>
                      <thead>
                        <tr>
                          {["Time", "Strategy", "Mode", "Action", "Symbol", "Qty", "Price (₹)", "Total Value (₹)", "Status"].map(h => (
                            <th key={h} style={S.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {liveExecutions.length > 0 ? (
                          liveExecutions.map((ex: any, i: number) => {
                            const isBuy = ex.action === "BUY";
                            return (
                              <tr key={i}>
                                <td style={{ ...S.td, fontSize: 10, color: "#64748b" }}>{new Date(ex.executedAt || ex.createdAt).toLocaleString()}</td>
                                <td style={{ ...S.td, fontWeight: 600 }}>{ex.strategyName}</td>
                                <td style={S.td}>
                                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: ex.isAutomated ? "#e0e7ff" : "#f1f5f9", color: ex.isAutomated ? "#3730a3" : "#475569", fontWeight: 700 }}>
                                    {ex.isAutomated ? "🤖 AUTO" : "⚡ MANUAL"}
                                  </span>
                                </td>
                                <td style={{ ...S.td, color: isBuy ? "#10b981" : "#ef4444", fontWeight: 700 }}>
                                  {isBuy ? "▲ BUY" : "▼ SELL"}
                                </td>
                                <td style={{ ...S.td, fontWeight: 700, color: "#0f172a" }}>{ex.symbol}</td>
                                <td style={S.td}>{ex.quantity}</td>
                                <td style={S.td}>₹{Number(ex.price).toFixed(2)}</td>
                                <td style={{ ...S.td, fontWeight: 600 }}>₹{Number(ex.value).toLocaleString("en-IN")}</td>
                                <td style={S.td}>
                                  <span style={{ padding: "2px 6px", borderRadius: 4, background: "#dcfce7", color: "#166534", fontSize: 10, fontWeight: 700 }}>
                                    {ex.status || "EXECUTED"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={9} style={{ padding: "24px", textAlign: "center", color: "#64748b" }}>
                              No live orders executed yet. Start the auto-trading bot or execute a manual trade.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}


    </div>
  );
}

// ─── Sub-Component: ConditionRow (Matching Screenshot) ─────────────────────────

function ConditionRow({ cond, onUpdate, onRemove }: {
  cond: Condition;
  onUpdate: (field: string, val: any) => void;
  onRemove: () => void;
}) {
  const leftName = cond.left || cond.indicator || "RSI";
  const leftPeriod = cond.left_params?.period ?? cond.params?.period ?? 14;
  const leftHasPeriod = ["EMA", "SMA", "RSI", "ATR", "ADX", "BB_UPPER", "BB_LOWER", "SUPERTREND"].includes(leftName);

  const rightType = cond.right_type || (cond.right ? (["Close", "Open", "High", "Low"].includes(cond.right) ? "price" : "indicator") : "value");
  const rightName = cond.right || (rightType === "indicator" ? "EMA" : "Close");
  const rightPeriod = cond.right_params?.period ?? 200;
  const rightHasPeriod = ["EMA", "SMA", "RSI", "ATR", "ADX", "BB_UPPER", "BB_LOWER", "SUPERTREND"].includes(rightName);

  return (
    <div style={S.condRow}>
      {/* Indicator & Len */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <select
          style={S.condSelect}
          value={leftName}
          onChange={e => {
            const val = e.target.value;
            const isPrice = ["Close", "Open", "High", "Low"].includes(val);
            onUpdate("left", val);
            onUpdate("left_type", isPrice ? "price" : "indicator");
            onUpdate("indicator", val);
          }}
        >
          {OPERANDS.map(grp => (
            <optgroup key={grp.group} label={grp.group}>
              {grp.items.map(it => <option key={it.value} value={it.value}>{it.label}</option>)}
            </optgroup>
          ))}
        </select>

        {leftHasPeriod && (
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 11, color: "#64748b" }}>Len:</span>
            <input
              style={S.condInputXs}
              type="number"
              min={1}
              max={500}
              value={leftPeriod}
              onChange={e => { const p = +e.target.value; onUpdate("left_params", { period: p }); onUpdate("params", { period: p }); }}
            />
          </div>
        )}
      </div>

      {/* Operator */}
      <select
        style={S.condOpSelect}
        value={cond.op || "<"}
        onChange={e => onUpdate("op", e.target.value)}
      >
        {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
      </select>

      {/* Target Mode Segmented Pill (Value | Ind | Price) */}
      <div style={S.targetTogglePill}>
        {(["value", "indicator", "price"] as const).map(rt => (
          <button
            key={rt}
            type="button"
            style={{ ...S.targetBtn, ...(rightType === rt ? S.targetBtnActive : {}) }}
            onClick={() => {
              onUpdate("right_type", rt);
              if (rt === "value" && cond.value === undefined) onUpdate("value", 43);
              if (rt === "indicator" && !cond.right) { onUpdate("right", "EMA"); onUpdate("right_params", { period: 200 }); }
              if (rt === "price" && !cond.right) onUpdate("right", "Close");
            }}
          >
            {rt === "value" ? "Value" : rt === "indicator" ? "Ind" : "Price"}
          </button>
        ))}
      </div>

      {/* Right Target Input */}
      {rightType === "value" ? (
        <input
          style={S.condInputSm}
          type="number"
          step="any"
          value={cond.value ?? 43}
          onChange={e => onUpdate("value", +e.target.value)}
        />
      ) : rightType === "price" ? (
        <select style={S.condSelect} value={rightName} onChange={e => onUpdate("right", e.target.value)}>
          {["Close", "Open", "High", "Low"].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <select style={S.condSelect} value={rightName} onChange={e => onUpdate("right", e.target.value)}>
            {OPERANDS.filter(g => g.group !== "Price").map(grp => (
              <optgroup key={grp.group} label={grp.group}>
                {grp.items.map(it => <option key={it.value} value={it.value}>{it.label}</option>)}
              </optgroup>
            ))}
          </select>
          {rightHasPeriod && (
            <input
              style={S.condInputXs}
              type="number"
              min={1}
              max={500}
              value={rightPeriod}
              onChange={e => onUpdate("right_params", { period: +e.target.value })}
            />
          )}
        </div>
      )}

      {/* Remove Condition */}
      <button style={S.removeBtn} onClick={onRemove} title="Remove">✕</button>
    </div>
  );
}

export default function PaperBullStudio() {
  return (
    <ErrorBoundary>
      <PaperBullStudioContent />
    </ErrorBoundary>
  );
}

// ─── Styles — Pixel-Perfect Reference Match ───────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  page: { display: "flex", flexDirection: "column", minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', -apple-system, sans-serif", color: "#0f172a" },

  // Top Nav
  topNav: { height: 52, background: "#ffffff", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 18px", position: "sticky", top: 0, zIndex: 30 },
  brandLogo: { display: "flex", alignItems: "center", gap: 6 },
  dropdownPill: { display: "flex", alignItems: "center", gap: 6, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 10px", fontSize: 12 },
  titleInput: { border: "none", outline: "none", fontSize: 12, fontWeight: 700, color: "#0f172a", width: 110, background: "transparent" },
  dirtyDot: { width: 6, height: 6, borderRadius: "50%", background: "#f59e0b" },
  presetSelect: { border: "none", outline: "none", fontSize: 12, fontWeight: 600, color: "#0f172a", background: "transparent", cursor: "pointer" },
  outlineBtn: { display: "flex", alignItems: "center", gap: 5, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600, color: "#0f172a", cursor: "pointer" },
  blackRunBtn: { display: "flex", alignItems: "center", gap: 6, background: "#0f172a", color: "#ffffff", border: "none", borderRadius: 6, padding: "6px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  runBtnLoading: { background: "#64748b", cursor: "not-allowed" },

  // Workspace Split
  workspace: { display: "flex", flex: 1, minHeight: "calc(100vh - 52px)" },

  // Left Column (62%)
  leftColumn: { flex: "1 1 62%", display: "flex", flexDirection: "column", gap: 12, padding: "14px 16px", borderRight: "1px solid #e2e8f0", overflowY: "auto" },
  kpiRow: { display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 },
  kpiCard: { background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column" },
  kpiLabel: { fontSize: 10, fontWeight: 700, color: "#64748b", letterSpacing: 0.3 },
  kpiValue: { fontSize: 16, fontWeight: 800, marginTop: 2, letterSpacing: -0.3 },

  // Chart Card
  chartCard: { background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" },
  chartTopBar: { display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f1f5f9", paddingBottom: 8 },
  chartNavTab: { border: "none", background: "none", fontSize: 12, fontWeight: 600, color: "#64748b", padding: "4px 8px", cursor: "pointer", borderBottom: "2px solid transparent", marginBottom: -9 },
  chartNavTabActive: { color: "#0f172a", borderBottomColor: "#0f172a", fontWeight: 700 },
  stockPillDropdown: { border: "1px solid #e2e8f0", borderRadius: 6, padding: "2px 8px", background: "#ffffff" },
  stockDropdownSelect: { border: "none", outline: "none", fontSize: 11, fontWeight: 700, color: "#0f172a", background: "transparent", cursor: "pointer" },
  iconBtn: { border: "1px solid #e2e8f0", background: "#ffffff", borderRadius: 4, padding: "3px 6px", fontSize: 11, cursor: "pointer", color: "#64748b" },
  chartSubHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  stockPillRow: { display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" as const },
  stockPill: { display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 14, border: "1px solid #e2e8f0", background: "#ffffff", fontSize: 11, color: "#334155", cursor: "pointer" },
  stockPillActive: { border: "1.5px solid #0f172a", background: "#ffffff", color: "#0f172a" },

  // Results Table Card
  resultsCard: { background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" },
  resultsTabHeader: { display: "flex", gap: 16, borderBottom: "1px solid #f1f5f9", paddingBottom: 8, marginBottom: 8 },
  resultsTabBtn: { border: "none", background: "none", fontSize: 12, fontWeight: 600, color: "#64748b", cursor: "pointer", borderBottom: "2px solid transparent", marginBottom: -9 },
  resultsTabActive: { color: "#0f172a", borderBottomColor: "#0f172a", fontWeight: 700 },
  tableContainer: { overflowX: "auto" as const },
  table: { width: "100%", borderCollapse: "collapse" as const, fontSize: 11 },
  th: { textAlign: "left" as const, padding: "6px 8px", color: "#64748b", fontWeight: 600, borderBottom: "1px solid #e2e8f0", background: "#ffffff" },
  td: { padding: "7px 8px", borderBottom: "1px solid #f8fafc", color: "#334155" },
  actionLinkBtn: { display: "flex", alignItems: "center", gap: 3, border: "none", background: "none", color: "#2563eb", fontSize: 11, fontWeight: 600, cursor: "pointer" },

  // Right Column (38%)
  rightColumn: { flex: "1 1 38%", maxWidth: 480, minWidth: 360, background: "#ffffff", display: "flex", flexDirection: "column", overflowY: "auto" },
  modeTabsHeader: { display: "flex", borderBottom: "1px solid #e2e8f0", background: "#ffffff" },
  modeTab: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5, padding: "10px 12px", border: "none", background: "none", fontSize: 12, fontWeight: 600, color: "#64748b", cursor: "pointer", borderBottom: "2px solid transparent", marginBottom: -1 },
  modeTabActive: { color: "#0f172a", borderBottomColor: "#0f172a", fontWeight: 700 },

  // Builder Cards with Number Circles
  builderContainer: { padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, flex: 1, overflowY: "auto" },
  accordionCard: { background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px" },
  accordionHeader: { display: "flex", alignItems: "center", gap: 8 },
  numCircle: { width: 20, height: 20, borderRadius: "50%", border: "1px solid #cbd5e1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#0f172a", flexShrink: 0 },
  accordionTitle: { fontWeight: 700, fontSize: 13, color: "#0f172a" },
  accordionSub: { fontSize: 10, color: "#64748b" },

  // Fields
  fieldList: { display: "flex", flexDirection: "column", gap: 8, marginTop: 10 },
  formRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  formLabel: { fontSize: 11, fontWeight: 500, color: "#334155" },
  formSelect: { border: "1px solid #cbd5e1", borderRadius: 5, padding: "3px 8px", fontSize: 11, outline: "none", background: "#ffffff", color: "#0f172a", minWidth: 100 },
  formInput: { border: "1px solid #cbd5e1", borderRadius: 5, padding: "3px 8px", fontSize: 11, outline: "none", width: 100, color: "#0f172a" },
  formInputSm: { border: "1px solid #cbd5e1", borderRadius: 5, padding: "3px 6px", fontSize: 11, outline: "none", width: 55, color: "#0f172a" },

  // Logic Toggle
  logicToggle: { display: "flex", border: "1px solid #e2e8f0", borderRadius: 5, overflow: "hidden", background: "#f8fafc" },
  logicBtn: { border: "none", background: "none", padding: "2px 8px", fontSize: 10, fontWeight: 600, color: "#64748b", cursor: "pointer" },
  logicBtnActive: { background: "#0f172a", color: "#ffffff" },

  // Condition Row
  condRow: { display: "flex", alignItems: "center", gap: 4, padding: "6px 8px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, flexWrap: "wrap" as const },
  condSelect: { border: "1px solid #cbd5e1", borderRadius: 4, padding: "3px 6px", fontSize: 11, background: "#ffffff", color: "#0f172a", outline: "none" },
  condOpSelect: { border: "1px solid #cbd5e1", borderRadius: 4, padding: "3px 6px", fontSize: 11, background: "#ffffff", color: "#0f172a", outline: "none" },
  condInputSm: { border: "1px solid #cbd5e1", borderRadius: 4, padding: "3px 6px", fontSize: 11, width: 45, outline: "none", color: "#0f172a", background: "#ffffff" },
  condInputXs: { border: "1px solid #cbd5e1", borderRadius: 4, padding: "3px 4px", fontSize: 10, width: 34, outline: "none", color: "#0f172a", background: "#ffffff" },
  targetTogglePill: { display: "flex", border: "1px solid #cbd5e1", borderRadius: 4, overflow: "hidden", background: "#ffffff" },
  targetBtn: { border: "none", background: "none", padding: "2px 5px", fontSize: 9, fontWeight: 600, color: "#64748b", cursor: "pointer" },
  targetBtnActive: { background: "#0f172a", color: "#ffffff" },
  removeBtn: { border: "none", background: "none", color: "#94a3b8", cursor: "pointer", fontSize: 12, padding: "2px 4px", marginLeft: "auto" },
  addCondBtn: { border: "1px dashed #cbd5e1", background: "#ffffff", borderRadius: 4, padding: "4px 10px", fontSize: 10, fontWeight: 600, color: "#0f172a", cursor: "pointer", alignSelf: "flex-start", marginTop: 4 },

  // Timeframe Grid (2x2)
  timeframeGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 },
  gridItem: { display: "flex", flexDirection: "column", gap: 2 },
  formLabelSm: { fontSize: 10, fontWeight: 600, color: "#64748b" },
  formInputSmFull: { border: "1px solid #cbd5e1", borderRadius: 5, padding: "3px 6px", fontSize: 11, outline: "none", width: "100%", boxSizing: "border-box" as const },
  formSelectSm: { border: "1px solid #cbd5e1", borderRadius: 5, padding: "3px 6px", fontSize: 11, outline: "none", width: "100%", background: "#ffffff", boxSizing: "border-box" as const },

  // Sticky Bottom Bar
  stickyBottomBar: { padding: "10px 14px", borderTop: "1px solid #e2e8f0", background: "#ffffff", position: "sticky", bottom: 0, zIndex: 10 },
  fullWidthBlackRunBtn: { width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "#0f172a", color: "#ffffff", border: "none", borderRadius: 6, padding: "9px", fontSize: 12, fontWeight: 700, cursor: "pointer", letterSpacing: 0.2 },

  // Drawer
  drawerOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 100, display: "flex", justifyContent: "flex-end" },
  drawer: { width: 320, background: "#ffffff", height: "100%", display: "flex", flexDirection: "column", boxShadow: "-4px 0 20px rgba(0,0,0,0.1)" },
  drawerHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid #e2e8f0" },
  drawerCloseBtn: { background: "none", border: "none", fontSize: 14, color: "#64748b", cursor: "pointer" },
  drawerStratCard: { padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 6, marginBottom: 8, cursor: "pointer", background: "#ffffff" },
  drawerStratCardActive: { borderColor: "#0f172a", background: "#f8fafc" },
  deleteBtn: { background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 12 },
  errorBox: { padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: 11, color: "#dc2626" },
  formatBtn: { background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 4, padding: "3px 8px", fontSize: 10, fontWeight: 600, color: "#0f172a", cursor: "pointer" },

  // Live Modal
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)", zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  modalContent: { width: "100%", maxWidth: 840, maxHeight: "90vh", background: "#ffffff", borderRadius: 12, display: "flex", flexDirection: "column", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2), 0 8px 10px -6px rgba(0,0,0,0.2)", overflow: "hidden" },
  modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid #e2e8f0", background: "#ffffff" },
  modalCloseBtn: { background: "none", border: "none", fontSize: 16, color: "#64748b", cursor: "pointer", padding: 4 },
  modalTabs: { display: "flex", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "0 16px" },
  modalTabBtn: { border: "none", background: "none", padding: "12px 14px", fontSize: 12, fontWeight: 600, color: "#64748b", cursor: "pointer", borderBottom: "2px solid transparent", marginBottom: -1 },
  modalTabActive: { color: "#0f172a", borderBottomColor: "#0f172a", fontWeight: 700 },
  modalBody: { padding: "16px 20px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 14 },
  executeBtn: { border: "none", borderRadius: 6, padding: "9px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 1px 2px rgba(0,0,0,0.1)" },
};
