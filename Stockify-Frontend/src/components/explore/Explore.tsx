import { useNavigate } from "react-router-dom";
import { useContext, useState, useMemo, useEffect, useCallback } from "react";
import paperbulllogo from "../../assets/imageinv.png";
import { useExploreSSE } from "../../context/ExploreSSEContext";
import { AuthContext } from "../../auth/AuthProvider";
import { useWebSocket } from "../../context/WebSocketContext";

import "../../Styles/explore.css";
import "../../Styles/dashboard2.css";

/* ─────────────────────────────────────────────────────────
   MINI SPARKLINE
───────────────────────────────────────────────────────── */
function MiniGraph({ positive }: { positive: boolean }) {
  const points = useMemo(() => generatePoints(positive), [positive]);
  const path = useMemo(() =>
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" "), [points]);
  return (
    <svg width="72" height="28" viewBox="0 0 72 28">
      <path d={path} fill="none"
        stroke={positive ? "#16a34a" : "#dc2626"}
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function generatePoints(positive: boolean) {
  const pts: { x: number; y: number }[] = [];
  let y = positive ? 22 : 6;
  for (let i = 0; i < 9; i++) {
    y = Math.max(3, Math.min(25, y + (Math.random() - 0.5) * 8 + (positive ? -1.2 : 1.2)));
    pts.push({ x: i * 9, y });
  }
  return pts;
}

/* ─────────────────────────────────────────────────────────
   MARKET OVERVIEW CHART  — real intraday SVG line chart
───────────────────────────────────────────────────────── */
function MarketChart({ symbol }: { symbol: string }) {
  const [chartData, setChartData] = useState<{ t: number; v: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const HOST = import.meta.env.VITE_HOST_ADDRESS || "";

  useEffect(() => {
    if (chartData.length === 0) setLoading(true);
    // /api/stocks/:symbol/history?days=1 → Array<{x:timestamp_ms, o, h, l, c}>
    fetch(`${HOST}/api/stocks/${encodeURIComponent(symbol)}/history?days=1`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: { x: number; c: number }[]) => {
        if (!Array.isArray(d) || d.length < 3) {
          setChartData(genFallback(symbol));
          return;
        }
        const pts = d
          .filter(p => typeof p.c === "number" && isFinite(p.c))
          .map(p => ({ t: Math.floor(p.x / 1000), v: p.c }));
        setChartData(pts.length >= 3 ? pts : genFallback(symbol));
      })
      .catch(() => setChartData(genFallback(symbol)))
      .finally(() => setLoading(false));
  }, [symbol, HOST]);

  if (loading && chartData.length === 0) {
    return <div className="mkt-chart-sk" />;
  }

  const W = 420, H = 110;
  const vals = chartData.map(p => p.v);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = maxV - minV || 1;
  const px = (i: number) => (i / (vals.length - 1)) * W;
  const py = (v: number) => H - 8 - ((v - minV) / range) * (H - 20);
  const pathStr = vals.map((v, i) => `${i === 0 ? "M" : "L"} ${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(" ");
  const areaStr = `${pathStr} L ${px(vals.length - 1).toFixed(1)} ${H} L 0 ${H} Z`;
  const isUp = vals[vals.length - 1] >= vals[0];
  const lc = isUp ? "#059669" : "#dc2626";

  // x-axis labels
  const labelCount = 5;
  const xLabels = Array.from({ length: labelCount }, (_, li) => {
    const idx = Math.round((li / (labelCount - 1)) * (chartData.length - 1));
    const d = new Date(chartData[idx].t * 1000);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  });

  const yMid = ((minV + maxV) / 2).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  const yMax = maxV.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  const yMin = minV.toLocaleString("en-IN", { maximumFractionDigits: 0 });

  return (
    <div className="mkt-chart-wrap">
      <div className="mkt-chart-ylabels">
        <span>{yMax}</span>
        <span>{yMid}</span>
        <span>{yMin}</span>
      </div>
      <div className="mkt-chart-main">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mkt-chart-svg">
          <defs>
            <linearGradient id={`ag-${symbol.replace(/[^a-z]/gi, "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lc} stopOpacity="0.18" />
              <stop offset="100%" stopColor={lc} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Grid lines */}
          {[0.25, 0.5, 0.75].map(frac => (
            <line key={frac} x1="0" y1={(H * frac).toFixed(0)} x2={W} y2={(H * frac).toFixed(0)}
              stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="4 4" />
          ))}
          <path d={areaStr} fill={`url(#ag-${symbol.replace(/[^a-z]/gi, "")})`} />
          <path d={pathStr} fill="none" stroke={lc} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          {/* Last point dot */}
          <circle cx={px(vals.length - 1).toFixed(1)} cy={py(vals[vals.length - 1]).toFixed(1)}
            r="4" fill={lc} />
        </svg>
        <div className="mkt-chart-xlabels">
          {xLabels.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      </div>
    </div>
  );
}

function genFallback(symbol: string) {
  let base = symbol.includes("NSEI") ? 23700 :
    symbol.includes("BSESN") ? 76000 :
    symbol.includes("NSEBANK") ? 56600 : 25800;
  const now = Math.floor(Date.now() / 1000);
  return Array.from({ length: 75 }, (_, i) => {
    base += (Math.random() - 0.49) * base * 0.0006;
    return { t: now - (74 - i) * 300, v: Math.round(base * 100) / 100 };
  });
}

/* ─────────────────────────────────────────────────────────
   PORTFOLIO DONUT CHART
───────────────────────────────────────────────────────── */
function DonutChart({ holdings, totalValue }: { holdings: any[]; totalValue: number }) {
  if (!holdings || holdings.length === 0) {
    return <div className="donut-empty">No holdings yet</div>;
  }
  const colors = ["#059669", "#0891b2", "#7c3aed", "#d97706", "#dc2626", "#10b981"];
  const displayHoldings = holdings.slice(0, 5);
  const total = displayHoldings.reduce((s: number, h: any) => s + (h.current || h.price || 0), 0) || totalValue || 1;

  let cumAngle = -90;
  const slices = displayHoldings.map((h: any, i: number) => {
    const val = h.current || h.price || 0;
    const pct = val / total;
    const angle = pct * 360;
    const startA = cumAngle;
    cumAngle += angle;
    const r = 52, cx = 68, cy = 68;
    const s2r = (a: number) => ({ x: cx + r * Math.cos((a * Math.PI) / 180), y: cy + r * Math.sin((a * Math.PI) / 180) });
    const s1 = s2r(startA), e1 = s2r(startA + angle);
    return { h, pct, color: colors[i % colors.length], x1: s1.x, y1: s1.y, x2: e1.x, y2: e1.y, cx, cy, r, lg: angle > 180 ? 1 : 0, angle };
  });

  return (
    <div className="donut-wrap">
      <svg width="136" height="136" viewBox="0 0 136 136">
        {slices.filter(s => s.angle > 0.5).map((s, i) => (
          <path key={i}
            d={`M ${s.cx} ${s.cy} L ${s.x1.toFixed(2)} ${s.y1.toFixed(2)} A ${s.r} ${s.r} 0 ${s.lg} 1 ${s.x2.toFixed(2)} ${s.y2.toFixed(2)} Z`}
            fill={s.color} stroke="#fff" strokeWidth="2.5" />
        ))}
        <circle cx="68" cy="68" r="34" fill="#fff" />
        <text x="68" y="63" textAnchor="middle" fontSize="8" fill="#6b7280" fontWeight="600">Total Value</text>
        <text x="68" y="76" textAnchor="middle" fontSize="9" fill="#0f172a" fontWeight="800">
          ₹{(totalValue / 1000).toFixed(1)}K
        </text>
      </svg>
      <div className="donut-legend">
        {slices.map((s, i) => (
          <div key={i} className="donut-legend-item">
            <span className="donut-dot" style={{ background: s.color }} />
            <span className="donut-lname">{(s.h.name || "").split(" ")[0].toUpperCase()} LTD</span>
            <span className="donut-lpct">{(s.pct * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   MARKET SENTIMENT GAUGE
───────────────────────────────────────────────────────── */
function SentimentGauge({ score }: { score: number }) {
  const clamp = Math.max(0, Math.min(100, score));
  const angle = -135 + (clamp / 100) * 270;
  const rad = (angle * Math.PI) / 180;
  const nx = 75 + 48 * Math.cos(rad);
  const ny = 75 + 48 * Math.sin(rad);
  const label = clamp < 20 ? "Extreme Fear" : clamp < 40 ? "Fear" :
    clamp < 60 ? "Neutral to Bullish" : clamp < 80 ? "Greed" : "Extreme Greed";
  const lc = clamp < 40 ? "#dc2626" : clamp < 60 ? "#6b7280" : "#059669";
  return (
    <div className="gauge-wrap">
      <svg width="150" height="95" viewBox="0 0 150 95">
        {/* Outer arc background */}
        <path d="M 18 78 A 57 57 0 0 1 132 78" fill="none" stroke="#f1f5f9" strokeWidth="13" strokeLinecap="round" />
        {/* Red zone */}
        <path d="M 18 78 A 57 57 0 0 1 75 21" fill="none" stroke="#fca5a5" strokeWidth="13" strokeLinecap="round" />
        {/* Yellow zone */}
        <path d="M 75 21 A 57 57 0 0 1 132 78" fill="none" stroke="#86efac" strokeWidth="13" strokeLinecap="round" />
        {/* Needle */}
        <line x1="75" y1="78" x2={nx.toFixed(1)} y2={ny.toFixed(1)}
          stroke="#1e293b" strokeWidth="2.8" strokeLinecap="round" />
        <circle cx="75" cy="78" r="5" fill="#1e293b" />
        {/* Score */}
        <text x="75" y="65" textAnchor="middle" fontSize="18" fontWeight="900" fill="#0f172a">{clamp}</text>
      </svg>
      <div className="gauge-label" style={{ color: lc }}>{label}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   SKELETON
───────────────────────────────────────────────────────── */
function DashboardSkeleton() {
  return (
    <div className="db2-page">
      <div className="sk-block" style={{ height: 96, borderRadius: 16, marginBottom: 20 }} />
      <div className="db2-grid">
        {[0, 1, 2].map(col => (
          <div key={col}>
            {[120, 300, 180].map((h, i) => (
              <div key={i} className="sk-block" style={{ height: h, borderRadius: 14, marginBottom: 14 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────── */
const fmt = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatTimeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "Just now";
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(diff / 86400000);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}
function slugify(n: string) {
  return n.toLowerCase().trim().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function getStockRoute(symbol: string, name: string) {
  const s = symbol.trim().toUpperCase();
  const slug = slugify(name || "stock");
  if (s.endsWith(".NS") || s.endsWith(".BO") || s.startsWith("^")) return `/stocks/${s}/${slug}`;
  return `/stocks/${s}.NS/${slug}`;
}
function toTitleCase(str: string) {
  if (!str) return "";
  return str.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}
function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening";
}
function getGreetingEmoji() {
  const h = new Date().getHours();
  return h < 12 ? "☀️" : h < 17 ? "👋" : "🌙";
}

const INDEX_CONFIGS = [
  { key: "NIFTY", symbol: "^NSEI", label: "NIFTY 50" },
  { key: "SENSEX", symbol: "^BSESN", label: "SENSEX" },
  { key: "BANKNIFTY", symbol: "^NSEBANK", label: "BANKNIFTY" },
  { key: "FINNIFTY", symbol: "NIFTY_FIN_SERVICE.NS", label: "FINNIFTY" },
];

const UPCOMING_EVENTS = [
  { date: "28", month: "MAY", time: "10:00 AM", title: "RBI Monetary Policy" },
  { date: "31", month: "MAY", time: "06:30 PM", title: "US Core PCE Price Index" },
  { date: "02", month: "JUN", time: "12:00 PM", title: "India GDP Data (Q4)" },
  { date: "05", month: "JUN", time: "06:00 PM", title: "US Non-Farm Payrolls" },
];

/* ═══════════════════════════════════════════════════════════════
   MAIN DASHBOARD  (Explore replaces old view)
═══════════════════════════════════════════════════════════════ */
export default function Explore() {
  const { data, recentData, invested, holdingsSummary, ready } = useExploreSSE();
  const [moverTab, setMoverTab] = useState<"gainers" | "losers">("gainers");
  const [activeIdx, setActiveIdx] = useState(0);
  const [indicesMap, setIndicesMap] = useState<Record<string, { price: number; change: number; percent: number }>>({});
  const { user } = useContext(AuthContext);
  const { lastMessage } = useWebSocket();
  const navigate = useNavigate();

  const HOST = import.meta.env.VITE_HOST_ADDRESS || "";
  const PYTHON_HOST = import.meta.env.VITE_PYTHON_API_URL || "http://localhost:5001";

  const [activeOrders, setActiveOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [news, setNews] = useState<any[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);

  // Auto-rotate index charts every 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setActiveIdx((prev) => (prev + 1) % INDEX_CONFIGS.length);
    }, 5000);
    return () => clearTimeout(timer);
  }, [activeIdx]);

  // Live index data from WebSocket
  useEffect(() => {
    if (!lastMessage || lastMessage.type !== "INDICES_UPDATE") return;
    const arr: any[] = lastMessage.data ?? [];
    setIndicesMap(prev => {
      const next = { ...prev };
      arr.forEach((idx: any) => {
        INDEX_CONFIGS.forEach(cfg => {
          if (cfg.symbol === idx.symbol || cfg.label === idx.label ||
            cfg.key === (idx.label || "").replace(/\s/g, "")) {
            next[cfg.key] = { price: idx.price, change: idx.change, percent: idx.percent };
          }
        });
      });
      return next;
    });
  }, [lastMessage]);

  // Fetch active orders
  useEffect(() => {
    fetch(`${HOST}/api/orders/active`, { credentials: "include" })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setActiveOrders((d?.orders || d?.data || []).slice(0, 3)))
      .catch(() => setActiveOrders([]))
      .finally(() => setOrdersLoading(false));
  }, [HOST]);

  // Fetch news
  useEffect(() => {
    fetch(`${PYTHON_HOST}/api/news?limit=8`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setNews((d.data || []).slice(0, 4)))
      .catch(() => setNews([]))
      .finally(() => setNewsLoading(false));
  }, [PYTHON_HOST]);

  // Image resolver
  const images = import.meta.glob("../../assets/*.{png,jpg,jpeg,svg,webp}", { eager: true });
  const getImageSrc = useCallback((symbol: string): string => {
    const name = symbol.replace(".NS", "");
    const match = Object.keys(images).find(p => p.includes(`/${name}.`));
    return match ? (images[match] as any).default : (images["../../assets/imageinv.png"] as any).default;
  }, []);

  const handleStockClick = (stock: any) => navigate(getStockRoute(stock.symbol, stock.name));

  const portfolioStats = useMemo(() => ({
    currentValue: holdingsSummary?.currentValue ?? 0,
    dayPnl: holdingsSummary?.dayReturns ?? 0,
    dayPnlPct: holdingsSummary?.dayReturnsPercent ?? 0,
    totalReturns: holdingsSummary?.totalReturns ?? 0,
    totalReturnsPct: holdingsSummary?.totalReturnsPercent ?? 0,
    invested: holdingsSummary?.investedValue ?? 0,
  }), [holdingsSummary]);

  if (!ready) return <DashboardSkeleton />;

  const { mostTraded = [], movers = [], losers = [] } = data || {};
  const firstName = user?.displayName?.split(" ")[0] || "Trader";
  const activeCfg = INDEX_CONFIGS[activeIdx];
  const currentMoverList = moverTab === "gainers" ? movers : losers;
  const activePriceData = indicesMap[activeCfg.key];


  return (
    <div className="db2-page">

      {/* ════ HERO STRIP ════ */}
      <div className="db2-hero">
        <div className="db2-hero-left">
          <div>
            <div className="db2-hero-greeting">
              {getGreeting()}, {firstName} {getGreetingEmoji()}
            </div>
            <div className="db2-hero-sub">
              Track markets, analyze trends and make smarter moves
            </div>
          </div>
        </div>

        <div className="db2-hero-stats">
          <div className="db2-stat-card">
            <span className="db2-stat-label">Portfolio Value</span>
            <span className="db2-stat-val">{fmt(portfolioStats.currentValue)}</span>
            <span className={`db2-stat-sub ${portfolioStats.totalReturnsPct >= 0 ? "pos" : "neg"}`}>
              {portfolioStats.totalReturnsPct >= 0 ? "+" : ""}{portfolioStats.totalReturnsPct.toFixed(2)}%
            </span>
          </div>
          <div className="db2-stat-card">
            <span className="db2-stat-label">Today's P&L</span>
            <span className={`db2-stat-val ${portfolioStats.dayPnl >= 0 ? "pos" : "neg"}`}>
              {portfolioStats.dayPnl >= 0 ? "+" : ""}{fmt(portfolioStats.dayPnl)}
            </span>
            <span className={`db2-stat-sub ${portfolioStats.dayPnlPct >= 0 ? "pos" : "neg"}`}>
              {portfolioStats.dayPnlPct.toFixed(2)}%
            </span>
          </div>
          <div className="db2-stat-card">
            <span className="db2-stat-label">Invested</span>
            <span className="db2-stat-val">{fmt(portfolioStats.invested)}</span>
          </div>
          <div className="db2-stat-card">
            <span className="db2-stat-label">Stocks Held</span>
            <span className="db2-stat-val">{invested?.length || 0}</span>
          </div>
          <div className="db2-stat-card">
            <span className="db2-stat-label">Watchlist</span>
            <span className="db2-stat-val">{recentData?.length || 0}</span>
          </div>
        </div>

        <button className="db2-add-funds-btn" onClick={() => navigate("/funds")}>
          + Add Funds
        </button>
      </div>

      {/* ════ 3-COLUMN DASHBOARD GRID ════ */}
      <div className="db2-grid">

        {/* ─── LEFT COLUMN ─── */}
        <div className="db2-col">

          {/* MARKET OVERVIEW */}
          <div className="db2-card">
            <div className="db2-card-header">
              <span className="db2-card-title">Market Overview</span>
              <span className="db2-info-icon" title="Live index data">ⓘ</span>
            </div>

            <div className="mkt-tabs">
              {INDEX_CONFIGS.map((cfg, i) => (
                <button key={cfg.key}
                  className={`mkt-tab${activeIdx === i ? " active" : ""}`}
                  onClick={() => setActiveIdx(i)}>
                  {cfg.label}
                </button>
              ))}
            </div>

            <div className="mkt-price-row">
              <span className="mkt-price-val">
                {activePriceData?.price != null
                  ? activePriceData.price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : "—"}
              </span>
              {activePriceData && (
                <span className={`mkt-price-chg ${activePriceData.percent >= 0 ? "pos" : "neg"}`}>
                  &nbsp;
                  {activePriceData.percent >= 0 ? "+" : ""}
                  {activePriceData.change?.toFixed(2)}&nbsp;
                  ({activePriceData.percent >= 0 ? "+" : ""}{activePriceData.percent?.toFixed(2)}%)
                </span>
              )}
            </div>

            <MarketChart symbol={activeCfg.symbol} />

            <div className="mkt-day-range">
              <span>Day's Range</span>
              <span>
                {activePriceData
                  ? `${(activePriceData.price * 0.995).toLocaleString("en-IN", { maximumFractionDigits: 2 })} – ${(activePriceData.price * 1.005).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
                  : "—"}
              </span>
            </div>
          </div>

          {/* TOP MOVERS */}
          <div className="db2-card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="db2-card-header" style={{ padding: "16px 18px 0" }}>
              <span className="db2-card-title">Top Movers Today</span>
              <div className="mover-toggle">
                <div className={`mover-toggle-active ${moverTab}`}
                  style={{ transform: `translateX(${moverTab === "gainers" ? "0" : "100"}%)` }} />
                <button className={moverTab === "gainers" ? "active" : ""} onClick={() => setMoverTab("gainers")}>Gainers</button>
                <button className={moverTab === "losers" ? "active" : ""} onClick={() => setMoverTab("losers")}>Losers</button>
              </div>
            </div>

            <table className="db2-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Company</th>
                  <th>Price</th>
                  <th>Change (1D)</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {currentMoverList.slice(0, 5).map((m: any, idx: number) => (
                  <tr key={m.symbol} className="db2-table-row" onClick={() => handleStockClick(m)}>
                    <td className="db2-rank">{idx + 1}</td>
                    <td>
                      <div className="db2-co-cell">
                        <img src={new URL(getImageSrc(m.symbol), import.meta.url).href}
                          onError={(e) => (e.currentTarget.src = paperbulllogo)}
                          alt={m.name} className="db2-co-logo" />
                        <div>
                          <div className="db2-co-name">{toTitleCase(m.name)}</div>
                          <div className="db2-co-sym">{m.symbol.replace(".NS", "")}</div>
                        </div>
                      </div>
                    </td>
                    <td className="db2-price-cell">
                      ₹{(m.price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className={`fw6 ${m.percent >= 0 ? "pos" : "neg"}`}>
                      {m.percent >= 0 ? "+" : ""}{(m.percent || 0).toFixed(2)}%
                    </td>
                    <td className="db2-sparkline-cell">
                      <MiniGraph positive={m.percent >= 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="db2-see-all-row">
              <button className="db2-see-all-btn" onClick={() => {}}>
                View all {currentMoverList.length} stocks →
              </button>
            </div>
          </div>

          {/* ACTIVE ORDERS */}
          <div className="db2-card">
            <div className="db2-card-header">
              <span className="db2-card-title">Active Orders</span>
              <span className="db2-link" onClick={() => navigate("/dashboard", { state: { tab: "Orders" } })}>View all</span>
            </div>
            <div className="db2-tab-row">
              <button className="db2-mini-tab active">Open Orders</button>
              <button className="db2-mini-tab" onClick={() => navigate("/dashboard", { state: { tab: "Orders" } })}>Order History</button>
            </div>
            {ordersLoading ? (
              <div>{[1, 2].map(i => <div key={i} className="sk-block" style={{ height: 40, borderRadius: 8, marginBottom: 8 }} />)}</div>
            ) : activeOrders.length === 0 ? (
              <div className="db2-empty-state"><span>📋</span><span>No open orders right now</span></div>
            ) : (
              <div className="db2-orders-list">
                {activeOrders.map((o: any, i: number) => {
                  const side = (o.side || o.transaction_type || "BUY").toUpperCase();
                  return (
                    <div key={i} className="db2-order-row">
                      <span className="db2-order-sym">{(o.symbol || o.tradingsymbol || "").replace(".NS", "")}</span>
                      <span className={`db2-order-side ${side === "BUY" ? "buy" : "sell"}`}>{side}</span>
                      <span className="db2-order-type">{o.type || o.order_type || "Limit"}</span>
                      <span className="db2-order-price">₹{o.price || o.limit_price || o.average_price || "—"}</span>
                      <span className="db2-order-qty">Qty. {o.quantity || o.qty || 0}</span>
                      <span className={`db2-order-status ${(o.status || "open").toLowerCase()}`}>
                        {o.status || "Open"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <button className="db2-place-order-btn"
              onClick={() => navigate("/dashboard", { state: { tab: "Orders" } })}>
              Place New Order →
            </button>
          </div>
        </div>

        {/* ─── MIDDLE COLUMN ─── */}
        <div className="db2-col">

          {/* RECENTLY VIEWED */}
          <div className="db2-card">
            <div className="db2-card-header">
              <span className="db2-card-title">Recently Viewed</span>
              <span className="db2-link">View all</span>
            </div>
            {recentData.length === 0 ? (
              <div className="db2-empty-state"><span>👁️</span><span>No recently viewed stocks</span></div>
            ) : (
              <div className="db2-recent-list">
                {recentData.slice(0, 7).map((r: any) => (
                  <div key={r.symbol} className="db2-recent-item" onClick={() => handleStockClick(r)}>
                    <div className="db2-recent-logo-wrap">
                      <img src={new URL(getImageSrc(r.symbol), import.meta.url).href}
                        alt={r.name} className="db2-recent-img"
                        onError={(e) => (e.currentTarget.src = paperbulllogo)} />
                    </div>
                    <div className="db2-recent-body">
                      <span className="db2-recent-sym">{r.symbol.replace(".NS", "")}</span>
                      <span className="db2-recent-name-sm">{toTitleCase((r.name || "").split(" ").slice(0, 2).join(" "))}</span>
                    </div>
                    <div className="db2-recent-vals">
                      <span className="db2-recent-price">₹{(r.price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                      <span className={`db2-recent-pct ${r.percent >= 0 ? "pos" : "neg"}`}>
                        {r.percent >= 0 ? "+" : ""}{(r.percent || 0).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* MOST TRADED ON PAPERBULL */}
          <div className="db2-card">
            <div className="db2-card-header">
              <span className="db2-card-title">Most Traded on PaperBull</span>
              <span className="db2-link">View all →</span>
            </div>
            <div className="db2-traded-list">
              {mostTraded.slice(0, 5).map((s: any) => {
                const pct = s.percent || 0;
                const price = s.price || 0;
                const chg = Math.abs(price - price / (1 + pct / 100)).toFixed(2);
                return (
                  <div key={s.symbol} className="db2-traded-row" onClick={() => handleStockClick(s)}>
                    <img src={new URL(getImageSrc(s.symbol), import.meta.url).href}
                      onError={(e) => (e.currentTarget.src = paperbulllogo)}
                      alt={s.name} className="db2-traded-logo" />
                    <div className="db2-traded-info">
                      <span className="db2-traded-name">{toTitleCase(s.name)}</span>
                      <span className="db2-traded-sym">{s.symbol.replace(".NS", "")}</span>
                    </div>
                    <div className="db2-traded-right">
                      <span className="db2-traded-price">
                        ₹{price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                      <span className={`db2-traded-chg ${pct >= 0 ? "pos" : "neg"}`}>
                        {pct >= 0 ? "+" : "-"}{chg} ({pct >= 0 ? "+" : ""}{pct.toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI INSIGHTS */}
          <div className="db2-card db2-ai-card">
            <div className="db2-card-header">
              <span className="db2-card-title">
                AI Insights &nbsp;<span className="db2-beta-badge">BETA</span>
              </span>
            </div>
            <div className="db2-ai-body">
              <div className="db2-ai-icon-wrap">🤖</div>
              <p className="db2-ai-text">
                <strong>IT sector</strong> is showing strong momentum with positive earnings outlook.
                Consider watching <strong>INFY</strong>, <strong>TCS</strong> for potential opportunities.
              </p>
            </div>
            <div className="db2-ai-tags">
              <span className="db2-ai-tag bullish">IT Bullish ↑</span>
              <span className="db2-ai-tag neutral">Banking Neutral →</span>
              <span className="db2-ai-tag bearish">FMCG Bearish ↓</span>
            </div>
            <button className="db2-ai-ask-btn" onClick={() => navigate("/news")}>
              Ask AI Assistant ✨
            </button>
          </div>

          {/* UPCOMING EVENTS */}
          <div className="db2-card">
            <div className="db2-card-header">
              <span className="db2-card-title">📅 Upcoming Events</span>
              <span className="db2-link" onClick={() => navigate("/news")}>View Calendar →</span>
            </div>
            <div className="db2-events-grid">
              {UPCOMING_EVENTS.map((ev, i) => (
                <div key={i} className="db2-event-item">
                  <div className="db2-event-date-box">
                    <span className="db2-event-day">{ev.date}</span>
                    <span className="db2-event-month">{ev.month}</span>
                  </div>
                  <div className="db2-event-body">
                    <div className="db2-event-title">{ev.title}</div>
                    <div className="db2-event-time">{ev.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── RIGHT COLUMN ─── */}
        <div className="db2-col">

          {/* YOUR PORTFOLIO */}
          <div className="db2-card">
            <div className="db2-card-header">
              <span className="db2-card-title">Your Portfolio</span>
              <span className="db2-link"
                onClick={() => navigate("/dashboard", { state: { tab: "Holdings" } })}>
                View full portfolio
              </span>
            </div>
            {invested?.length === 0 ? (
              <div className="db2-empty-state"><span>📊</span><span>No investments yet</span></div>
            ) : (
              <>
                <DonutChart holdings={invested} totalValue={portfolioStats.currentValue} />
                <div className="db2-pf-separator" />
                <div className="db2-portfolio-list">
                  {invested.slice(0, 3).map((h: any) => {
                    const pct = h.percent || 0;
                    return (
                      <div key={h.symbol} className="db2-pf-row" onClick={() => handleStockClick(h)}>
                        <img src={new URL(getImageSrc(h.symbol), import.meta.url).href}
                          onError={(e) => (e.currentTarget.src = paperbulllogo)}
                          alt={h.name} className="db2-pf-logo" />
                        <div className="db2-pf-info">
                          <span className="db2-pf-name">{toTitleCase((h.name || "").split(" ").slice(0, 2).join(" "))} LTD</span>
                          <span className="db2-pf-val-inv">₹{(h.current || h.price || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="db2-pf-right">
                          <span className={`db2-pf-pct ${pct >= 0 ? "pos" : "neg"}`}>
                            {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="db2-pf-daypnl">
                  Today's P&L:&nbsp;
                  <span className={portfolioStats.dayPnl >= 0 ? "pos" : "neg"}>
                    {portfolioStats.dayPnl >= 0 ? "+" : ""}{fmt(portfolioStats.dayPnl)}&nbsp;
                    ({portfolioStats.dayPnlPct >= 0 ? "+" : ""}{portfolioStats.dayPnlPct.toFixed(2)}%)
                  </span>
                </div>
              </>
            )}
          </div>

          {/* HOLDINGS SNAPSHOT */}
          <div className="db2-card">
            <div className="db2-card-header">
              <span className="db2-card-title">Holdings Snapshot</span>
              <span className="db2-link"
                onClick={() => navigate("/dashboard", { state: { tab: "Holdings" } })}>
                View Holdings
              </span>
            </div>
            <div className="db2-snap-grid">
              <div className="db2-snap-item">
                <div className="db2-snap-num blue">{invested?.length || 0}</div>
                <div className="db2-snap-lbl">Total Stocks</div>
              </div>
              <div className="db2-snap-item">
                <div className={`db2-snap-num ${portfolioStats.totalReturns >= 0 ? "pos" : "neg"}`}>
                  {portfolioStats.totalReturns >= 0 ? "+" : ""}{fmt(portfolioStats.totalReturns)}
                  <span className="db2-snap-sub">
                    {portfolioStats.totalReturnsPct >= 0 ? "+" : ""}{portfolioStats.totalReturnsPct.toFixed(2)}%
                  </span>
                </div>
                <div className="db2-snap-lbl">Total Returns</div>
              </div>
              <div className="db2-snap-item">
                <div className="db2-snap-num">{fmt(portfolioStats.invested)}</div>
                <div className="db2-snap-lbl">Total Invested</div>
              </div>
              <div className="db2-snap-item">
                <div className="db2-snap-num">{fmt(portfolioStats.currentValue)}</div>
                <div className="db2-snap-lbl">Current Value</div>
              </div>
            </div>
          </div>

          {/* LATEST NEWS */}
          <div className="db2-card">
            <div className="db2-card-header">
              <span className="db2-card-title">Latest News</span>
              <span className="db2-link" onClick={() => navigate("/news")}>View all</span>
            </div>
            {newsLoading ? (
              <div>{[1, 2, 3].map(i => <div key={i} className="sk-block" style={{ height: 56, borderRadius: 8, marginBottom: 8 }} />)}</div>
            ) : news.length === 0 ? (
              <div className="db2-empty-state"><span>📰</span><span>No news available</span></div>
            ) : (
              <div className="db2-news-list">
                {news.map((n: any, i: number) => (
                  <div key={i} className="db2-news-item"
                    onClick={() => n.pdf_url && window.open(n.pdf_url, "_blank")}>
                    <div className="db2-news-cat-bar" />
                    <div className="db2-news-body">
                      <div className="db2-news-meta-row">
                        <span className={`db2-news-cat-badge ${n.category || "other"}`}>
                          {n.category === "corporate_action" ? "Corp Action" :
                           n.category ? n.category.charAt(0).toUpperCase() + n.category.slice(1) : "Markets"}
                        </span>
                        <span className="db2-news-time">{formatTimeAgo(n.announced_at || n.date || "")}</span>
                      </div>
                      <div className="db2-news-headline">{n.headline || n.title || "—"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* MARKET SENTIMENT */}
          <div className="db2-card">
            <div className="db2-card-header">
              <span className="db2-card-title">Market Sentiment ⓘ</span>
              <span className="db2-link" onClick={() => navigate("/news")}>View more</span>
            </div>
            <SentimentGauge score={58} />
            <div className="db2-sentiment-table">
              <div className="db2-sent-row">
                <span className="db2-sent-label">Advance / Decline</span>
                <span className="db2-sent-val">1,256 / 834</span>
              </div>
              <div className="db2-sent-row">
                <span className="db2-sent-label">Put / Call Ratio</span>
                <span className="db2-sent-val">0.89</span>
              </div>
              <div className="db2-sent-row">
                <span className="db2-sent-label">VIX</span>
                <span className="db2-sent-val">
                  13.24 <span className="neg" style={{ fontSize: 11 }}>-2.1%</span>
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
