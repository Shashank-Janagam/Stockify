/**
 * LiveTradingPage.tsx — Algorithmic Live Trading Command Center
 * Light theme, clear bot status, visual signals, plain-English activity feed
 * Route: /live-trading
 */

import { useContext, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../auth/AuthProvider";

const PYTHON_HOST = import.meta.env.VITE_PYTHON_API_URL || "http://127.0.0.1:5001";
const HOST        = import.meta.env.VITE_HOST_ADDRESS   || "";

// ── Types ───────────────────────────────────────────────────────────────────
interface Strategy {
  _id: string; name: string; description?: string; config: any; updatedAt: string;
}
interface Holding { qty: number; avg_price: number; cost: number; }
interface ConditionEval {
  left_label: string; left_value: number | null; op: string;
  right_label: string; right_value: number | null; passed: boolean;
}
interface BotStatus {
  strategy_id: string; strategy_name: string; market: string; symbols: string[];
  capital: number; remaining_capital: number; total_equity?: number;
  status: string; started_at: string; trade_count: number;
  last_signal: string; last_evaluated_at: string | null;
  last_evaluated_symbol?: string;
  last_indicators?: Record<string, number | null>;
  last_entry_conditions?: ConditionEval[];
  last_exit_conditions?: ConditionEval[];
  entry_matched?: boolean; exit_matched?: boolean;
  pnl: number; realized_pnl?: number; unrealized_pnl?: number; total_pnl?: number;
  holdings: Record<string, Holding>;
  equity_curve: { time: string; equity: number }[];
  signals_history?: { time: string; symbol: string; signal: string; price: number }[];
  use_live_ws?: boolean; interval?: string; config?: any;
}
interface ReplayStatus {
  is_replaying: boolean; replay_date: string; speed: number;
  current: number; total: number; pct: number; simulated_time: string;
  symbols_count: number; error: string;
}
interface ScanResult {
  symbol: string; company_name: string; ltp: number; change_pct: number;
  high: number; low: number; signal: "BUY" | "SELL" | "HOLD";
  entry_matched: boolean; exit_matched: boolean;
  entry_conditions: ConditionEval[]; exit_conditions: ConditionEval[];
  indicators: Record<string, number | null>;
  recommended_qty: number; estimated_cost: number;
}
interface Tick {
  symbol: string; raw_symbol: string; ltp: number; prev_close?: number; timestamp: string;
}
interface Execution {
  strategyId: string; strategyName: string; symbol: string;
  action: "BUY" | "SELL"; quantity: number; price: number; value: number;
  pnl?: number; executedAt: string;
}
interface Log { time: string; level: string; message: string; }

// ── Universe Presets ────────────────────────────────────────────────────────
const NIFTY50 = [
  "RELIANCE","TCS","HDFCBANK","INFY","ICICIBANK","HINDUNILVR","ITC","SBIN",
  "BHARTIARTL","KOTAKBANK","LT","AXISBANK","BAJFINANCE","ASIANPAINT","MARUTI",
  "TITAN","SUNPHARMA","ULTRACEMCO","TATASTEEL","NTPC","M&M","POWERGRID",
  "TATAMOTORS","ADANIENT","JSWSTEEL","BAJAJFINSV","HCLTECH","ONGC","COALINDIA",
  "WIPRO","GRASIM","NESTLEIND","TECHM","CIPLA","HDFCLIFE","SBILIFE","DRREDDY",
  "EICHERMOT","BPCL","TATACONSUM",
];
const NIFTY_BANK = [
  "HDFCBANK","ICICIBANK","KOTAKBANK","SBIN","AXISBANK","BANDHANBNK",
  "FEDERALBNK","IDFCFIRSTB","INDUSINDBK","PNB",
];
const MARKET_LISTS: Record<string, string[]> = {
  NIFTY50, NIFTY_BANK,
  NIFTY_IT: ["TCS","INFY","HCLTECH","WIPRO","TECHM","MPHASIS","COFORGE","PERSISTENT","LTIMindtree","LTTS"],
};
const marketOf = (s: Strategy) => (s.config?.universe?.market || "NIFTY50").toUpperCase();

// ── Design tokens ────────────────────────────────────────────────────────────
const T = {
  pageBg:    "#f8fafc",
  panelBg:   "#ffffff",
  sideBg:    "#ffffff",
  cardBg:    "#ffffff",
  centerBg:  "#f1f5f9",
  border:    "#e2e8f0",
  borderMid: "#f1f5f9",
  textHigh:  "#0f172a",
  textMid:   "#334155",
  textLow:   "#64748b",
  textFaint: "#94a3b8",
  chipBg:    "#f1f5f9",
  green:     "#059669",
  greenBg:   "#ecfdf5",
  greenBdr:  "#a7f3d0",
  red:       "#dc2626",
  redBg:     "#fff1f2",
  redBdr:    "#fecdd3",
  blue:      "#2563eb",
  blueBg:    "#eff6ff",
  blueBdr:   "#bfdbfe",
  amber:     "#d97706",
  amberBg:   "#fffbeb",
  amberBdr:  "#fde68a",
  purple:    "#7c3aed",
  purpleBg:  "#f5f3ff",
  purpleBdr: "#ddd6fe",
};

// ── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ data, capital, h = 60 }: { data: { time: string; equity: number }[]; capital: number; h?: number }) {
  if (!data || data.length < 2)
    return <div style={{ height: h, background: T.chipBg, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: T.textFaint, fontSize: 11 }}>Awaiting trades to draw curve…</div>;
  const W = 320;
  const vals = data.map(d => d.equity);
  const mn = Math.min(...vals, capital * 0.99); const mx = Math.max(...vals, capital * 1.01);
  const rng = mx - mn || 1;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * W},${h - ((d.equity - mn) / rng) * (h - 6) - 3}`).join(" ");
  const last = vals[vals.length - 1]; const up = last >= capital;
  const col = up ? "#10b981" : "#ef4444";
  const fillPts = `0,${h} ${pts} ${W},${h}`;
  const baseline = h - ((capital - mn) / rng) * (h - 6) - 3;
  return (
    <svg viewBox={`0 0 ${W} ${h}`} style={{ width: "100%", height: h }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg-${up}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={col} stopOpacity="0.15" />
          <stop offset="100%" stopColor={col} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill={`url(#sg-${up})`} />
      <polyline points={pts} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="0" y1={baseline} x2={W} y2={baseline} stroke={T.border} strokeWidth="1" strokeDasharray="3 3" />
    </svg>
  );
}

