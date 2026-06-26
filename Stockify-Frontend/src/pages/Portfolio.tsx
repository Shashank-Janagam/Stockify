import { useState, useEffect, useContext, useCallback, useRef } from "react";
import "../Styles/Portfolio.css";
import { AuthContext } from "../auth/AuthProvider";
import { PortfolioThemeProvider, usePortfolioTheme } from "../context/PortfolioThemeContext";
import { Line } from "react-chartjs-2";
import { Link } from "react-router-dom";
import {
  Chart as ChartJS, Tooltip, Legend, CategoryScale, LinearScale,
  PointElement, LineElement, Title, Filler, ArcElement,
} from "chart.js";

// ── Layer components
import Layer2_PerformanceMetrics from "../components/portfolio/Layer2_PerformanceMetrics";
import Layer3_AIForecast         from "../components/portfolio/Layer3_AIForecast";
import Layer4_BullScorePanel     from "../components/portfolio/Layer4_BullScorePanel";
import Layer5_NewsEnrichment     from "../components/portfolio/Layer5_NewsEnrichment";
import Layer6_TradeHistory       from "../components/portfolio/Layer6_TradeHistory";
import Layer7_WalletGuard        from "../components/portfolio/Layer7_WalletGuard";
import Layer8_DailyDigest        from "../components/portfolio/Layer8_DailyDigest";

// Sub-pages (embedded as tabs)
import HoldingsPage  from "../components/portfolio/HoldingsPage";
import PositionsPage from "../components/portfolio/PositionsPage";
import OrderHistory  from "../components/portfolio/OrderHistory";

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler, ArcElement,
);

/* ── Types ── */
type Summary = {
  currentInvested: number; currentValue: number;
  currentReturnsPercent: number;
  totalInvested: number; totalValue: number;
  totalReturnsPercent: number;
  realizedPnL?: number; monthlyRealizedPnL?: number;
};
type LiveStats = {
  currentValue: number; currentInvested: number;
  unrealisedPnL: number; unrealisedPc: number;
  dayChange: number; dayChangePercent: number;
  realizedPnL: number; updatedAt: string;
};
type Holding = {
  symbol: string; name: string; quantity: number;
  currentPrice: number; dayChangePercent: number;
  invested: number; current: number;
  pnl: number; pnlPercent: number;
};
type AiEval = {
  bullScore: number; winRate: number; sharpeRatio: number;
  dynamicCap: number; totalTrades: number; totalClosed: number;
  maxDrawdown?: number; avgHoldTime?: string;
};
type ChartPoint = { date: string; value: number };
type Order = {
  id: string; symbol: string; name: string;
  side: "BUY" | "SELL"; quantity: number;
  price: number | null; total_price: number | null;
  realized_pnl?: string | number | null;
  created_at_ist: string; executed_at_ist?: string | null;
  updated_at_ist?: string | null;
};

type Tab = "overview" | "holdings" | "positions" | "orders";
const TIME_RANGES = ["1W","1M","6M","1Y","ALL"] as const;

const HOST = import.meta.env.VITE_HOST_ADDRESS || "";
const LIVE_POLL_MS = 60_000; // 60 s

const fmt = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return "—"; }
}

