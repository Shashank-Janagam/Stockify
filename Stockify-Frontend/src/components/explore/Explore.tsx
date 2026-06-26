import { useNavigate } from "react-router-dom";
import { useContext, useState, useMemo, useEffect } from "react";
import paperbulllogo from "../../assets/imageinv.png";
import { useExploreSSE } from "../../context/ExploreSSEContext";
import { AuthContext } from "../../auth/AuthProvider";

import "../../Styles/explore.css";
import "../../Styles/NewsPage.css";


/* ── Mini Sparkline Graph ── */
function MiniGraph({ positive }: { positive: boolean }) {
  const points = useMemo(() => generatePoints(positive), [positive]);

  const path = useMemo(() => {
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");
  }, [points]);

  return (
    <svg width="80" height="34" viewBox="0 0 80 34">
      <path
        d={path}
        fill="none"
        stroke={positive ? "#16a34a" : "#dc2626"}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="graph-line"
      />
    </svg>
  );
}

function generatePoints(positive: boolean) {
  const points = [];
  let y = positive ? 25 : 9;

  for (let i = 0; i < 10; i++) {
    const swing = (Math.random() - 0.5) * 9;
    const drift = positive ? -1.5 : 1.5;

    y += swing + drift;
    y = Math.max(4, Math.min(30, y));

    points.push({
      x: i * 8,
      y,
    });
  }

  if (points.length > 0) {
    if (positive) points[points.length - 1].y = Math.min(points[points.length - 1].y, 14);
    else points[points.length - 1].y = Math.max(points[points.length - 1].y, 20);
  }

  return points;
}

/* ── Skeleton Loader ── */
function ExploreSkeleton() {
  return (
    <div className="explore-page">
      {/* Welcome skeleton */}
      <div className="welcome-strip" style={{ minHeight: '80px' }}>
        <div className="welcome-left">
          <div className="sk" style={{ width: '200px', height: '20px', borderRadius: '8px' }} />
          <div className="sk" style={{ width: '140px', height: '12px', borderRadius: '6px', marginTop: '6px' }} />
        </div>
        <div className="welcome-stats">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="stat-card">
              <div className="sk" style={{ width: '60px', height: '10px' }} />
              <div className="sk" style={{ width: '90px', height: '16px', marginTop: '6px' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Recently viewed skeleton */}
      <section className="section">
        <h2><span className="section-icon">🕐</span> Recently viewed</h2>
        <div className="recent-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="recent-item" style={{ padding: '8px 16px', gap: '8px' }}>
              <div className="sk sk-avatar" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
              <div className="sk" style={{ width: '60px', height: '12px' }} />
              <div className="sk" style={{ width: '40px', height: '12px' }} />
            </div>
          ))}
        </div>
      </section>

      {/* Bento grid skeleton */}
      <div className="bento-grid">
        <div>
          <section className="section">
            <h2><span className="section-icon">📈</span> Most traded stocks</h2>
            <div className="card-grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="stock-card" style={{ minHeight: '140px' }}>
                  <div className="sk sk-icon" />
                  <div className="sk sk-text" style={{ marginTop: '12px' }} />
                  <div className="sk sk-text small" />
                  <div className="sk sk-text small" />
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="right-panel">
          <div className="investment-box">
            <div className="sk sk-box" />
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ── Helpers ── */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getStockRoute(symbol: string, name: string) {
  const symbol1 = symbol.trim().toUpperCase();
  const slug = slugify(name);

  if (symbol1.endsWith(".NS") || symbol1.endsWith(".BO") || symbol1.startsWith("^")) {
    return `/stocks/${symbol1}/${slug}`;
  }

  return `/us/${symbol1}/${slug}`;
}

function toTitleCase(str: string) {
  if (!str) return "";
  return str.split(" ").map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
}