// ── Bot Step Indicator ─────────────────────────────────────────────────────
const BOT_STEPS = ["Starting", "Seeding History", "Monitoring", "Evaluating", "Executed"];
function BotStepIndicator({ bot, replay }: { bot: BotStatus; replay: ReplayStatus | null }) {
  let step = 1;
  if (bot.trade_count > 0) step = 4;
  else if (bot.entry_matched || bot.exit_matched) step = 3;
  else if (bot.last_evaluated_at) step = 3;
  else if ((bot.symbols?.length || 0) > 0) step = 2;
  if (replay?.is_replaying && step < 2) step = 2;

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {BOT_STEPS.map((label, i) => {
        const done = i < step; const active = i === step;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", flex: i < BOT_STEPS.length - 1 ? 1 : undefined }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 800, flexShrink: 0,
                background: done ? "#10b981" : active ? T.blue : T.chipBg,
                border: `2px solid ${done ? "#10b981" : active ? T.blue : T.border}`,
                color: done || active ? "#fff" : T.textFaint,
                boxShadow: active ? `0 0 0 3px ${T.blueBdr}` : "none",
              }}>
                {done ? "✓" : i + 1}
              </div>
              <span style={{ fontSize: 8, color: done ? T.green : active ? T.blue : T.textFaint, fontWeight: active ? 800 : 500, whiteSpace: "nowrap" }}>
                {label}
              </span>
            </div>
            {i < BOT_STEPS.length - 1 && (
              <div style={{ flex: 1, height: 2, background: done ? "#10b981" : T.border, margin: "0 3px", marginBottom: 16, transition: "background 0.4s" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Condition Row ──────────────────────────────────────────────────────────
function CondRow({ c }: { c: ConditionEval }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "7px 10px", borderRadius: 7, marginBottom: 4,
      background: c.passed ? T.greenBg : T.chipBg,
      border: `1px solid ${c.passed ? T.greenBdr : T.border}`,
    }}>
      <div style={{ fontSize: 11, color: T.textLow, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        <span style={{ color: T.textHigh, fontWeight: 700 }}>{c.left_label}</span>
        <span style={{ color: c.passed ? T.green : T.textFaint, fontSize: 10 }}>({c.left_value !== null ? Number(c.left_value).toFixed(2) : "—"})</span>
        <span style={{ color: T.textFaint, fontSize: 10, fontStyle: "italic" }}>{c.op}</span>
        <span style={{ color: T.textHigh, fontWeight: 700 }}>{c.right_label}</span>
        <span style={{ color: c.passed ? T.green : T.textFaint, fontSize: 10 }}>({c.right_value !== null ? Number(c.right_value).toFixed(2) : "—"})</span>
      </div>
      <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 8px", borderRadius: 4, background: c.passed ? T.greenBg : T.chipBg, border: `1px solid ${c.passed ? T.greenBdr : T.border}`, color: c.passed ? T.green : T.textFaint, flexShrink: 0 }}>
        {c.passed ? "✓ PASS" : "✗ WAIT"}
      </span>
    </div>
  );
}

// ── Quick Scan Modal ──────────────────────────────────────────────────────
function QuickScanModal({ strat, results, onClose }: { strat: Strategy; results: ScanResult[]; onClose: () => void }) {
  const market = (strat.config?.universe?.market || "NIFTY50").toUpperCase();
  const buys = results.filter(r => r.signal === "BUY");
  const sells = results.filter(r => r.signal === "SELL");
  const holds = results.filter(r => r.signal === "HOLD");
  const sigBg  = (s: string) => s === "BUY" ? T.greenBg : s === "SELL" ? T.redBg : T.chipBg;
  const sigBdr = (s: string) => s === "BUY" ? T.greenBdr : s === "SELL" ? T.redBdr : T.border;
  const sigClr = (s: string) => s === "BUY" ? T.green : s === "SELL" ? T.red : T.textFaint;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: T.panelBg, borderRadius: 14, width: "min(900px,98vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.18)", overflow: "hidden", border: `1px solid ${T.border}` }}>
        <div style={{ padding: "14px 20px", background: "linear-gradient(135deg,#0f172a,#1e3a5f)", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>🔍 Universe Scan — {strat.name}</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{market} · {results.length} stocks evaluated</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {[{ l: `📈 ${buys.length} BUY`, c: T.green, b: T.greenBdr, bg: T.greenBg },
              { l: `📉 ${sells.length} SELL`, c: T.red, b: T.redBdr, bg: T.redBg },
              { l: `⏸ ${holds.length} HOLD`, c: T.textFaint, b: T.border, bg: T.chipBg }]
              .map(({ l, c, b, bg }) => (
              <span key={l} style={{ padding: "3px 10px", borderRadius: 20, background: bg, border: `1px solid ${b}`, color: c, fontSize: 10, fontWeight: 800 }}>{l}</span>
            ))}
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer" }}>✕</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ background: T.chipBg, position: "sticky", top: 0 }}>
                {["Stock","Signal","LTP","Chg%","High / Low","Key Indicators","Entry Conditions"].map(h => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 9, fontWeight: 800, color: T.textFaint, letterSpacing: 0.8, textTransform: "uppercase", borderBottom: `1px solid ${T.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={r.symbol} style={{ background: i % 2 === 0 ? T.panelBg : T.chipBg, borderBottom: `1px solid ${T.borderMid}`, opacity: r.signal === "HOLD" ? 0.6 : 1 }}>
                  <td style={{ padding: "8px 10px", fontWeight: 700, color: T.textHigh }}>{r.company_name || r.symbol.replace(".NS","")}</td>
                  <td style={{ padding: "8px 10px" }}><span style={{ padding: "3px 9px", borderRadius: 20, fontSize: 10, fontWeight: 800, background: sigBg(r.signal), border: `1px solid ${sigBdr(r.signal)}`, color: sigClr(r.signal) }}>{r.signal === "BUY" ? "📈" : r.signal === "SELL" ? "📉" : "⏸"} {r.signal}</span></td>
                  <td style={{ padding: "8px 10px", fontWeight: 700, color: T.textHigh }}>₹{r.ltp?.toFixed(2)}</td>
                  <td style={{ padding: "8px 10px", fontWeight: 700, color: (r.change_pct||0) >= 0 ? T.green : T.red }}>{(r.change_pct||0) >= 0 ? "▲" : "▼"}{Math.abs(r.change_pct||0).toFixed(2)}%</td>
                  <td style={{ padding: "8px 10px", fontSize: 10, color: T.textLow }}><span style={{ color: T.green }}>H {r.high?.toFixed(1)}</span> / <span style={{ color: T.red }}>L {r.low?.toFixed(1)}</span></td>
                  <td style={{ padding: "8px 10px" }}><div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{Object.entries(r.indicators||{}).slice(0,3).map(([k,v]) => <span key={k} style={{ padding: "1px 5px", borderRadius: 3, background: T.chipBg, border: `1px solid ${T.border}`, fontSize: 9, color: T.textLow }}>{k}: {v !== null ? Number(v).toFixed(1) : "—"}</span>)}</div></td>
                  <td style={{ padding: "8px 10px" }}><div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>{(r.entry_conditions||[]).map((c,ci) => <span key={ci} style={{ padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 700, background: c.passed ? T.greenBg : T.chipBg, border: `1px solid ${c.passed ? T.greenBdr : T.border}`, color: c.passed ? T.green : T.textFaint }}>{c.passed ? "✓" : "✗"} {c.left_label}</span>)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "8px 20px", borderTop: `1px solid ${T.border}`, background: T.chipBg, fontSize: 10, color: T.textFaint, display: "flex", justifyContent: "space-between" }}>
          <span>Based on previous trading day's data. Not financial advice.</span>
          <span>Scanned {results.length} · {buys.length} BUY · {sells.length} SELL · {holds.length} HOLD</span>
        </div>
      </div>
    </div>
  );
}

// ── Live Stock Full Chart ─────────────────────────────────────────────────────
interface MiniChartProps {
  symbol: string;
  liveTicks: { time: number; price: number }[];
  signals: { time: string; signal: string; price: number }[];
  holding: Holding | null;
  isEvaluating: boolean;
  ltp: number | null;
  prevClose: number | null;
  indicators: Record<string, number | null>;
}

function LiveStockMiniChart({ symbol, liveTicks, signals, holding, isEvaluating, ltp, prevClose, indicators }: MiniChartProps) {
  const HOST_URL = import.meta.env.VITE_HOST_ADDRESS || "";

  // Fetch full 1D candle history from Node backend on mount
  const [candleData, setCandleData] = useState<{ x: number; y: number }[]>([]);
  const [fetchedSym, setFetchedSym] = useState("");

  useEffect(() => {
    if (!symbol || fetchedSym === symbol) return;
    setFetchedSym(symbol);
    const nseSym = symbol.includes(".") ? symbol : `${symbol}.NS`;
    fetch(`${HOST_URL}/api/stocks/${nseSym}/history?days=1&interval=1m`)
      .then(r => r.ok ? r.json() : [])
      .then((candles: any[]) => {
        if (!Array.isArray(candles) || candles.length === 0) return;
        // Timestamps from backend are already UTC epoch milliseconds
        const pts = candles
          .map(c => ({ x: Number(c.x || 0), y: Number(c.c ?? c.y ?? 0) }))
          .filter(p => p.x > 0 && p.y > 0);
        setCandleData(pts);
      })
      .catch(() => {});
  }, [symbol, HOST_URL]);

  // Merge historical candles + live ticks arriving from the 2s poll
  const allPoints = useMemo(() => {
    const live = liveTicks.map(t => ({ x: t.time, y: t.price }));
    if (candleData.length === 0) return live;
    const lastCandleTs = candleData[candleData.length - 1].x;
    const freshLive = live.filter(p => p.x > lastCandleTs);
    return [...candleData, ...freshLive];
  }, [candleData, liveTicks]);

  // ── SVG geometry ──────────────────────────────────────────────────────
  const W = 560; const H = 200;
  const PAD = { t: 16, b: 28, l: 52, r: 58 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  // Indian Market Hours in UTC: 9:15 AM IST = 03:45 UTC, 3:30 PM IST = 10:00 UTC
  const anchorPt = allPoints[0] || (candleData.length > 0 ? candleData[0] : null);
  const anchorDate = anchorPt ? new Date(anchorPt.x) : new Date();
  anchorDate.setUTCHours(0, 0, 0, 0);
  const mktOpen  = anchorDate.getTime() + (3 * 60 + 45) * 60000;
  const mktClose = anchorDate.getTime() + (10 * 60 + 0) * 60000;

  const toX = (t: number) => PAD.l + Math.max(0, Math.min(1, (t - mktOpen) / (mktClose - mktOpen))) * chartW;

  // Y domain
  const visiblePts = allPoints.length > 0 ? allPoints : candleData;
  const latestCandlePrice = candleData.length > 0 ? candleData[candleData.length - 1].y : null;
  const displayLtp = ltp ?? (visiblePts.length > 0 ? visiblePts[visiblePts.length - 1].y : latestCandlePrice);
  const refPrice   = prevClose || holding?.avg_price || (visiblePts[0]?.y ?? displayLtp ?? null);
  const yPrices    = visiblePts.map(p => p.y);
  if (refPrice !== null) yPrices.push(refPrice);
  if (displayLtp !== null) yPrices.push(displayLtp);
  signals.forEach(s => { if (s.price) yPrices.push(s.price); });

  const rawMin = yPrices.length > 0 ? Math.min(...yPrices) : 0;
  const rawMax = yPrices.length > 0 ? Math.max(...yPrices) : 1;
  const padP   = (rawMax - rawMin) * 0.08 || Math.max(rawMin * 0.005, 1);
  const domMin = rawMin - padP;
  const domMax = rawMax + padP;
  const domRng = domMax - domMin || 1;

  const toY = (p: number) => PAD.t + chartH - ((p - domMin) / domRng) * chartH;

  const hasData  = visiblePts.length >= 2;
  const lastPt   = visiblePts[visiblePts.length - 1] ?? null;
  const lastPrice = displayLtp;
  const isUp     = lastPrice !== null && refPrice !== null ? lastPrice >= refPrice : true;
  const lineColor = isUp ? "#10b981" : "#ef4444";
  const fillId   = `lcfill-${symbol}`;

  const linePts = hasData
    ? visiblePts.map(p => `${toX(p.x).toFixed(1)},${toY(p.y).toFixed(1)}`).join(" ")
    : "";
  const fillPts = hasData && lastPt
    ? `${PAD.l},${PAD.t + chartH} ${linePts} ${toX(lastPt.x).toFixed(1)},${PAD.t + chartH}`
    : "";

  const changePct  = displayLtp !== null && refPrice && refPrice > 0
    ? ((displayLtp - refPrice) / refPrice) * 100 : null;
  const lastSig    = signals.length > 0 ? signals[0] : null;

  // Y-axis price ticks (5 levels)
  const yTicks: number[] = [];
  const nYTicks = 5;
  for (let i = 0; i <= nYTicks; i++) yTicks.push(domMin + (i / nYTicks) * domRng);

  // X-axis time labels
  const xLabels = [
    { label: "9:15",  ts: mktOpen },
    { label: "11:00", ts: mktOpen + (1 * 60 + 45) * 60000 },
    { label: "13:00", ts: mktOpen + (3 * 60 + 45) * 60000 },
    { label: "15:30", ts: mktClose },
  ];

  const indColors = ["#7c3aed", "#d97706", "#2563eb"];
  const indEntries = Object.entries(indicators).slice(0, 3);
  const refY = refPrice !== null ? toY(refPrice) : null;
  const refInBounds = refY !== null && refY >= PAD.t && refY <= PAD.t + chartH;

  return (
    <div
      className="live-mini-chart-card"
      style={{
        background: T.panelBg,
        border: `1.5px solid ${isEvaluating ? T.amberBdr : holding ? T.greenBdr : T.border}`,
        borderRadius: 10,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 7,
        boxShadow: isEvaluating
          ? `0 0 0 3px ${T.amberBdr}, 0 2px 12px rgba(0,0,0,0.08)`
          : "0 2px 8px rgba(0,0,0,0.06)",
        animation: isEvaluating ? "evalPulse 1.5s ease infinite" : undefined,
      }}
    >
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: T.textHigh }}>{symbol}</span>
          {holding && (
            <span style={{ fontSize: 8.5, padding: "2px 7px", borderRadius: 4, background: T.greenBg, border: `1px solid ${T.greenBdr}`, color: T.green, fontWeight: 800 }}>
              📂 HOLD {holding.qty}
            </span>
          )}
          {isEvaluating && (
            <span style={{ fontSize: 8, padding: "2px 7px", borderRadius: 4, background: T.amberBg, border: `1px solid ${T.amberBdr}`, color: T.amber, fontWeight: 800, animation: "pulse 1s infinite" }}>
              🔍 EVAL
            </span>
          )}
          {lastSig && (
            <span style={{
              fontSize: 8.5, padding: "2px 7px", borderRadius: 4, fontWeight: 800,
              background: lastSig.signal === "BUY" ? T.greenBg : lastSig.signal === "SELL" ? T.redBg : T.chipBg,
              border: `1px solid ${lastSig.signal === "BUY" ? T.greenBdr : lastSig.signal === "SELL" ? T.redBdr : T.border}`,
              color: lastSig.signal === "BUY" ? T.green : lastSig.signal === "SELL" ? T.red : T.textFaint,
            }}>
              {lastSig.signal === "BUY" ? "▲" : lastSig.signal === "SELL" ? "▼" : "⏸"} {lastSig.signal} @ ₹{lastSig.price.toFixed(2)}
            </span>
          )}
        </div>
        {displayLtp !== null && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: isUp ? T.green : T.red, lineHeight: 1 }}>
              ₹{displayLtp.toFixed(2)}
            </div>
            {changePct !== null && (
              <div style={{ fontSize: 10, color: changePct >= 0 ? T.green : T.red, fontWeight: 700 }}>
                {changePct >= 0 ? "▲" : "▼"}{Math.abs(changePct).toFixed(2)}%
                {refPrice !== null && <span style={{ color: T.textFaint, fontWeight: 400 }}> vs ₹{refPrice.toFixed(1)}</span>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── SVG Chart ── */}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}
        style={{ display: "block", overflow: "visible" }} preserveAspectRatio="none">
        <defs>
          <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.22" />
            <stop offset="80%" stopColor={lineColor} stopOpacity="0.03" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
          <clipPath id={`clip-${symbol}`}>
            <rect x={PAD.l} y={PAD.t} width={chartW} height={chartH} />
          </clipPath>
        </defs>

        {/* Chart background */}
        <rect x={PAD.l} y={PAD.t} width={chartW} height={chartH} fill="white" rx={3} />

        {/* Y-axis gridlines + labels */}
        {yTicks.map((tick, i) => {
          const ty = toY(tick);
          if (ty < PAD.t - 2 || ty > PAD.t + chartH + 2) return null;
          return (
            <g key={`ytick-${i}`}>
              <line x1={PAD.l} y1={ty} x2={PAD.l + chartW} y2={ty}
                stroke="#f1f5f9" strokeWidth={1} />
              <text x={PAD.l - 5} y={ty + 3.5} textAnchor="end"
                fontSize={9} fill="#94a3b8" fontFamily="Inter,sans-serif">
                {tick >= 100 ? tick.toFixed(0) : tick.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* X-axis time labels + verticals */}
        {xLabels.map(({ label, ts }) => {
          const tx = toX(ts);
          return (
            <g key={label}>
              <line x1={tx} y1={PAD.t} x2={tx} y2={PAD.t + chartH}
                stroke="#f1f5f9" strokeWidth={1} />
              <text x={tx} y={PAD.t + chartH + 16} textAnchor="middle"
                fontSize={9} fill="#94a3b8" fontFamily="Inter,sans-serif">
                {label}
              </text>
            </g>
          );
        })}

        {/* Reference / prevClose dashed line */}
        {refInBounds && refY !== null && (
          <g clipPath={`url(#clip-${symbol})`}>
            <line x1={PAD.l} y1={refY} x2={PAD.l + chartW} y2={refY}
              stroke="#94a3b8" strokeWidth={1} strokeDasharray="6 4" />
          </g>
        )}
        {refInBounds && refY !== null && refPrice !== null && (
          <>
            <rect x={PAD.l + chartW + 2} y={refY - 8} width={50} height={14} rx={3} fill="#f1f5f9" />
            <text x={PAD.l + chartW + 27} y={refY + 1.5}
              textAnchor="middle" fontSize={8} fill="#64748b" fontFamily="Inter,sans-serif" fontWeight="600">
              {holding ? "avg" : "prev"} {refPrice.toFixed(1)}
            </text>
          </>
        )}

        {/* Indicator threshold lines */}
        {indEntries.map(([key, val], idx) => {
          if (val === null) return null;
          const iy = toY(val);
          if (iy < PAD.t || iy > PAD.t + chartH) return null;
          const ic = indColors[idx];
          const labelW = key.length * 5.5 + 30;
          return (
            <g key={`ind-${key}`}>
              <line x1={PAD.l} y1={iy} x2={PAD.l + chartW} y2={iy}
                stroke={ic} strokeWidth={1.2} strokeDasharray="6 3" opacity={0.75}
                clipPath={`url(#clip-${symbol})`} />
              <rect x={PAD.l + 3} y={iy - 9} width={labelW} height={12} rx={3}
                fill="white" opacity={0.92} />
              <text x={PAD.l + 5} y={iy + 0.5} fontSize={8} fill={ic}
                fontFamily="Inter,sans-serif" fontWeight="700">
                {key}: {Number(val).toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* Gradient fill */}
        {hasData && (
          <polygon points={fillPts} fill={`url(#${fillId})`}
            clipPath={`url(#clip-${symbol})`} />
        )}

        {/* Price line */}
        {hasData && (
          <polyline points={linePts} fill="none" stroke={lineColor}
            strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"
            clipPath={`url(#clip-${symbol})`} />
        )}

        {/* BUY / SELL signal markers */}
        {signals.map((s, i) => {
          if (!s.price) return null;
          // Parse signal time — format is "HH:MM:SS" or ISO string
          let sigTs: number;
          if (/^\d{2}:\d{2}/.test(s.time)) {
            const parts = s.time.split(":").map(Number);
            sigTs = mktOpen + (parts[0] - 9) * 3600000 + (parts[1] - 15) * 60000;
          } else {
            // ISO — convert IST ISO to IST-as-UTC convention used by chart
            sigTs = new Date(s.time).getTime();
          }
          const sx = toX(sigTs);
          const sy = toY(s.price);
          if (sx < PAD.l - 4 || sx > PAD.l + chartW + 4) return null;
          const isBuy = s.signal === "BUY";
          const mc = isBuy ? "#10b981" : "#ef4444";
          const sz = 8;
          const triPts = isBuy
            ? `${sx},${sy - sz} ${sx - sz},${sy + sz * 0.7} ${sx + sz},${sy + sz * 0.7}`
            : `${sx},${sy + sz} ${sx - sz},${sy - sz * 0.7} ${sx + sz},${sy - sz * 0.7}`;

          return (
            <g key={`sig-${i}`}>
              <line x1={sx} y1={PAD.t} x2={sx} y2={PAD.t + chartH}
                stroke={mc} strokeWidth={1.2} strokeDasharray="4 3" opacity={0.5}
                clipPath={`url(#clip-${symbol})`} />
              <polygon points={triPts} fill={mc} opacity={0.95} />
              <rect x={sx - 20} y={isBuy ? sy + sz + 2 : sy - sz - 14}
                width={40} height={12} rx={3} fill={mc} opacity={0.9} />
              <text x={sx} y={isBuy ? sy + sz + 10 : sy - sz - 4}
                textAnchor="middle" fontSize={7.5} fill="white"
                fontWeight="700" fontFamily="Inter,sans-serif">
                ₹{s.price.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Current price dot + right-edge badge */}
        {hasData && lastPt && (() => {
          const cx = toX(lastPt.x);
          const cy = toY(lastPt.y);
          const inBounds = cx >= PAD.l && cx <= PAD.l + chartW;
          return (
            <>
              {inBounds && (
                <circle cx={cx} cy={cy} r={4.5} fill={lineColor}
                  stroke="white" strokeWidth={1.5} />
              )}
              <rect x={PAD.l + chartW + 2} y={cy - 9} width={50} height={15}
                rx={3} fill={lineColor} />
              <text x={PAD.l + chartW + 27} y={cy + 1.5}
                textAnchor="middle" fontSize={8.5} fill="white"
                fontWeight="800" fontFamily="Inter,sans-serif">
                ₹{lastPt.y.toFixed(1)}
              </text>
            </>
          );
        })()}

        {/* Chart border */}
        <rect x={PAD.l} y={PAD.t} width={chartW} height={chartH}
          fill="none" stroke="#e2e8f0" strokeWidth={1} rx={3} />

        {/* X-axis line */}
        <line x1={PAD.l} y1={PAD.t + chartH} x2={PAD.l + chartW} y2={PAD.t + chartH}
          stroke="#e2e8f0" strokeWidth={1} />

        {/* Placeholder */}
        {!hasData && (
          <>
            <text x={W / 2} y={H / 2 - 8} textAnchor="middle"
              fontSize={11} fill={T.textFaint} fontFamily="Inter,sans-serif">
              Fetching market data…
            </text>
            {ltp !== null && (
              <text x={W / 2} y={H / 2 + 10} textAnchor="middle"
                fontSize={13} fill={T.textLow} fontWeight="800" fontFamily="Inter,sans-serif">
                LTP ₹{ltp.toFixed(2)}
              </text>
            )}
          </>
        )}
      </svg>

      {/* Holding P&L row */}
      {holding && displayLtp !== null && (
        <div style={{
          fontSize: 9.5, display: "flex", gap: 10, padding: "5px 9px", borderRadius: 5,
          background: ((displayLtp - holding.avg_price) * holding.qty) >= 0 ? T.greenBg : T.redBg,
          border: `1px solid ${((displayLtp - holding.avg_price) * holding.qty) >= 0 ? T.greenBdr : T.redBdr}`,
        }}>
          <span style={{ color: T.textLow }}>
            Avg ₹{holding.avg_price.toFixed(2)} · {holding.qty} qty · Cost ₹{holding.cost.toFixed(0)}
          </span>
          <span style={{ marginLeft: "auto", fontWeight: 800,
            color: ((displayLtp - holding.avg_price) * holding.qty) >= 0 ? T.green : T.red }}>
            {((displayLtp - holding.avg_price) * holding.qty) >= 0 ? "+" : ""}₹{((displayLtp - holding.avg_price) * holding.qty).toFixed(1)} P&L
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main Page Component ───────────────────────────────────────────────────
export default function LiveTradingPage() {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [atStatus, setAtStatus] = useState<{
    ws_connected: boolean; use_live_ws: boolean;
    active_bots: BotStatus[]; active_bots_count: number;
    last_ticks: Tick[]; recent_logs: Log[];
    recent_executions: Execution[]; replay: ReplayStatus | null;
  } | null>(null);

  const [loadingStrats, setLoadingStrats] = useState(true);
  const [deployingId, setDeployingId]     = useState<string | null>(null);
  const [stoppingId, setStoppingId]       = useState<string | null>(null);
  const [liveWsMode, setLiveWsMode]       = useState(true);
  const [scanningStratId, setScanningStratId] = useState<string | null>(null);
  const [scanModal, setScanModal]         = useState<{ strat: Strategy; results: ScanResult[] } | null>(null);
  const [scanError, setScanError]         = useState<{ stratId: string; msg: string } | null>(null);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [replaySpeed, setReplaySpeed]     = useState(30);
  const [replayStarting, setReplayStarting] = useState(false);
  const [replayStopping, setReplayStopping] = useState(false);
  const [replayDateInput, setReplayDateInput] = useState("");
  const feedRef = useRef<HTMLDivElement>(null);

  // ── Per-symbol tick history for live mini-charts ───────────────────────
  const [tickHistory, setTickHistory] = useState<Record<string, { time: number; price: number }[]>>({});
  const [showCharts, setShowCharts]   = useState(true);

  const loadStrategies = useCallback(async () => {
    if (!user) return;
    try {
      const r = await fetch(`${HOST}/api/paperbull/strategies`, { credentials: "include" });
      if (r.ok) { const d = await r.json(); setStrategies(d.strategies || []); }
    } catch (_) {}
    setLoadingStrats(false);
  }, [user]);

  const pollStatus = useCallback(async () => {
    try {
      const r = await fetch(`${PYTHON_HOST}/paperbull/autotrade/status`);
      if (r.ok) {
        const data = await r.json();
        setAtStatus(data);
        setSelectedBotId(prev => {
          if (prev && data.active_bots?.some((b: BotStatus) => b.strategy_id === prev)) return prev;
          return data.active_bots?.[0]?.strategy_id ?? null;
        });
        // Accumulate tick history for mini-charts
        const ticks: Tick[] = data.last_ticks || [];
        if (ticks.length > 0) {
          const now = Date.now();
          setTickHistory(prev => {
            const next = { ...prev };
            ticks.forEach(t => {
              const key = t.raw_symbol || t.symbol.replace(".NS", "");
              const arr = next[key] ? [...next[key]] : [];
              arr.push({ time: now, price: t.ltp });
              // Keep last 200 data points per symbol
              next[key] = arr.slice(-200);
            });
            return next;
          });
        }
      }
    } catch (_) {}
  }, []);

  useEffect(() => { loadStrategies(); }, [loadStrategies]);
  useEffect(() => {
    pollStatus();
    const iv = setInterval(pollStatus, 2000);
    return () => clearInterval(iv);
  }, [pollStatus]);

  const deployStrategy = async (strat: Strategy) => {
    if (!user) return;
    setDeployingId(strat._id);
    const market = (strat.config?.universe?.market || "NIFTY50").toUpperCase();
    const universeSymbols = (strat.config?.universe?.symbols && strat.config.universe.symbols.length > 0)
      ? strat.config.universe.symbols
      : (MARKET_LISTS[market] || NIFTY50);
    try {
      const r = await fetch(`${PYTHON_HOST}/paperbull/autotrade/start`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strategy_id: strat._id, strategy_name: strat.name,
          user_id: user.uid, config: strat.config, symbols: universeSymbols,
          capital: strat.config?.portfolio?.capital || 100000,
          interval: strat.config?.portfolio?.interval || "1d",
          use_websocket: liveWsMode,
        }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({ detail: "Error" })); alert(`Deploy failed: ${e.detail}`); }
      else { setSelectedBotId(strat._id); await pollStatus(); }
    } catch (e: any) { alert(e.message); }
    setDeployingId(null);
  };

  const stopBot = async (id: string) => {
    setStoppingId(id);
    try {
      await fetch(`${PYTHON_HOST}/paperbull/autotrade/stop`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy_id: id }),
      });
      await pollStatus();
    } catch (_) {}
    setStoppingId(null);
  };

  const stopAllBots = async () => {
    if (!window.confirm("Stop all running bots?")) return;
    try { await fetch(`${PYTHON_HOST}/paperbull/autotrade/stop-all`, { method: "POST" }); await pollStatus(); } catch (_) {}
  };

  const runQuickScan = async (strat: Strategy) => {
    setScanningStratId(strat._id); setScanError(null);
    const market = (strat.config?.universe?.market || "NIFTY50").toUpperCase();
    const totalStocks = (MARKET_LISTS[market] || NIFTY50).length;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 90_000);
    try {
      const r = await fetch(`${PYTHON_HOST}/paperbull/live/scan-universe`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market, config: strat.config, interval: strat.config?.portfolio?.interval || "1d", capital: strat.config?.portfolio?.capital || 100000, top_n: totalStocks + 10 }),
        signal: controller.signal,
      });
      clearTimeout(tid);
      const text = await r.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch (_) { setScanError({ stratId: strat._id, msg: `HTTP ${r.status}` }); return; }
      if (r.ok && data.success && data.results) setScanModal({ strat, results: data.results });
      else setScanError({ stratId: strat._id, msg: data.detail || data.error || `HTTP ${r.status}` });
    } catch (e: any) {
      clearTimeout(tid);
      setScanError({ stratId: strat._id, msg: e.name === "AbortError" ? "Scan timed out (90s)" : e.message });
    }
    setScanningStratId(null);
  };

  const startReplay = async () => {
    if ((atStatus?.active_bots_count || 0) === 0) { alert("Deploy a strategy first."); return; }
    setReplayStarting(true);
    try {
      const r = await fetch(`${PYTHON_HOST}/paperbull/autotrade/replay/start`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speed: replaySpeed, replay_date: replayDateInput || null }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) alert(`Replay failed: ${d.detail || "Error"}`);
      else await pollStatus();
    } catch (e: any) { alert(e.message); }
    setReplayStarting(false);
  };

  const stopReplay = async () => {
    setReplayStopping(true);
    try { await fetch(`${PYTHON_HOST}/paperbull/autotrade/replay/stop`, { method: "POST" }); await pollStatus(); } catch (_) {}
    setReplayStopping(false);
  };

  const handleStockClick = (symbol: string) => {
    const cleanSym = symbol.replace(".NS", "");
    navigate(`/stocks/${symbol}/${cleanSym}`);
  };

  // ── Derived ───────────────────────────────────────────────────────────
  const activeBotIds = new Set((atStatus?.active_bots || []).map(b => b.strategy_id));
  const allBots      = atStatus?.active_bots || [];
  const selectedBot  = allBots.find(b => b.strategy_id === selectedBotId) || allBots[0] || null;
  const replay       = atStatus?.replay || null;
  const isReplaying  = replay?.is_replaying || false;
  const isLive       = !!(atStatus?.ws_connected && atStatus?.use_live_ws);

  const aggCapital = allBots.reduce((a, b) => a + (b.capital || 0), 0);
  const aggEquity  = allBots.reduce((a, b) => a + (b.total_equity ?? b.capital ?? 0), 0);
  const aggPnl     = allBots.reduce((a, b) => a + (b.total_pnl ?? 0), 0);
  const aggRetPct  = aggCapital > 0 ? ((aggEquity - aggCapital) / aggCapital) * 100 : 0;
  const aggTrades  = allBots.reduce((a, b) => a + (b.trade_count || 0), 0);

  const tickMap: Record<string, Tick> = {};
  (atStatus?.last_ticks || []).forEach(t => { tickMap[t.symbol] = t; tickMap[t.raw_symbol] = t; });

  const logs  = atStatus?.recent_logs || [];
  const execs = atStatus?.recent_executions || [];

  // Plain-English bot status
  const botStatusInfo = (() => {
    const bot = selectedBot;
    if (!bot) return { headline: "No bot running", sub: "Deploy a strategy from the sidebar to begin", color: T.textFaint };
    if (bot.entry_matched) return { headline: "📈 Entry signal matched! Placing BUY order…", sub: `Symbol: ${bot.last_evaluated_symbol?.replace(".NS","") || "—"} · all entry conditions passed`, color: T.amber };
    if (bot.exit_matched)  return { headline: "📉 Exit signal triggered! Placing SELL order…", sub: `Symbol: ${bot.last_evaluated_symbol?.replace(".NS","") || "—"} · exit conditions met`, color: T.red };
    if (bot.last_signal === "BUY"  && bot.trade_count > 0) return { headline: "🟢 BUY executed — holding position", sub: `${Object.keys(bot.holdings||{}).length} open position(s) · ${bot.trade_count} total trades`, color: T.green };
    if (bot.last_signal === "SELL" && bot.trade_count > 0) return { headline: "🔴 SELL executed — position closed", sub: `P&L: ₹${(bot.total_pnl??0).toFixed(2)} · ${bot.trade_count} total trades`, color: T.red };
    if (isReplaying) return { headline: `⏩ Replay running at ${replay?.speed}x speed`, sub: `${replay?.current}/${replay?.total} ticks · ${replay?.simulated_time || ""} · ${replay?.pct}% done`, color: T.purple };
    if (bot.last_evaluated_at) return { headline: `🔍 Scanning ${bot.market} universe for signals`, sub: `Last checked: ${bot.last_evaluated_symbol?.replace(".NS","") || "—"} at ${bot.last_evaluated_at} · ${bot.symbols?.length || 0} stocks monitored`, color: T.blue };
    return { headline: "⏳ Warming up — fetching candle history", sub: `Seeding data for ${bot.symbols?.length || 0} stocks before evaluation begins`, color: T.amber };
  })();

  const logColor = (l: string) => l === "SUCCESS" ? T.green : l === "WARNING" ? T.amber : l === "ERROR" ? T.red : T.textLow;
  const logBg    = (l: string) => l === "SUCCESS" ? T.greenBg : l === "WARNING" ? T.amberBg : l === "ERROR" ? T.redBg : "transparent";
  const logBdr   = (l: string) => l === "SUCCESS" ? T.greenBdr : l === "WARNING" ? T.amberBdr : l === "ERROR" ? T.redBdr : T.border;

  // ── Derived symbols for charts ──────────────────────────────────────────
  const botSymbols = useMemo(() => {
    if (!selectedBot) return [];
    return (selectedBot.symbols || []).map(s => s.replace(".NS", ""));
  }, [selectedBot]);

  return (
    <div id="live-trading-page" style={{ minHeight: "100vh", background: T.pageBg, color: T.textHigh, fontFamily: "'Inter','Segoe UI',sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes liveBlink{0%,100%{box-shadow:0 0 4px #10b981}50%{box-shadow:0 0 12px #10b981,0 0 4px #10b981}}
        @keyframes fadeSlideIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        @keyframes evalPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.6;transform:scale(0.95)}}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-track{background:${T.chipBg}}
        ::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}
        .live-mini-chart-card:hover{box-shadow:0 4px 16px rgba(37,99,235,0.12)!important;border-color:${T.blueBdr}!important;transform:translateY(-1px);}
        .live-mini-chart-card{transition:all 0.18s ease;}
      `}</style>

      {/* Scan modal */}
      {scanModal && <QuickScanModal strat={scanModal.strat} results={scanModal.results} onClose={() => setScanModal(null)} />}

      {/* ── TOP NAV ─────────────────────────────────────────────────── */}
      <div style={{ height: 54, display: "flex", alignItems: "center", padding: "0 20px", background: T.panelBg, borderBottom: `1px solid ${T.border}`, gap: 14, flexShrink: 0, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <button id="back-btn" onClick={() => navigate("/algo-backtest/studio")} style={{ background: "none", border: "none", color: T.textFaint, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4, padding: 0 }}>← Back</button>
        <div style={{ width: 1, height: 18, background: T.border }} />
        <div style={{ fontSize: 15, fontWeight: 800, color: T.textHigh }}>🤖 Live Trading Room</div>

        {/* Mode toggle */}
        {allBots.length === 0 && (
          <div id="mode-toggle"
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 12px", borderRadius: 20, cursor: "pointer", border: `1px solid ${liveWsMode ? T.blueBdr : T.border}`, background: liveWsMode ? T.blueBg : T.chipBg, transition: "all 0.2s" }}
            onClick={() => setLiveWsMode(v => !v)} title="Toggle Live WS / Simulation"
          >
            <div style={{ width: 26, height: 14, borderRadius: 8, background: liveWsMode ? T.blue : T.border, position: "relative", transition: "background 0.2s" }}>
              <div style={{ position: "absolute", top: 2, left: liveWsMode ? 13 : 2, width: 10, height: 10, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: liveWsMode ? T.blue : T.textFaint }}>{liveWsMode ? "⚡ Live WS" : "💾 Simulation"}</span>
          </div>
        )}

        {/* Status badges */}
        {isReplaying && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: T.purpleBg, border: `1px solid ${T.purpleBdr}`, fontSize: 11, fontWeight: 700, color: T.purple }}>
            <span style={{ animation: "pulse 1s infinite" }}>⏩</span> Replaying {replay?.replay_date} @ {replay?.speed}x
          </div>
        )}
        {isLive && !isReplaying && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 20, background: T.greenBg, border: `1px solid ${T.greenBdr}`, fontSize: 11, fontWeight: 700, color: T.green }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", animation: "liveBlink 2s infinite" }} /> Upstox Live Feed Connected
          </div>
        )}
        {!isLive && !isReplaying && allBots.length > 0 && (
          <div style={{ padding: "3px 10px", borderRadius: 20, background: T.amberBg, border: `1px solid ${T.amberBdr}`, fontSize: 11, fontWeight: 700, color: T.amber }}>
            💾 Simulation — Use Replay to test
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Aggregate stats in topbar */}
        {allBots.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {[
              { label: "Portfolio", val: `₹${aggEquity.toLocaleString("en-IN",{maximumFractionDigits:0})}`, col: T.textHigh },
              { label: "P&L",       val: `${aggPnl>=0?"+":""}₹${Math.abs(aggPnl).toLocaleString("en-IN",{maximumFractionDigits:0})}`, col: aggPnl>=0?T.green:T.red },
              { label: "Return",    val: `${aggRetPct>=0?"+":""}${aggRetPct.toFixed(2)}%`, col: aggRetPct>=0?T.green:T.red },
              { label: "Trades",    val: String(aggTrades), col: T.purple },
            ].map(({ label, val, col }) => (
              <div key={label} style={{ textAlign: "right" }}>
                <div style={{ fontSize: 8.5, color: T.textFaint, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 1 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: col }}>{val}</div>
              </div>
            ))}
            <button onClick={stopAllBots} style={{ background: T.redBg, border: `1px solid ${T.redBdr}`, color: T.red, padding: "4px 11px", borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>⏹ Stop All</button>
          </div>
        )}
        {allBots.length === 0 && <div style={{ fontSize: 11, color: T.textFaint }}>No bots running — deploy a strategy from the sidebar</div>}
      </div>

      {/* ── 3-COLUMN LAYOUT ─────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "280px 1fr 310px", overflow: "hidden", minHeight: 0 }}>

        {/* ══ SIDEBAR ══════════════════════════════════════════════════ */}
        <div style={{ borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", background: T.sideBg, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}`, fontSize: 9, fontWeight: 800, color: T.textFaint, letterSpacing: 1.2, textTransform: "uppercase", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Your Strategies</span><span style={{ color: T.border }}>{strategies.length}</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {loadingStrats ? (
              <div style={{ textAlign: "center", color: T.textFaint, fontSize: 12, padding: 20 }}>Loading…</div>
            ) : strategies.length === 0 ? (
              <div style={{ textAlign: "center", color: T.textFaint, fontSize: 12, padding: 20, lineHeight: 1.8 }}>
                No saved strategies yet.<br />
                <button onClick={() => navigate("/algo-backtest/studio")} style={{ marginTop: 10, background: T.blue, border: "none", color: "#fff", padding: "7px 14px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Build a Strategy →</button>
              </div>
            ) : strategies.map(strat => {
              const running   = activeBotIds.has(strat._id);
              const deploying = deployingId === strat._id;
              const stopping  = stoppingId === strat._id;
              const isSelected = selectedBotId === strat._id && running;
              return (
                <div key={strat._id}
                  id={`strat-card-${strat._id}`}
                  onClick={() => running && setSelectedBotId(strat._id)}
                  style={{ background: isSelected ? T.blueBg : running ? T.greenBg : T.panelBg, border: `1.5px solid ${isSelected ? T.blueBdr : running ? T.greenBdr : T.border}`, borderRadius: 9, padding: "11px 11px 9px", cursor: running ? "pointer" : "default", transition: "all 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 5 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: T.textHigh, lineHeight: 1.3, flex: 1, marginRight: 6 }}>{strat.name}</div>
                    {running && (
                      <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 4, background: T.greenBg, border: `1px solid ${T.greenBdr}`, flexShrink: 0 }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#10b981", animation: "pulse 1.5s infinite" }} />
                        <span style={{ fontSize: 8.5, fontWeight: 800, color: T.green }}>RUNNING</span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 7 }}>
                    {[`📈 ${marketOf(strat)}`, `₹${((strat.config?.portfolio?.capital||100000)/1000).toFixed(0)}K`, strat.config?.portfolio?.interval||"1d", `${(MARKET_LISTS[marketOf(strat)]||NIFTY50).length} stocks`].map(c => (
                      <span key={c} style={{ padding: "1px 6px", borderRadius: 3, background: T.chipBg, border: `1px solid ${T.border}`, fontSize: 8.5, color: T.textLow, fontWeight: 600 }}>{c}</span>
                    ))}
                  </div>

                  <div style={{ fontSize: 9, color: T.textFaint, marginBottom: 8 }}>
                    <span style={{ color: T.green }}>↑ {strat.config?.entry?.conditions?.length||0} entry</span>
                    {" · "}
                    <span style={{ color: T.red }}>↓ {strat.config?.exit?.conditions?.length||0} exit</span>
                    {strat.description && <span> · {strat.description.slice(0,40)}{strat.description.length>40?"…":""}</span>}
                  </div>

                  <div style={{ display: "flex", gap: 5 }}>
                    <button id={`deploy-btn-${strat._id}`}
                      onClick={e => { e.stopPropagation(); running ? stopBot(strat._id) : deployStrategy(strat); }}
                      disabled={deploying || stopping}
                      style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: running ? `1px solid ${T.redBdr}` : "none", fontSize: 11, fontWeight: 700, cursor: deploying||stopping?"not-allowed":"pointer", background: running ? T.redBg : T.blue, color: running ? T.red : "#fff", opacity: deploying||stopping?0.6:1, transition: "opacity 0.15s" }}>
                      {deploying ? "Deploying…" : stopping ? "Stopping…" : running ? "⏹ Stop Bot" : liveWsMode ? "⚡ Deploy Live" : "▶ Deploy"}
                    </button>
                    <button id={`scan-btn-${strat._id}`}
                      onClick={e => { e.stopPropagation(); runQuickScan(strat); }}
                      disabled={scanningStratId === strat._id}
                      title="One-time universe scan"
                      style={{ padding: "7px 9px", borderRadius: 6, border: `1px solid ${T.blueBdr}`, background: T.blueBg, color: T.blue, fontSize: 12, cursor: "pointer" }}>
                      {scanningStratId === strat._id ? <span style={{ animation: "pulse 1s infinite" }}>⏳</span> : "🔍"}
                    </button>
                  </div>
                  {scanError?.stratId === strat._id && scanningStratId !== strat._id && (
                    <div style={{ marginTop: 5, fontSize: 9, color: T.red, background: T.redBg, border: `1px solid ${T.redBdr}`, borderRadius: 4, padding: "3px 7px" }}>⚠ {scanError.msg}</div>
                  )}
                  {running && isSelected && <div style={{ marginTop: 5, fontSize: 9, color: T.blue, fontWeight: 600 }}>✓ Viewing in center panel</div>}
                </div>
              );
            })}
          </div>

          {/* Replay panel */}
          {allBots.length > 0 && (
            <div style={{ borderTop: `1px solid ${T.border}`, padding: 12, background: T.chipBg, flexShrink: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: T.textFaint, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>🔁 Historical Replay</div>
              {!isReplaying ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input type="date" value={replayDateInput} onChange={e => setReplayDateInput(e.target.value)}
                    title="Leave blank for latest trading day"
                    style={{ padding: "5px 8px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.panelBg, color: T.textMid, fontSize: 10, outline: "none" }} />
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <span style={{ fontSize: 9.5, color: T.textFaint }}>Speed:</span>
                    <input type="number" min={1} max={10000} value={replaySpeed} onChange={e => setReplaySpeed(Math.max(1,Number(e.target.value)||1))}
                      style={{ width: 52, padding: "4px 6px", borderRadius: 5, border: `1px solid ${T.blueBdr}`, background: T.panelBg, color: T.blue, fontSize: 12, fontWeight: 800, textAlign: "center", outline: "none" }} />
                    <span style={{ fontSize: 9.5, color: T.textFaint }}>x</span>
                    <div style={{ display: "flex", gap: 3 }}>
                      {[10,100,500].map(s => (
                        <button key={s} onClick={() => setReplaySpeed(s)} style={{ padding: "3px 6px", borderRadius: 4, border: `1px solid ${replaySpeed===s?T.blueBdr:T.border}`, background: replaySpeed===s?T.blueBg:T.panelBg, color: replaySpeed===s?T.blue:T.textFaint, fontSize: 9, fontWeight: 800, cursor: "pointer" }}>{s}x</button>
                      ))}
                    </div>
                  </div>
                  <button id="start-replay-btn" disabled={replayStarting} onClick={startReplay}
                    style={{ padding: "7px 0", borderRadius: 6, border: "none", background: T.purple, color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer", opacity: replayStarting?0.6:1 }}>
                    {replayStarting ? "Starting…" : "▶ Start Replay"}
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 10 }}>
                    <span style={{ color: T.purple, fontWeight: 700 }}>{replay?.simulated_time||"--:--"}</span>
                    <span style={{ color: T.textFaint }}>{replay?.pct}% · {replay?.current}/{replay?.total}</span>
                  </div>
                  <div style={{ height: 4, background: T.border, borderRadius: 2, overflow: "hidden", marginBottom: 6 }}>
                    <div style={{ height: "100%", background: T.purple, width: `${replay?.pct||0}%`, transition: "width 0.5s", borderRadius: 2 }} />
                  </div>
                  <button id="stop-replay-btn" disabled={replayStopping} onClick={stopReplay}
                    style={{ width: "100%", padding: "7px 0", borderRadius: 6, border: `1px solid ${T.redBdr}`, background: T.redBg, color: T.red, fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
                    {replayStopping?"Stopping…":"⏹ Stop Replay"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ══ CENTER: BOT DASHBOARD ════════════════════════════════════ */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", background: T.centerBg }}>
          {selectedBot ? (
            <>
              {/* "What's happening now" banner */}
              <div id="bot-status-banner" style={{
                padding: "14px 20px", borderBottom: `1px solid ${T.border}`, flexShrink: 0,
                background: T.panelBg,
                borderLeft: `4px solid ${botStatusInfo.color}`,
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}>
                <div style={{ fontSize: 9, fontWeight: 800, color: T.textFaint, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 5 }}>What's happening right now</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: botStatusInfo.color, marginBottom: 3, animation: "fadeSlideIn 0.4s ease" }}>{botStatusInfo.headline}</div>
                <div style={{ fontSize: 11, color: T.textLow, lineHeight: 1.5 }}>{botStatusInfo.sub}</div>
              </div>

              {/* Bot tab selector */}
              {allBots.length > 1 && (
                <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, background: T.panelBg, flexShrink: 0 }}>
                  {allBots.map(bot => (
                    <button key={bot.strategy_id} onClick={() => setSelectedBotId(bot.strategy_id)}
                      style={{ flex: 1, padding: "8px 10px", border: "none", borderBottom: `2px solid ${selectedBotId===bot.strategy_id?T.blue:"transparent"}`, background: "transparent", color: selectedBotId===bot.strategy_id?T.blue:T.textFaint, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {bot.strategy_name}
                    </button>
                  ))}
                </div>
              )}

              {/* Scrollable body */}
              <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

                {/* Step indicator */}
                <div style={{ background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 9, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: T.textFaint, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>Bot Lifecycle — Current Stage</div>
                  <BotStepIndicator bot={selectedBot} replay={replay} />
                </div>

                {/* 4 KPI cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                  {[
                    { label: "Portfolio Value", val: `₹${((selectedBot.total_equity??selectedBot.capital)||0).toLocaleString("en-IN",{maximumFractionDigits:0})}`, sub: `Started ₹${selectedBot.capital.toLocaleString("en-IN",{maximumFractionDigits:0})}`, col: T.textHigh },
                    { label: "Available Cash",  val: `₹${(selectedBot.remaining_capital||0).toLocaleString("en-IN",{maximumFractionDigits:0})}`, sub: "Ready to deploy", col: T.blue },
                    { label: "Total P&L",        val: `${(selectedBot.total_pnl??0)>=0?"+":""}₹${Math.abs(selectedBot.total_pnl??0).toFixed(0)}`, sub: `Realized ₹${(selectedBot.realized_pnl??0).toFixed(0)}`, col: (selectedBot.total_pnl??0)>=0?T.green:T.red },
                    { label: "Trades Done",      val: String(selectedBot.trade_count), sub: `${Object.keys(selectedBot.holdings||{}).length} open now`, col: T.purple },
                  ].map(({ label, val, sub, col }) => (
                    <div key={label} style={{ background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 11px", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
                      <div style={{ fontSize: 8.5, color: T.textFaint, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 4 }}>{label}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: col, marginBottom: 2 }}>{val}</div>
                      <div style={{ fontSize: 9, color: T.textFaint }}>{sub}</div>
                    </div>
                  ))}
                </div>

                {/* Condition checker */}
                {((selectedBot.last_entry_conditions?.length||0)>0 || (selectedBot.last_exit_conditions?.length||0)>0) && (
                  <div style={{ background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 9, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: T.textFaint, letterSpacing: 1, textTransform: "uppercase" }}>🎯 Strategy Condition Checker</div>
                      <div style={{ fontSize: 9, color: T.textFaint }}>
                        Evaluating: <span style={{ color: T.blue, fontWeight: 700 }}>{selectedBot.last_evaluated_symbol?.replace(".NS","") || "—"}</span>
                        {selectedBot.last_evaluated_at && <span> @ {selectedBot.last_evaluated_at}</span>}
                      </div>
                    </div>

                    {(selectedBot.last_entry_conditions?.length||0)>0 && (
                      <div style={{ marginBottom: (selectedBot.last_exit_conditions?.length||0)>0 ? 10 : 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: T.green }}>⬆ ENTRY — {selectedBot.config?.entry?.logic||"AND"} logic</span>
                          {selectedBot.entry_matched
                            ? <span style={{ padding: "2px 9px", borderRadius: 10, background: T.greenBg, border: `1px solid ${T.greenBdr}`, fontSize: 9, fontWeight: 800, color: T.green, animation: "pulse 1.2s infinite" }}>✓ ALL PASSED — BUYING NOW</span>
                            : <span style={{ padding: "2px 9px", borderRadius: 10, background: T.chipBg, border: `1px solid ${T.border}`, fontSize: 9, color: T.textFaint }}>{selectedBot.last_entry_conditions?.filter(c=>c.passed).length||0}/{selectedBot.last_entry_conditions?.length||0} conditions met</span>
                          }
                        </div>
                        {(selectedBot.last_entry_conditions||[]).map((c,i) => <CondRow key={i} c={c} />)}
                      </div>
                    )}

                    {(selectedBot.last_exit_conditions?.length||0)>0 && Object.keys(selectedBot.holdings||{}).length>0 && (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: T.red }}>⬇ EXIT — {selectedBot.config?.exit?.logic||"OR"} logic</span>
                          {selectedBot.exit_matched
                            ? <span style={{ padding: "2px 9px", borderRadius: 10, background: T.redBg, border: `1px solid ${T.redBdr}`, fontSize: 9, fontWeight: 800, color: T.red, animation: "pulse 1.2s infinite" }}>⚠ TRIGGERED — SELLING</span>
                            : <span style={{ padding: "2px 9px", borderRadius: 10, background: T.chipBg, border: `1px solid ${T.border}`, fontSize: 9, color: T.textFaint }}>{selectedBot.last_exit_conditions?.filter(c=>c.passed).length||0}/{selectedBot.last_exit_conditions?.length||0} conditions met</span>
                          }
                        </div>
                        {(selectedBot.last_exit_conditions||[]).map((c,i) => <CondRow key={i} c={c} />)}
                      </div>
                    )}
                  </div>
                )}

                {/* Indicator values */}
                {Object.keys(selectedBot.last_indicators||{}).length>0 && (
                  <div style={{ background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 9, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: T.textFaint, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>⚡ Indicator Values</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                      {Object.entries(selectedBot.last_indicators||{}).map(([k,v]) => (
                        <div key={k} style={{ padding: "7px 11px", borderRadius: 7, background: T.chipBg, border: `1px solid ${T.border}`, minWidth: 70, textAlign: "center" }}>
                          <div style={{ fontSize: 8, color: T.textFaint, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>{k}</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: T.textHigh }}>{v !== null && v !== undefined ? Number(v).toFixed(2) : "—"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Open positions */}
                {Object.keys(selectedBot.holdings||{}).length>0 && (
                  <div style={{ background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 9, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: T.textFaint, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
                      📂 Open Positions ({Object.keys(selectedBot.holdings).length})
                      <span style={{ marginLeft: 6, fontSize: 8.5, color: T.textFaint, fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>— prices update every 2s</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {Object.entries(selectedBot.holdings).map(([sym,h]) => {
                        const tick = tickMap[sym]||tickMap[sym.replace(".NS","")]||null;
                        const curP = tick?.ltp || h.avg_price;
                        const unr  = (curP - h.avg_price)*h.qty;
                        const unrPct = h.avg_price>0?((curP-h.avg_price)/h.avg_price)*100:0;
                        const pos = unr>=0;
                        return (
                          <div key={sym} onClick={() => handleStockClick(sym)} style={{ cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 11px", borderRadius: 7, background: pos ? T.greenBg : T.redBg, border: `1px solid ${pos ? T.greenBdr : T.redBdr}` }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 800, color: T.textHigh }}>{sym.replace(".NS","")}</div>
                              <div style={{ fontSize: 9.5, color: T.textLow, marginTop: 2 }}>Bought @ ₹{h.avg_price.toFixed(2)} · {h.qty} shares · Cost ₹{h.cost.toFixed(0)}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 13, fontWeight: 800, color: T.textHigh }}>₹{curP.toFixed(2)}</div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: pos?T.green:T.red }}>{pos?"+":""}₹{unr.toFixed(1)} ({pos?"+":""}{unrPct.toFixed(1)}%)</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Equity curve */}
                <div style={{ background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 9, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: T.textFaint, letterSpacing: 1, textTransform: "uppercase" }}>📈 Equity Curve</div>
                    <div style={{ fontSize: 9, color: T.textFaint }}>Base: ₹{selectedBot.capital.toLocaleString("en-IN",{maximumFractionDigits:0})}</div>
                  </div>
                  <Sparkline data={selectedBot.equity_curve||[]} capital={selectedBot.capital} h={64} />
                </div>

                {/* Signal history */}
                {(selectedBot.signals_history?.length||0)>0 && (
                  <div style={{ background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 9, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: T.textFaint, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>🕐 Signal History (last {Math.min((selectedBot.signals_history?.length||0),8)})</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {(selectedBot.signals_history||[]).slice(0,8).map((s,i) => (
                        <div key={i} onClick={() => handleStockClick(s.symbol)} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 5, background: T.chipBg, border: `1px solid ${T.border}`, animation: i===0?"fadeSlideIn 0.3s ease":undefined }}>
                          <span style={{ fontSize: 10, fontWeight: 800, width: 40, color: s.signal==="BUY"?T.green:s.signal==="SELL"?T.red:T.textFaint, flexShrink: 0 }}>
                            {s.signal==="BUY"?"📈":s.signal==="SELL"?"📉":"⏸"} {s.signal}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: T.textHigh, flex: 1 }}>{s.symbol}</span>
                          <span style={{ fontSize: 10, color: T.textLow }}>₹{s.price.toFixed(2)}</span>
                          <span style={{ fontSize: 9, color: T.textFaint }}>{s.time}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}


                {/* ── LIVE STOCK CHARTS GRID ─────────────────────────── */}
                {botSymbols.length > 0 && (
                  <div style={{ background: T.panelBg, border: `1px solid ${T.border}`, borderRadius: 9, padding: "12px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: showCharts ? 12 : 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 9, fontWeight: 800, color: T.textFaint, letterSpacing: 1, textTransform: "uppercase" }}>📊 Live Stock Charts</span>
                        <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 10, background: T.blueBg, border: `1px solid ${T.blueBdr}`, color: T.blue, fontWeight: 700 }}>{botSymbols.length} symbols</span>
                        {isReplaying && <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 10, background: T.purpleBg, border: `1px solid ${T.purpleBdr}`, color: T.purple, fontWeight: 700, animation: "pulse 1.5s infinite" }}>⏩ Replay</span>}
                      </div>
                      <button
                        onClick={() => setShowCharts(v => !v)}
                        style={{ fontSize: 10, padding: "3px 10px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.chipBg, color: T.textFaint, cursor: "pointer", fontWeight: 600 }}
                      >
                        {showCharts ? "▲ Collapse" : "▼ Expand"}
                      </button>
                    </div>

                    {showCharts && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
                        {botSymbols.map(sym => {
                          const rawSym    = sym;
                          const ticks     = tickHistory[rawSym] || [];
                          const holding   = selectedBot?.holdings?.[`${sym}.NS`] || selectedBot?.holdings?.[sym] || null;
                          const tickEntry = tickMap[`${sym}.NS`] || tickMap[sym] || null;
                          const ltp       = tickEntry?.ltp ?? null;
                          const prevClose = tickEntry?.prev_close ?? null;
                          const isEval    = (selectedBot?.last_evaluated_symbol || "").replace(".NS", "") === sym;
                          const sigHistory = (selectedBot?.signals_history || []).filter(s => s.symbol.replace(".NS", "") === sym);
                          return (
                            <LiveStockMiniChart
                              key={sym}
                              symbol={sym}
                              liveTicks={ticks}
                              signals={sigHistory}
                              holding={holding}
                              isEvaluating={isEval}
                              ltp={ltp}
                              prevClose={prevClose}
                              indicators={isEval ? (selectedBot?.last_indicators || {}) : {}}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

              </div>
            </>
          ) : (
            /* Empty state */
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 52 }}>🤖</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.textMid }}>No Bot Running</div>
              <div style={{ fontSize: 13, color: T.textLow, maxWidth: 360, lineHeight: 1.9 }}>
                Pick a strategy from the sidebar and click <strong style={{ color: T.textHigh }}>Deploy</strong>. The bot will then:<br />
                <span style={{ color: T.green }}>① Seed candle history</span> from Yahoo Finance<br />
                <span style={{ color: T.blue }}>② Monitor the market universe</span> for matching ticks<br />
                <span style={{ color: T.purple }}>③ Evaluate your strategy conditions</span> on each tick<br />
                <span style={{ color: T.amber }}>④ Automatically execute BUY / SELL orders</span>
              </div>
              <div style={{ marginTop: 6, padding: "10px 16px", borderRadius: 8, background: liveWsMode ? T.blueBg : T.greenBg, border: `1px solid ${liveWsMode ? T.blueBdr : T.greenBdr}`, fontSize: 11, color: liveWsMode ? T.blue : T.green, maxWidth: 340 }}>
                {liveWsMode
                  ? "⚡ Live mode: connects to Upstox WS on port 4141 for real-time ticks"
                  : "💾 Simulation: after deploying, use the Replay panel to test on real 1-min candle data"}
              </div>
            </div>
          )}
        </div>

        {/* ══ RIGHT: ACTIVITY FEED ════════════════════════════════════ */}
        <div style={{ borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column", background: T.panelBg, overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: T.textFaint, letterSpacing: 1.2, textTransform: "uppercase" }}>Activity Feed</span>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {allBots.length > 0 && <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#10b981", animation: "pulse 2s infinite" }} />}
              <span style={{ fontSize: 9, color: T.border }}>{logs.length + execs.length} events</span>
            </div>
          </div>

          <div ref={feedRef} style={{ flex: 1, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {(logs.length === 0 && execs.length === 0) ? (
              allBots.length > 0 ? (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "16px 8px", color: T.textFaint, fontSize: 11, lineHeight: 1.7 }}>
                  <span style={{ animation: "pulse 1.5s infinite", flexShrink: 0 }}>⏳</span>
                  <div>
                    <div style={{ fontWeight: 700, color: T.textLow, marginBottom: 3 }}>Waiting for first evaluation…</div>
                    {isReplaying ? "Replay is running — signals will appear here shortly." : "Start Historical Replay from the sidebar, or wait for Upstox live ticks."}
                  </div>
                </div>
              ) : (
                <div style={{ padding: "16px 8px", color: T.border, fontSize: 11, lineHeight: 1.7 }}>Activity appears here once a bot is deployed.</div>
              )
            ) : (
              <>
                {/* Executions — most important, shown first */}
                {execs.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: 8.5, fontWeight: 800, color: T.textFaint, letterSpacing: 1, textTransform: "uppercase", marginBottom: 5, padding: "0 2px" }}>Executed Orders ({execs.length})</div>
                    {execs.slice(0,20).map((ex,i) => (
                      <div key={`ex-${i}`} style={{ padding: "8px 10px", borderRadius: 7, marginBottom: 4, background: ex.action==="BUY"?T.greenBg:T.redBg, border: `1px solid ${ex.action==="BUY"?T.greenBdr:T.redBdr}`, animation: i===0?"fadeSlideIn 0.3s ease":undefined }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: ex.action==="BUY"?T.green:T.red }}>{ex.action==="BUY"?"📈 BUY":"📉 SELL"}</span>
                          <span style={{ fontSize: 11, fontWeight: 800, color: T.textHigh }}>{ex.symbol}</span>
                          <span style={{ marginLeft: "auto", fontSize: 9, color: T.textFaint }}>{ex.executedAt?new Date(ex.executedAt).toLocaleTimeString():""}</span>
                        </div>
                        <div style={{ display: "flex", gap: 8, fontSize: 10, color: T.textLow }}>
                          <span>{ex.quantity} shares</span>
                          <span>@ ₹{Number(ex.price).toFixed(2)}</span>
                          {ex.action==="SELL"&&ex.pnl!==undefined&&<span style={{ marginLeft: "auto", fontWeight: 800, color: (ex.pnl||0)>=0?T.green:T.red }}>{(ex.pnl||0)>=0?"+":""}₹{Number(ex.pnl).toFixed(2)} P&L</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* System logs */}
                {logs.length > 0 && (
                  <div>
                    <div style={{ fontSize: 8.5, fontWeight: 800, color: T.textFaint, letterSpacing: 1, textTransform: "uppercase", marginBottom: 5, padding: "0 2px" }}>System Logs</div>
                    {logs.slice(0,60).map((log,i) => (
                      <div key={`log-${i}`} style={{ padding: "5px 8px", borderRadius: 5, marginBottom: 3, background: logBg(log.level), borderLeft: `2px solid ${logBdr(log.level)}`, animation: i===0?"fadeSlideIn 0.3s ease":undefined }}>
                        <div style={{ display: "flex", gap: 5, alignItems: "flex-start" }}>
                          <span style={{ fontSize: 8, color: T.textFaint, flexShrink: 0, marginTop: 1, fontFamily: "JetBrains Mono,monospace" }}>[{log.time}]</span>
                          <span style={{ fontSize: 9.5, color: logColor(log.level), flex: 1, lineHeight: 1.5, wordBreak: "break-word" }}>{log.message}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Live tick strip */}
          {(atStatus?.last_ticks||[]).length > 0 && (
            <div style={{ borderTop: `1px solid ${T.border}`, padding: "8px 10px", flexShrink: 0, background: T.chipBg }}>
              <div style={{ fontSize: 8.5, fontWeight: 800, color: T.textFaint, letterSpacing: 1, textTransform: "uppercase", marginBottom: 5 }}>Live Ticks</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4 }}>
                {(atStatus?.last_ticks||[]).slice(0,9).map(t => {
                  const chg = t.prev_close ? ((t.ltp-t.prev_close)/t.prev_close)*100 : 0;
                  const up  = chg >= 0;
                  return (
                    <div key={t.symbol} onClick={() => handleStockClick(t.symbol)} style={{ cursor: "pointer", background: up?T.greenBg:T.redBg, border: `1px solid ${up?T.greenBdr:T.redBdr}`, borderRadius: 5, padding: "4px 6px" }}>
                      <div style={{ fontSize: 7.5, color: T.textFaint, fontWeight: 700, marginBottom: 1 }}>{t.raw_symbol||t.symbol.replace(".NS","")}</div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: up?T.green:T.red }}>₹{Number(t.ltp).toFixed(1)}</div>
                      {t.prev_close && <div style={{ fontSize: 7.5, color: up?T.green:T.red }}>{up?"▲":"▼"}{Math.abs(chg).toFixed(1)}%</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