/* ═══════════════════════════════════════════════════════════════
   PORTFOLIO PAGE — 8-Layer Command Center
═══════════════════════════════════════════════════════════════ */
const PortfolioInner = () => {
  const { user } = useContext(AuthContext);
  const { theme, toggle } = usePortfolioTheme();

  /* ── State ── */
  const [summary,   setSummary]   = useState<Summary | null>(null);
  const [liveStats, setLiveStats] = useState<LiveStats | null>(null);
  const [holdings,  setHoldings]  = useState<Holding[]>([]);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [aiEval,    setAiEval]    = useState<AiEval | null>(null);
  const [orders,    setOrders]    = useState<Order[]>([]);
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);

  /* Recompute state */
  const [recomputing,     setRecomputing]     = useState(false);
  const [lastRecomputed,  setLastRecomputed]  = useState<string | null>(null);
  const [recomputeMsg,    setRecomputeMsg]    = useState<string>("");

  const [tab,       setTab]       = useState<Tab>("overview");
  const [timeRange, setTimeRange] = useState("1M");
  const liveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Live stats fetch (always fresh, no cache) ── */
  const fetchLiveStats = useCallback(async () => {
    if (!user) return;
    try {
      const r = await fetch(`${HOST}/api/portfolio/live-stats`, { credentials: "include" });
      if (r.ok) setLiveStats(await r.json());
    } catch {}
  }, [user]);

  /* ── Cached data fetch (summary + ai-eval + orders + forecasts) ── */
  const fetchCached = useCallback(async (fresh = false) => {
    if (!user) return;
    try {
      const suffix = fresh ? "?fresh=1" : "";
      const [resSum, resAi, resOrders, resForecasts] = await Promise.allSettled([
        fetch(`${HOST}/api/portfolio/summary${suffix}`,  { credentials: "include" }),
        fetch(`${HOST}/api/portfolio/ai-eval${suffix}`,  { credentials: "include" }),
        fetch(`${HOST}/api/holdings/orders?page=1&limit=50`, { credentials: "include" }),
        fetch(`${HOST}/api/portfolio/forecasts${suffix}`, { credentials: "include" }),
      ]);

      if (resSum.status === "fulfilled" && resSum.value.ok) {
        const d = await resSum.value.json();
        if (d.summary)   setSummary(d.summary);
        if (d.holdings)  setHoldings(d.holdings);
        if (d.chartData) setChartData(d.chartData);
      }
      if (resAi.status === "fulfilled" && resAi.value.ok) {
        setAiEval(await resAi.value.json());
      }
      if (resOrders.status === "fulfilled" && resOrders.value.ok) {
        setOrders(await resOrders.value.json());
      }
      if (resForecasts.status === "fulfilled" && resForecasts.value.ok) {
        setForecasts(await resForecasts.value.json());
      }
    } catch (e) {
      console.error("Portfolio cached fetch:", e);
    }
  }, [user]);

  /* ── Initial load ── */
  const initialLoad = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchCached(false), fetchLiveStats()]);
    setLoading(false);
  }, [fetchCached, fetchLiveStats]);

  useEffect(() => { initialLoad(); }, [initialLoad]);

  /* ── Live polling every 60 s ── */
  useEffect(() => {
    if (!user) return;
    liveTimerRef.current = setInterval(fetchLiveStats, LIVE_POLL_MS);
    return () => { if (liveTimerRef.current) clearInterval(liveTimerRef.current); };
  }, [user, fetchLiveStats]);

  /* ── RECOMPUTE — bust Redis + refetch everything ── */
  const handleRecompute = useCallback(async () => {
    if (recomputing) return;
    setRecomputing(true);
    setRecomputeMsg("Busting Redis cache…");
    try {
      await fetch(`${HOST}/api/portfolio/invalidate-cache`, {
        method: "POST", credentials: "include",
      });
      setRecomputeMsg("Fetching fresh data…");
      await Promise.all([fetchCached(true), fetchLiveStats()]);
      const now = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setLastRecomputed(now);
      setRecomputeMsg(`Recomputed at ${now}`);
    } catch (e) {
      setRecomputeMsg("Recompute failed — try again");
    } finally {
      setRecomputing(false);
      setTimeout(() => setRecomputeMsg(""), 4000);
    }
  }, [recomputing, fetchCached, fetchLiveStats]);

  /* ── Derive hero numbers — live stats take priority over cached summary ── */
  const currVal      = liveStats?.currentValue     ?? summary?.currentValue     ?? 0;
  const unrealisedPL = liveStats?.unrealisedPnL    ?? (currVal - (summary?.currentInvested ?? 0));
  const unrealisedPc = liveStats?.unrealisedPc     ?? summary?.currentReturnsPercent ?? 0;
  const realisedPL   = liveStats?.realizedPnL      ?? summary?.realizedPnL      ?? 0;
  const dayChange    = liveStats?.dayChange        ?? 0;
  const liveUpdatedAt= liveStats?.updatedAt        ?? null;

  /* ── Chart ── */
  const getFilteredData = () => {
    const d = new Date();
    let cutoff = new Date(0);
    switch (timeRange) {
      case "1W": cutoff = new Date(d.setDate(d.getDate() - 7)); break;
      case "1M": cutoff = new Date(d.setMonth(d.getMonth() - 1)); break;
      case "6M": cutoff = new Date(d.setMonth(d.getMonth() - 6)); break;
      case "1Y": cutoff = new Date(d.setFullYear(d.getFullYear() - 1)); break;
    }
    const f = chartData.filter(item => {
      if (!item.date) return false;
      const dt = new Date(item.date);
      return !isNaN(dt.getTime()) && dt >= cutoff;
    });
    return f.length > 0 ? f : chartData.slice(-1).filter(i => !isNaN(new Date(i.date).getTime()));
  };

  const filteredPD = getFilteredData();
  const firstVal   = filteredPD[0]?.value ?? 0;
  const lastVal    = filteredPD[filteredPD.length - 1]?.value ?? 0;
  const chartUp    = lastVal >= firstVal;
  const chartColor = chartUp ? "#10d48e" : "#f04444";

  const performanceData = {
    labels: filteredPD.map(d =>
      new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    ),
    datasets: [{
      label: "Portfolio Value",
      data: filteredPD.map(d => d.value),
      fill: true,
      backgroundColor: (ctx: any) => {
        const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 220);
        g.addColorStop(0, chartColor + "33");
        g.addColorStop(1, chartColor + "00");
        return g;
      },
      borderColor: chartColor, tension: 0.3,
      pointRadius: chartData.length > 30 ? 0 : 2,
      pointHoverRadius: 5, borderWidth: 2.5,
    }],
  };

  const performanceOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: "index" as const, intersect: false,
        backgroundColor: "#1e293b", titleColor: "#f1f5f9", bodyColor: "#94a3b8",
        borderColor: "rgba(255,255,255,0.07)", borderWidth: 1, padding: 12, displayColors: false,
        callbacks: {
          label: (ctx: any) => {
            const val = Number(ctx.parsed.y);
            return isNaN(val) ? "—" : `₹${val.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
          },
        },
      },
    },
    scales: { x: { display: false }, y: { display: false } },
    interaction: { mode: "nearest" as const, axis: "x" as const, intersect: false },
  };

  /* ── Tab counts ── */
  const tabCounts: Record<Tab, number | undefined> = {
    overview:  undefined, holdings: holdings.length,
    positions: undefined, orders:   orders.length,
  };

  /* ── Layer section renderer ── */
  const LayerCard = ({
    num, title, sub, children,
  }: { num: string; title: string; sub: string; children: React.ReactNode }) => (
    <div className="pc-layer">
      <div className="pc-layer-header">
        <div className={`pc-layer-badge pc-badge-${num}`}>{num}</div>
        <div>
          <h2 className="pc-layer-title">{title}</h2>
          <p className="pc-layer-sub">{sub}</p>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span className="pc-live-dot" />
        </div>
      </div>
      <div className="pc-layer-body">{children}</div>
    </div>
  );

  /* ── Initial loading spinner ── */
  if (loading && !summary && !liveStats) {
    return (
      <div className="pc-page" data-pc-theme={theme}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
          <div style={{
            width: 56, height: 56, border: "3px solid rgba(99,102,241,0.3)",
            borderTopColor: "#6366f1", borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--pc-text-2)" }}>
            Loading AI Portfolio Engine…
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div className="pc-page" data-pc-theme={theme}>

      {/* ══════════════════════════════════════
          HERO — Layer 1: Core Holdings Snapshot
      ══════════════════════════════════════ */}
      <div className="pc-hero">
        <div className="pc-hero-top">
          <div className="pc-hero-title-block">
            <div className="pc-hero-label">AI Portfolio Engine</div>
            <h1 className="pc-hero-name">Portfolio Command Center</h1>
            <p className="pc-hero-sub">8-layer AI intelligence · Live P&L · Groq-powered insights</p>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>

            {/* ── RECOMPUTE BUTTON ── */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <button
                className="pc-recompute-btn"
                onClick={handleRecompute}
                disabled={recomputing}
                title="Bust Redis cache and recompute all portfolio metrics from live data"
              >
                <span
                  className={recomputing ? "pc-spin-icon" : ""}
                  style={{ display: "inline-block", fontSize: 14 }}
                >⟳</span>
                {recomputing ? "Recomputing…" : "Recompute"}
              </button>
              {recomputeMsg && (
                <span style={{ fontSize: 10, color: recomputeMsg.includes("fail") ? "var(--pc-red)" : "var(--pc-green)", fontWeight: 600 }}>
                  {recomputeMsg}
                </span>
              )}
              {lastRecomputed && !recomputeMsg && (
                <span style={{ fontSize: 10, color: "var(--pc-text-3)", fontWeight: 500 }}>
                  Last: {lastRecomputed}
                </span>
              )}
            </div>

            {/* Theme toggle */}
            <button
              className="pc-theme-toggle"
              onClick={toggle}
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </button>

            <Link to="/user/balance" style={{
              padding: "9px 18px", borderRadius: 9,
              background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.25)",
              color: "var(--pc-blue-bright)", fontSize: 13, fontWeight: 600,
              textDecoration: "none", transition: "all 0.15s",
            }}>Funds & Wallet</Link>
          </div>
        </div>

        {/* ── Live indicator bar ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          marginBottom: 16, padding: "7px 14px", borderRadius: 8,
          background: "rgba(16,212,142,0.06)", border: "1px solid rgba(16,212,142,0.12)",
          width: "fit-content",
        }}>
          <span className="pc-live-dot" />
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--pc-green)" }}>LIVE</span>
          <span style={{ fontSize: 11, color: "var(--pc-text-2)" }}>
            Layer 1 hero numbers update every 60 s from market prices
            {liveUpdatedAt && ` · last updated ${fmtTime(liveUpdatedAt)}`}
          </span>
          <span style={{ fontSize: 10, color: "var(--pc-text-3)", marginLeft: 4 }}>
            · Layers 2–8 cached 1 hr (use Recompute to refresh)
          </span>
        </div>

        {/* Stat Chips — powered by live-stats */}
        <div className="pc-hero-stats">
          <div className={`pc-stat-chip ${unrealisedPL >= 0 ? "pc-chip-green" : "pc-chip-red"}`}>
            <div className="pc-stat-chip-label">Portfolio Value <span className="pc-live-chip-badge">LIVE</span></div>
            <div className="pc-stat-chip-val">{fmt(currVal)}</div>
            <div className="pc-stat-chip-sub">
              <span style={{ color: unrealisedPL >= 0 ? "var(--pc-green)" : "var(--pc-red)", fontWeight: 700 }}>
                {unrealisedPL >= 0 ? "+" : ""}{unrealisedPc.toFixed(2)}%
              </span>
              {" "}unrealised
            </div>
          </div>

          <div className={`pc-stat-chip ${unrealisedPL >= 0 ? "pc-chip-green" : "pc-chip-red"}`}>
            <div className="pc-stat-chip-label">Unrealised P&L <span className="pc-live-chip-badge">LIVE</span></div>
            <div className="pc-stat-chip-val">
              {unrealisedPL >= 0 ? "+" : ""}{fmt(Math.abs(unrealisedPL))}
            </div>
            <div className="pc-stat-chip-sub">vs avg buy cost</div>
          </div>

          <div className="pc-stat-chip pc-chip-blue">
            <div className="pc-stat-chip-label">Realised P&L <span className="pc-live-chip-badge">LIVE</span></div>
            <div className="pc-stat-chip-val">{fmt(realisedPL)}</div>
            <div className="pc-stat-chip-sub">all-time closed trades</div>
          </div>

          <div className={`pc-stat-chip ${dayChange >= 0 ? "pc-chip-green" : "pc-chip-red"}`}>
            <div className="pc-stat-chip-label">Intraday Delta <span className="pc-live-chip-badge">LIVE</span></div>
            <div className="pc-stat-chip-val">
              {dayChange >= 0 ? "+" : ""}{fmt(Math.abs(dayChange))}
            </div>
            <div className="pc-stat-chip-sub">today's movement</div>
          </div>
        </div>

        {/* Equity Curve */}
        <div className="pc-chart-section">
          <div className="pc-chart-top">
            <div>
              <div className="pc-chart-title">Realized Performance Curve</div>
              {filteredPD.length > 0 && (
                <div style={{ fontSize: 12, color: chartUp ? "var(--pc-green)" : "var(--pc-red)", fontWeight: 600, marginTop: 2 }}>
                  {chartUp ? "▲" : "▼"} {Math.abs(((lastVal - firstVal) / (firstVal || 1)) * 100).toFixed(2)}% over period
                </div>
              )}
            </div>
            <div className="pc-time-pills">
              {TIME_RANGES.map(t => (
                <button key={t} className={`pc-time-pill${timeRange === t ? " active" : ""}`}
                  onClick={() => setTimeRange(t)}>{t}</button>
              ))}
            </div>
          </div>
          {filteredPD.length > 0 ? (
            <div className="pc-chart-wrap">
              <Line data={performanceData} options={performanceOptions} />
            </div>
          ) : (
            <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--pc-text-2)", fontSize: 13 }}>
              No chart data yet — make your first trade to see the equity curve
            </div>
          )}
        </div>

        {/* Tab Nav */}
        <div className="pc-tab-nav">
          {(["overview","holdings","positions","orders"] as Tab[]).map(t => {
            const labels: Record<Tab,string> = {
              overview: "Overview", holdings: "Holdings",
              positions: "Positions", orders: "Orders",
            };
            return (
              <button key={t}
                className={`pc-tab-btn${tab === t ? " pc-tab-active" : ""}`}
                onClick={() => setTab(t)}
              >
                {labels[t]}
                {tabCounts[t] != null && <span className="pc-tab-count">{tabCounts[t]}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════
          TAB CONTENT
      ══════════════════════════════════════ */}
      <div className="pc-main">

        {tab === "holdings"  && <div className="pc-layer"><div className="pc-layer-body" style={{ padding: 0 }}><HoldingsPage /></div></div>}
        {tab === "positions" && <div className="pc-layer"><div className="pc-layer-body" style={{ padding: 0 }}><PositionsPage /></div></div>}
        {tab === "orders"    && <div className="pc-layer"><div className="pc-layer-body" style={{ padding: 0 }}><OrderHistory /></div></div>}

        {tab === "overview" && (
          <>
            {/* LAYER 2 — Performance Metrics */}
            <LayerCard num="2" title="Performance Metrics"
              sub="Win rate · Sharpe ratio · Max drawdown · Avg hold time">
              <Layer2_PerformanceMetrics
                winRate={aiEval?.winRate ?? 0} sharpeRatio={aiEval?.sharpeRatio ?? 0}
                maxDrawdown={aiEval?.maxDrawdown} avgHoldTime={aiEval?.avgHoldTime}
                totalClosed={aiEval?.totalClosed ?? 0} loading={loading}
              />
            </LayerCard>

            {/* LAYER 3 — AI Forecast */}
            <LayerCard num="3" title="AI Forecast — Per Holding"
              sub="LSTM price target + uncertainty band · Groq BUY / HOLD / EXIT signal">
              <Layer3_AIForecast holdings={holdings} forecasts={forecasts} loading={loading} />
            </LayerCard>

            {/* LAYER 4 — Bull Score + Risk */}
            <LayerCard num="4" title="Bull Score & Risk Panel"
              sub="Composite quality score · Sector weights · Concentration risk">
              <Layer4_BullScorePanel
                bullScore={aiEval?.bullScore ?? 0} winRate={aiEval?.winRate ?? 0}
                sharpeRatio={aiEval?.sharpeRatio ?? 0} totalClosed={aiEval?.totalClosed ?? 0}
                dynamicCap={aiEval?.dynamicCap ?? 0}
                holdings={holdings.map(h => ({ symbol: h.symbol, name: h.name, invested: h.invested, current: h.current }))}
                loading={loading}
              />
            </LayerCard>

            {/* LAYER 5 — News Enrichment */}
            <LayerCard num="5" title="News & Sentiment — BSE/NSE Enrichment"
              sub="Holding-linked announcements · Groq sentiment scoring · 3-line LLM summaries">
              <Layer5_NewsEnrichment
                holdings={holdings.map(h => ({ symbol: h.symbol, name: h.name }))} loading={loading} />
            </LayerCard>

            {/* LAYER 6 — Trade History & Analytics */}
            <LayerCard num="6" title="Trade History & Analytics"
              sub="Equity curve · Closed P&L per trade · Win/loss streak tracker">
              <Layer6_TradeHistory chartData={chartData} orders={orders} loading={loading} />
            </LayerCard>

            {/* LAYER 7 — AI Wallet Guard */}
            <LayerCard num="7" title="AI Wallet Guard"
              sub="Hard-rule checks (sync) · Groq ALLOW / WARN / SOFT_BLOCK verdict · Dynamic cap">
              <Layer7_WalletGuard
                dynamicCap={aiEval?.dynamicCap ?? 0} winRate={aiEval?.winRate ?? 0} loading={loading} />
            </LayerCard>

            {/* LAYER 8 — AI Daily Digest */}
            <LayerCard num="8" title="AI Daily Digest & Portfolio Coach"
              sub="Morning brief · Rebalance nudge · Post-trade learning feedback">
              <Layer8_DailyDigest
                holdings={holdings.map(h => ({ symbol: h.symbol, name: h.name }))} loading={loading} />
            </LayerCard>

            {/* Footer */}
            <div style={{
              textAlign: "center", fontSize: 11, color: "var(--pc-text-3)",
              paddingTop: 8, borderTop: "1px solid var(--pc-border)",
            }}>
              ⚡ PaperBull AI Portfolio Engine · LSTM model · Groq Llama-3.3-70b · BSE/NSE ingestion pipeline
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const Portfolio = () => (
  <PortfolioThemeProvider>
    <PortfolioInner />
  </PortfolioThemeProvider>
);

export default Portfolio;