/* ── Time-based greeting ── */
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/* ══════════════════════════════════════════
   MAIN EXPLORE COMPONENT
══════════════════════════════════════════ */
export default function Explore() {
  const { data, recentData, invested, holdingsSummary, ready } = useExploreSSE();
  const [moverTab, setMoverTab] = useState<"gainers" | "losers">("gainers");
  const [moverExpanded, setMoverExpanded] = useState(false);
  const { user } = useContext(AuthContext);

  const navigate = useNavigate();

  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);

  const PYTHON_HOST = import.meta.env.VITE_PYTHON_API_URL || "http://localhost:5001";

  useEffect(() => {
    let active = true;
    fetch(`${PYTHON_HOST}/api/news?limit=20`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        if (active) {
          const rawList = data.data || [];
          // Prioritize announcements with key categories or non-neutral sentiments
          const prioritized = [...rawList].sort((a, b) => {
            const isHighA = ["result", "dividend", "buyback", "corporate_action"].includes(a.category) || a.sentiment !== "neutral";
            const isHighB = ["result", "dividend", "buyback", "corporate_action"].includes(b.category) || b.sentiment !== "neutral";
            if (isHighA && !isHighB) return -1;
            if (!isHighA && isHighB) return 1;
            return 0;
          });
          setAnnouncements(prioritized);
        }
      })
      .catch((err) => {
        console.error("Explore news fetch error:", err);
      })
      .finally(() => {
        if (active) setNewsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [PYTHON_HOST]);

  const images = import.meta.glob(
    "../../assets/*.{png,jpg,jpeg,svg,webp}",
    { eager: true }
  );

  const getImageSrc = (symbol: string): string => {
    const name = symbol.replace(".NS", "");

    const match = Object.keys(images).find(path =>
      path.includes(`/${name}.`)
    );

    return match
      ? (images[match] as any).default
      : (images["../../assets/imageinv.png"] as any).default;
  };

  const handleStockClick = (stock: any) => {
    navigate(getStockRoute(stock.symbol, stock.name));
  };

  const portfolioStats = useMemo(() => {
    const currentValue = holdingsSummary?.currentValue ?? 0;
    const dayPnl = holdingsSummary?.dayReturns ?? 0;
    const dayPnlPct = holdingsSummary?.dayReturnsPercent ?? 0;
    return { currentValue, dayPnl, dayPnlPct };
  }, [holdingsSummary]);

  if (!ready) return <ExploreSkeleton />;

  const { mostTraded, movers, losers } = data;

  const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const firstName = user?.displayName?.split(" ")[0] || "Trader";

  return (
    <div className="explore-page">
      {/* ══════════════════════════════════════════
          WELCOME HERO STRIP
      ══════════════════════════════════════════ */}
      <div className="welcome-strip reveal reveal-d1">
        <div className="welcome-left">
          <div className="welcome-greeting">{getGreeting()}, {firstName}</div>
          <div className="welcome-sub">
            <span className="live-dot" />
            Markets are live · PaperBull Command Center
          </div>
        </div>

        <div className="welcome-stats">
          <div className="stat-card">
            <span className="stat-label">Portfolio Value</span>
            <span className="stat-value">{fmt(portfolioStats.currentValue)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Today's P&L</span>
            <span className={`stat-value ${portfolioStats.dayPnl >= 0 ? 'stat-pos' : 'stat-neg'}`}>
              {portfolioStats.dayPnl >= 0 ? '+' : ''}{fmt(portfolioStats.dayPnl)}
            </span>
            <span className={`stat-sub ${portfolioStats.dayPnlPct >= 0 ? 'stat-pos' : 'stat-neg'}`}>
              {portfolioStats.dayPnlPct >= 0 ? '+' : ''}{portfolioStats.dayPnlPct.toFixed(2)}%
            </span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Stocks Held</span>
            <span className="stat-value">{invested?.length || 0}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Watchlist</span>
            <span className="stat-value">{recentData?.length || 0}</span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          RECENTLY VIEWED — Full Width
      ══════════════════════════════════════════ */}
      <section className="section reveal reveal-d2">
        <h2 className="section-title-groww">Recently viewed</h2>
        <div className="recent-grid">
          {recentData.map((r: any) => (
            <div
              key={r.symbol}
              className="recent-item clickable"
              onClick={() => handleStockClick(r)}
            >
              <img
                src={new URL(getImageSrc(r.symbol), import.meta.url).href}
                alt={r.name}
              />
              <span className="recent-name"> {toTitleCase(r.name)}</span>
              <span className={r.percent > 0 ? "pos" : "neg"}>
                {r.percent > 0 ? "+" : ""}
                {r.percent}%
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════════════════════════════════════
          GROWW 2-COLUMN DASHBOARD GRID
      ══════════════════════════════════════════ */}
      <div className="groww-dashboard-grid">
        {/* ── LEFT COLUMN ── */}
        <div className="groww-left-col">
          {/* MOST TRADED */}
          <section className="section reveal reveal-d3">
            <h2 className="section-title-groww">Most traded stocks on PaperBull</h2>
            <div className="groww-cards">
              {mostTraded.slice(0, 4).map((s: any) => {
                const price = s.price || 0;
                const percent = s.percent || 0;
                const changeAbs = Math.abs(price - (price / (1 + percent / 100))).toFixed(2);
                const displayName = toTitleCase(s.name);

                return (
                  <div key={s.symbol} className="groww-card clickable" onClick={() => handleStockClick(s)}>
                    <div className="groww-logo-box">
                      <img src={new URL(`${getImageSrc(s.symbol)}`, import.meta.url).href} alt={s.name} />
                    </div>
                    <div className="groww-name">{displayName}</div>
                    <div className="groww-bottom">
                      <div className="groww-price">₹{price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      <div className={`groww-change ${percent >= 0 ? "pos" : "neg"}`}>
                        {percent >= 0 ? "" : "-"}{changeAbs} ({Math.abs(percent).toFixed(2)}%)
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* TOP MOVERS */}
          <section className="section movers-section reveal reveal-d4">
            <div className="section-header-row">
              <h2 className="section-title-groww">
                {moverTab === "gainers" ? "Top movers today" : "Top losers today"}
              </h2>

              <div className="mover-toggle">
                <div
                  className={`mover-toggle-active ${moverTab}`}
                  style={{ transform: `translateX(${moverTab === "gainers" ? "0" : "100"}%)` }}
                />
                <button
                  className={moverTab === "gainers" ? "active" : ""}
                  onClick={() => setMoverTab("gainers")}
                >
                  Gainers
                </button>
                <button
                  className={moverTab === "losers" ? "active" : ""}
                  onClick={() => setMoverTab("losers")}
                >
                  Losers
                </button>
              </div>
            </div>

            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th></th>
                    <th>Market price (1D)</th>
                    <th>Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {(moverTab === "gainers" ? movers : losers)
                    .slice(0, moverExpanded ? undefined : 5)
                    .map((m: any, idx: number) => (
                      <tr
                        key={m.symbol}
                        className="clickable"
                        onClick={() => handleStockClick(m)}
                      >
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <span className="rank-badge">{idx + 1}</span>
                            <img
                              src={new URL(`${getImageSrc(m.symbol)}`, import.meta.url).href}
                              onError={(e) => (e.currentTarget.src = paperbulllogo)}
                              alt={m.name}
                              className="table-logo"
                            />
                            <div>
                              <div className="table-name">{toTitleCase(m.name)}</div>
                              <div className="table-sym">{m.symbol.replace(".NS", "")}</div>
                            </div>
                          </div>
                        </td>

                        <td className="table-chart-cell">
                          <MiniGraph positive={m.percent > 0} />
                        </td>

                        <td className={m.percent > 0 ? "pos" : "neg"} id="marketprice">
                          {m.price !== null ? `₹${m.price.toLocaleString("en-IN")}` : "—"}
                          <div>
                            {m.percent > 0 ? "+" : ""}{m.percent}%
                          </div>
                        </td>

                        <td className="vol">
                          {m.volume ? m.volume.toLocaleString("en-IN") : "—"}
                        </td>
                      </tr>
                    ))}
                  {(moverTab === "gainers" ? movers : losers).length > 5 && (
                    <tr>
                      <td colSpan={4} className="table-see-all">
                        <button className="table-see-all-btn" onClick={() => setMoverExpanded(!moverExpanded)}>
                          {moverExpanded ? "Show less ↑" : `See all ${(moverTab === "gainers" ? movers : losers).length} stocks →`}
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="groww-right-col">
          {/* YOUR INVESTMENTS */}
          <section className="section reveal reveal-d3">
            <h2 className="section-title-groww">Your investments</h2>
            {invested?.length === 0 ? (
              <div className="groww-empty">
                <span className="groww-empty-icon">📊</span>
                <span>You haven't invested yet</span>
              </div>
            ) : (
              <div className="groww-list">
                {invested.map((s: any) => {
                  const price = s.price || 0;
                  const percent = s.percent || 0;
                  const changeAbs = Math.abs(price - (price / (1 + percent / 100))).toFixed(2);
                  const displayName = toTitleCase(s.name);

                  return (
                    <div key={s.symbol} className="groww-list-item clickable" onClick={() => handleStockClick(s)}>
                      <div className="groww-list-logo">
                        <img src={new URL(`${getImageSrc(s.symbol)}`, import.meta.url).href} onError={(e) => (e.currentTarget.src = paperbulllogo)} alt={s.name} />
                      </div>
                      <div className="groww-list-info">
                        <div className="groww-list-name">{displayName}</div>
                      </div>
                      <div className="groww-list-right">
                        <div className="groww-list-price">₹{price.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        <div className={`groww-list-change ${percent >= 0 ? "pos" : "neg"}`}>
                          {percent >= 0 ? "" : "-"}{changeAbs} ({Math.abs(percent).toFixed(2)}%)
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* LATEST & IMPORTANT ANNOUNCEMENTS */}
          <section className="section reveal reveal-d5" style={{ marginTop: "28px" }}>
            <h2 className="section-title-groww">Latest announcements</h2>
            {newsLoading ? (
              <div className="groww-list" style={{ gap: "12px", padding: "16px" }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="company-news-sk-item">
                    <div className="news-sk-chips">
                      <div className="news-sk news-sk-chip" />
                      <div className="news-sk news-sk-chip" style={{ width: 55 }} />
                    </div>
                    <div className="news-sk news-sk-headline" style={{ height: "13px", marginBottom: "8px" }} />
                    <div className="news-sk news-sk-footer" style={{ height: "11px" }} />
                  </div>
                ))}
              </div>
            ) : announcements.length === 0 ? (
              <div className="groww-empty">
                <span className="groww-empty-icon">📰</span>
                <span>No recent announcements</span>
              </div>
            ) : (
              <div className="explore-news-list">
                {announcements.slice(0, 5).map((ann) => (
                  <div key={ann._id || ann.bse_id} className="explore-news-item">
                    <div className="explore-news-meta">
                      <span className={`category-badge ${ann.category}`}>
                        {ann.category === "corporate_action" ? "Corp. Action" : ann.category === "other" ? "Update" : ann.category.charAt(0).toUpperCase() + ann.category.slice(1)}
                      </span>
                      {ann.sentiment !== "neutral" && (
                        <span className={`sentiment-chip ${ann.sentiment}`}>
                          {ann.sentiment === "bullish" ? "▲ Bullish" : "▼ Bearish"}
                        </span>
                      )}
                      <span className="explore-news-sym">{ann.symbol?.replace(".NS", "")}</span>
                    </div>
                    <div className="explore-news-headline" onClick={() => navigate(getStockRoute(ann.symbol, ann.company_name))}>
                      {ann.headline}
                    </div>
                    <div className="explore-news-footer">
                      <span>{formatDate(ann.announced_at)}</span>
                      {ann.pdf_url && (
                        <a href={ann.pdf_url} target="_blank" rel="noopener noreferrer" className="explore-pdf-link" onClick={(e) => e.stopPropagation()}>
                          View PDF
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: "11px", height: "11px", marginLeft: "4px" }}>
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
                <div style={{ textAlign: "center", paddingTop: "12px" }}>
                  <span className="link" style={{ marginTop: 0 }} onClick={() => navigate("/news")}>
                    View all announcements →
                  </span>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
