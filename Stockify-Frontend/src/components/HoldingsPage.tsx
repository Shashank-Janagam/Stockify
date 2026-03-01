import React, { useEffect, useState, useContext, useRef } from "react";
import "../Styles/HoldingsPage.css";
import { AuthContext } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import { useAIAnalysis } from "../hooks/useAIAnalysis";
import AIInsightCard from "./AIInsightCard";

const HOST = import.meta.env.VITE_HOST_ADDRESS;

/* ─── Helpers ─── */
function slugify(n: string) {
  return n.toLowerCase().trim().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function getRoute(symbol: string, name: string) {
  const s = symbol.trim().toUpperCase();
  const routeName = name ? slugify(name) : "stock";
  return (s.endsWith(".NS") || s.endsWith(".BO")) ? `/indiaSEE/${s}/${routeName}` : `/us/${s}/${routeName}`;
}
const fmt = (n: number | null | undefined, d = 2) => {
  if (n == null || isNaN(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};

/* ─── Types ─── */
type Holding = {
  symbol: string; name: string; quantity: number;
  avgPrice: number; currentPrice: number;
  dayChangePercent: number;
  invested: number; current: number;
  pnl: number; pnlPercent: number;
  allocationPercent: number;
  datetime: string;
  allocatedQty?: number;
  stopLoss?: number | null;
};
type HoldingsSummary = {
  investedValue: number; currentValue: number;
  totalReturns: number; totalReturnsPercent: number;
  dayReturns: number; dayReturnsPercent: number;
};

/* ─── Inline Order Drawer ─── */
type DrawerState = { symbol: string; price: number; tab: "BUY" | "SELL"; availableQty: number } | null;

function InlineOrderDrawer({ state, onClose, onDone }: { state: DrawerState; onClose: () => void; onDone: () => void }) {
  const [qty, setQty]       = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab]       = useState<"BUY" | "SELL">(state?.tab ?? "BUY");
  const inputRef            = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state) {
      setTab(state.tab);
      setQty("");
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [state?.symbol, state?.tab]);

  if (!state) return null;

  const estimated = (Number(qty) || 0) * state.price;
  const overSell  = tab === "SELL" && Number(qty) > state.availableQty;

  const submit = async () => {
    const q = parseInt(qty, 10);
    if (isNaN(q) || q <= 0) return;
    setLoading(true);
    try {
      const url = tab === "BUY" ? `${HOST}/api/orderExecution/buy` : `${HOST}/api/sellstock/sell`;
      const r = await fetch(url, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: state.symbol, quantity: q, sl_enabled: false, sl_price: 0 }),
      });
      if (!r.ok) throw new Error();
      onDone();
    } catch { alert("Order failed. Please try again."); }
    finally { setLoading(false); setQty(""); }
  };

  return (
    <div className="h-drawer">
      <div className="h-drawer-tabs">
        <button className={`h-tab h-tab-buy${tab === "BUY" ? " active" : ""}`} onClick={() => setTab("BUY")}>Buy</button>
        <button className={`h-tab h-tab-sell${tab === "SELL" ? " active" : ""}`} onClick={() => setTab("SELL")}>Sell</button>
        <button className="h-drawer-close" onClick={onClose}>✕</button>
      </div>
      <div className="h-drawer-body">
        <span className="h-drawer-price">@ ₹{state.price.toFixed(2)}</span>
        <input
          ref={inputRef} type="number" className="h-drawer-qty"
          placeholder="Qty" min={1} value={qty}
          onChange={e => setQty(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !overSell && submit()}
        />
        <span className="h-drawer-est">≈ ₹{estimated.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
        <button
          className={`h-drawer-btn ${tab === "BUY" ? "h-btn-buy" : "h-btn-sell"}`}
          disabled={loading || Number(qty) <= 0 || overSell}
          onClick={submit}
        >
          {loading ? <span className="btn-loader" /> : tab === "BUY" ? "Buy" : "Sell"}
        </button>
      </div>
      {overSell && <p className="h-drawer-warn">You only have {state.availableQty} shares</p>}
    </div>
  );
}

/* ══════════════════════════════════════════
   MAIN — Holdings Page (Delivery shares)
══════════════════════════════════════════ */
const HoldingsPage: React.FC = () => {
  const { user }            = useContext(AuthContext);
  const navigate            = useNavigate();
  const [holdings, setHoldings]   = useState<Holding[]>([]);
  const [summary,  setSummary]    = useState<HoldingsSummary | null>(null);
  const [loading,  setLoading]    = useState(true);
  const [drawer,   setDrawer]     = useState<DrawerState>(null);
  const [sseVersion, bump]        = useState(0);

  const EMPTY_ARRAY = React.useMemo(() => [], []);
  const { data: aiData, loading: aiLoading, refetch: refetchAI } = useAIAnalysis(user?.uid, EMPTY_ARRAY, holdings, !loading);

  /* SSE — live stream */
  useEffect(() => {
    if (!user) return;
    let es: EventSource | null = null;
    let cancelled = false;

    user.getIdToken().then(token => {
      if (cancelled) return;
      es = new EventSource(
        `${HOST}/api/holdings/stocks/stream?token=${encodeURIComponent(token)}`
      );
      es.onmessage = (e) => {
        const d = JSON.parse(e.data);
        setHoldings(d.holdings || []);
        setSummary(d.summary);
        setLoading(false);
      };
      es.onerror = () => es?.close();
    });

    return () => { cancelled = true; es?.close(); };
  }, [user, sseVersion]);

  const handleOrderDone = () => { setDrawer(null); setLoading(true); bump(v => v + 1); refetchAI(); };
  const profit = (summary?.totalReturns ?? 0) >= 0;

  return (
    <div className="hp-wrapper">
      {/* ── Page header ── */}
      <div className="hp-page-header">
        <div>
          <h1 className="hp-page-title">Holdings</h1>
          <p className="hp-page-sub">Your settled delivery shares · live valuations</p>
        </div>
      </div>

      {/* AI Insight */}
      {(aiData || aiLoading) && (
        <AIInsightCard 
          portfolioRiskScore={aiData?.portfolioRiskScore || 0} 
          riskCategory={aiData?.riskCategory || ''} 
          emotionalFlags={aiData?.emotionalFlags || { revengeTrading: false, fomo: false, panicSelling: false, overtrading: false }} 
          behavioralMetrics={aiData?.behavioralMetrics}
          overallAdvice={aiData?.overallAdvice || ''} 
          loading={aiLoading} 
        />
      )}
      {/* ── Summary card ── */}
      <div className="hp-summary-card" style={{ marginBottom: '24px' }}>
        {loading
          ? <div className="holdings-skeleton holdings-sk-summary" />
          : summary && (<>
              <div className="hp-sum-block">
                <span className="hp-sum-label">Invested</span>
                <span className="hp-sum-val">{fmt(summary.investedValue)}</span>
              </div>
              <div className="hp-sum-divider" />
              <div className="hp-sum-block">
                <span className="hp-sum-label">Current Value</span>
                <span className={`hp-sum-val ${profit ? "hp-profit" : "hp-loss"}`}>
                  {fmt(summary.currentValue)}
                </span>
              </div>
              <div className="hp-sum-divider" />
              <div className="hp-sum-block">
                <span className="hp-sum-label">Total P&amp;L</span>
                <span className={`hp-sum-val ${profit ? "hp-profit" : "hp-loss"}`}>
                  {profit ? "+" : ""}{fmt(summary.totalReturns)}
                  <span className="hp-sum-pct">({profit ? "+" : ""}{(summary.totalReturnsPercent || 0).toFixed(2)}%)</span>
                </span>
              </div>
              <div className="hp-sum-divider" />
              <div className="hp-sum-block">
                <span className="hp-sum-label">Today's P&amp;L</span>
                <span className={`hp-sum-val ${(summary.dayReturns ?? 0) >= 0 ? "hp-profit" : "hp-loss"}`}>
                  {(summary.dayReturns ?? 0) >= 0 ? "+" : ""}{fmt(summary.dayReturns)}
                  <span className="hp-sum-pct">({(summary.dayReturns ?? 0) >= 0 ? "+" : ""}{(summary.dayReturnsPercent || 0).toFixed(2)}%)</span>
                </span>
              </div>
            </>)
        }
      </div>

      {/* ── Table ── */}
      {!loading && holdings.length === 0 ? (
        <div className="hp-empty">
          <div className="hp-empty-icon">📦</div>
          <p className="hp-empty-title">No holdings yet</p>
          <p className="hp-empty-sub">
            Delivery shares you buy will appear here. Buy a stock with "Delivery" product type to get started.
          </p>
        </div>
      ) : (
        <div className="hp-table-card">
          <table className="hp-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Qty / Avg Price</th>
                <th>LTP · Day %</th>
                <th>Invested / Current</th>
                <th>P&amp;L</th>
                <th>AI Insight</th>
                <th>Allocation</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="hp-sk-row">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j}>
                          <div className="holdings-skeleton holdings-sk-cell" style={{ width: `${45 + (j * 7) % 40}%` }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : holdings.map((h, i) => {
                    const pureSymbol = h.symbol.replace(".NS", "").replace(".BO", "");
                    const aiInsight = aiData?.positionsAnalysis?.find(a => a.symbol === pureSymbol);

                    return (
                    <React.Fragment key={h.symbol + i}>
                      <tr
                        className="hp-row clickable"
                        onClick={() => navigate(getRoute(h.symbol, h.name))}
                      >
                        <td>
                          <div className="hp-company">
                            <span className="hp-company-name">{h.name || h.symbol}</span>
                            <span className="hp-company-sym">
                              {pureSymbol}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="hp-2line">
                            <span className="hp-primary">
                              {h.quantity} shares
                              {!!h.allocatedQty && (
                                <span style={{ marginLeft: '6px', fontSize: '10px', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '2px 4px', borderRadius: '4px', border: '1px solid rgba(239,68,68,0.2)' }}>
                                  {h.allocatedQty} allocated {h.stopLoss ? `@ ${fmt(h.stopLoss)}` : ''}
                                </span>
                              )}
                            </span>
                            <span className="hp-muted">avg {fmt(h.avgPrice)}</span>
                          </div>
                        </td>
                        <td>
                          <div className="hp-2line">
                            <span className="hp-primary">{fmt(h.currentPrice)}</span>
                            <span className={`hp-sm ${(h.dayChangePercent ?? 0) >= 0 ? "hp-profit" : "hp-loss"}`}>
                              {(h.dayChangePercent ?? 0) >= 0 ? "▲" : "▼"} {Math.abs(h.dayChangePercent ?? 0)}%
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="hp-2line">
                            <span className="hp-primary">{fmt(h.current)}</span>
                            <span className="hp-muted">{fmt(h.invested)}</span>
                          </div>
                        </td>
                        <td>
                          <div className={`hp-pnl ${(h.pnl ?? 0) >= 0 ? "hp-profit" : "hp-loss"}`}>
                            <span>{(h.pnl ?? 0) >= 0 ? "+" : ""}{fmt(h.pnl)}</span>
                            <span className="hp-sm">{(h.pnlPercent ?? 0) >= 0 ? "+" : ""}{h.pnlPercent}%</span>
                          </div>
                        </td>
                        <td>
                            {/* 5. AI Insight (Sleek Inline) */}
                            <div style={{ flex: '1.5', minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '6px' }} onClick={e => e.stopPropagation()}>
                                {aiInsight ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            <span style={{ 
                                                padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800, 
                                                backgroundColor: aiInsight.suggestion === 'Add' ? '#ecfdf5' : aiInsight.suggestion === 'Exit' ? '#fef2f2' : aiInsight.suggestion === 'Reduce' ? '#fffbeb' : '#eff6ff',
                                                color: aiInsight.suggestion === 'Add' ? '#10b981' : aiInsight.suggestion === 'Exit' ? '#ef4444' : aiInsight.suggestion === 'Reduce' ? '#f59e0b' : '#3b82f6',
                                                border: `1px solid ${aiInsight.suggestion === 'Add' ? '#10b981' : aiInsight.suggestion === 'Exit' ? '#ef4444' : aiInsight.suggestion === 'Reduce' ? '#f59e0b' : '#3b82f6'}`,
                                                textTransform: 'uppercase'
                                            }}>
                                                {aiInsight.suggestion}
                                            </span>
                                            <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600 }}>{aiInsight.riskLevel} Risk</span>
                                        </div>
                                        <div style={{ fontSize: '13px', color: '#4b5563', lineHeight: '1.3', fontWeight: 500 }}>
                                            <span style={{marginRight: '4px'}}>🧠</span> {aiInsight.keyInsight}
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ fontSize: '12px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
                                         {aiLoading ? <span className="btn-loader" style={{ width: '12px', height: '12px', borderWidth: '2px', borderColor: '#d1d5db', borderRightColor: 'transparent' }} /> : '🧠'} 
                                         {aiLoading ? 'Thinking...' : 'AI thinking...'}
                                    </div>
                                )}
                            </div>
                        </td>
                        <td>
                          <div className="hp-alloc-wrap">
                            <span className="hp-alloc-val">{(h.allocationPercent || 0)}%</span>
                            <div className="hp-alloc-bar">
                              <div className="hp-alloc-fill" style={{ width: `${h.allocationPercent || 0}%` }} />
                            </div>
                          </div>
                        </td>
                        <td className="h-action-cell" onClick={e => e.stopPropagation()}>
                          <button
                            className="h-action-btn h-buy"
                            onClick={() => setDrawer(d =>
                              d?.symbol === h.symbol && d.tab === "BUY" ? null
                              : { symbol: h.symbol, price: h.currentPrice, tab: "BUY", availableQty: h.quantity }
                            )}
                          >Buy</button>
                          <button
                            className="h-action-btn h-sell"
                            onClick={() => setDrawer(d =>
                              d?.symbol === h.symbol && d.tab === "SELL" ? null
                              : { symbol: h.symbol, price: h.currentPrice, tab: "SELL", availableQty: h.quantity }
                            )}
                          >Sell</button>
                        </td>
                      </tr>

                      {drawer?.symbol === h.symbol && (
                        <tr className="h-drawer-row">
                          <td colSpan={8} className="h-drawer-cell">
                            <InlineOrderDrawer
                              state={drawer}
                              onClose={() => setDrawer(null)}
                              onDone={handleOrderDone}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                    );
                  })
              }
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default HoldingsPage;
