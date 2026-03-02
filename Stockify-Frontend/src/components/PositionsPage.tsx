import React, { useEffect, useState, useContext, useRef } from "react";
import "../Styles/HoldingsPage.css";
import { AuthContext } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import { useAIAnalysis } from "../hooks/useAIAnalysis";
import AIInsightCard from "./AIInsightCard";
import { useWebSocket } from "../context/WebSocketContext";

const HOST = import.meta.env.VITE_HOST_ADDRESS || "";

/* ─── Helpers ─── */
function slugify(n: string) {
    return n.toLowerCase().trim().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function getRoute(symbol: string, name: string) {
    const s = symbol.trim().toUpperCase();
    return (s.endsWith(".NS") || s.endsWith(".BO")) ? `/indiaSEE/${s}/${slugify(name)}` : `/us/${s}/${slugify(name)}`;
}
const fmt = (n: number, d = 2) =>
    `₹${n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

/* ─── Inline Order Drawer (same as Holdings) ─── */
type DrawerState = { symbol: string; price: number; tab: "BUY" | "SELL"; availableQty: number; productType: string } | null;

function InlineOrderDrawer({ state, onClose, onDone }: {
    state: DrawerState; onClose: () => void; onDone: () => void;
}) {
    const [qty, setQty]         = useState("");
    const [loading, setLoading] = useState(false);
    const [tab, setTab]         = useState<"BUY" | "SELL">(state?.tab ?? "BUY");
    const inputRef              = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (state) { setTab(state.tab); setQty(""); setTimeout(() => inputRef.current?.focus(), 80); }
    }, [state?.symbol, state?.tab]);

    if (!state) return null;

    const estimated = (Number(qty) || 0) * state.price;
    const overSell  = tab === "SELL" && Number(qty) > state.availableQty;

    const submit = async () => {
        const q = parseInt(qty, 10);
        if (isNaN(q) || q <= 0) return;
        setLoading(true);
        try {
            const url = tab === "BUY"
                ? `${HOST}/api/orderExecution/buy`
                : `${HOST}/api/sellstock/sell`;
            const r = await fetch(url, {
                method: "POST", credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    symbol: state.symbol,
                    quantity: q,
                    sl_enabled: false,
                    sl_price: 0,
                    product_type: state.productType
                }),
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

/* ── Types ──────────────────────────────────────────── */
type Position = {
    id: number; symbol: string; name: string;
    productType: string; positionType: "LONG" | "SHORT";
    quantity: number; entryPrice: number; ltp: number;
    dayChangePercent: number;
    invested: number; currentValue: number;
    unrealizedPnl: number; unrealizedPnlPct: number;
    stoplossEnabled: boolean; stopLoss: number | null;
    stopLossQty: number | null;
    openedAt: string;
};

/* Merged row — multiple lots of same symbol+productType collapsed */
type MergedPosition = {
    key: string;
    symbol: string; name: string;
    productType: string; positionType: "LONG" | "SHORT";
    totalQty: number;
    ltp: number;
    dayChangePercent: number;
    totalInvested: number;
    totalCurrentValue: number;
    totalPnl: number;       // sum of each lot's PnL
    totalPnlPct: number;    // recalculated from totals (not averaged)
    stoplossEnabled: boolean; stopLoss: number | null; stopLossQty: number | null;
    openedAt: string;       // earliest lot date
    lotCount: number;
};

type PositionsSummary = {
    investedValue: number; currentValue: number;
    totalReturns: number; totalReturnsPercent: number;
    dayReturns: number; dayReturnsPercent: number;
};

/* ── Grouping — merge lots of same symbol+productType into one row ── */
function mergePositions(positions: Position[]): MergedPosition[] {
    const map = new Map<string, MergedPosition>();

    for (const p of positions) {
        const key = `${p.symbol}__${p.productType}__${p.positionType}`;

        if (!map.has(key)) {
            map.set(key, {
                key,
                symbol: p.symbol,
                name: p.name,
                productType: p.productType,
                positionType: p.positionType,
                totalQty: 0,
                ltp: p.ltp,
                dayChangePercent: p.dayChangePercent,
                totalInvested: 0,
                totalCurrentValue: 0,
                totalPnl: 0,
                totalPnlPct: 0,
                stoplossEnabled: p.stoplossEnabled,
                stopLoss: p.stopLoss,
                stopLossQty: p.stopLossQty,
                openedAt: p.openedAt,
                lotCount: 0,
            });
        }

        const m = map.get(key)!;
        m.totalQty          += p.quantity;
        m.totalInvested     += p.invested;
        m.totalCurrentValue += p.currentValue;
        m.totalPnl          += p.unrealizedPnl;   // SUM — not average
        m.lotCount          += 1;
        m.ltp                = p.ltp;              // latest price
        m.dayChangePercent   = p.dayChangePercent;

        // keep earliest openedAt
        if (new Date(p.openedAt) < new Date(m.openedAt)) {
            m.openedAt = p.openedAt;
        }

        // Stoploss global sync
        if (p.stoplossEnabled) {
            m.stoplossEnabled = true;
            m.stopLoss        = p.stopLoss;
            m.stopLossQty     = Math.max(m.stopLossQty ?? 0, p.stopLossQty ?? 0); // take max, avoid summation since back-end replicates it per lot
        }
    }

    // recalculate PnL% from real totals — not an average
    for (const m of map.values()) {
        m.totalPnlPct = m.totalInvested !== 0
            ? parseFloat(((m.totalPnl / m.totalInvested) * 100).toFixed(2))
            : 0;
    }

    return Array.from(map.values());
}

/* ══════════════════════════════════════════
   POSITIONS PAGE
══════════════════════════════════════════ */
const PositionsPage: React.FC = () => {
    const { user } = useContext(AuthContext);
    const navigate = useNavigate();
    const [positions, setPositions] = useState<Position[]>([]);
    const [summary, setSummary]     = useState<PositionsSummary | null>(null);
    const [loading, setLoading]     = useState(true);
    const [filter, setFilter]       = useState<"ALL" | "LONG" | "SHORT" | "Intraday" | "Delivery">("ALL");
    const [drawer, setDrawer]       = useState<DrawerState>(null);

    const EMPTY_ARRAY = React.useMemo(() => [], []);
    const { data: aiData, loading: aiLoading, refetch: refetchAI } = useAIAnalysis(user?.uid, positions, EMPTY_ARRAY, !loading);

    const { subscribe, unsubscribe, lastMessage } = useWebSocket();

    /* WS */
    useEffect(() => {
        if (!user) return;
        subscribe("POSITIONS_LIVE");
        return () => unsubscribe("POSITIONS_LIVE");
    }, [user]);

    useEffect(() => {
        if (lastMessage?.type === "POSITIONS_UPDATE") {
            setPositions(lastMessage.data.positions);
            setSummary(lastMessage.data.summary);
            setLoading(false);
        }
    }, [lastMessage]);

    const handleOrderDone = () => { setDrawer(null); refetchAI(); };

    /* Merge lots → grouped rows */
    const merged = React.useMemo(() => mergePositions(positions), [positions]);

    /* Apply filter */
    const filtered = merged.filter(p => {
        if (filter === "ALL")                          return true;
        if (filter === "LONG" || filter === "SHORT")   return p.positionType === filter;
        return p.productType === filter;
    });

    /* Separate sections for ALL view */
    const intraday     = filtered.filter(p => p.productType === "Intraday");
    const delivery     = filtered.filter(p => p.productType === "Delivery");
    const showSections = filter === "ALL";

    const profit = (summary?.totalReturns ?? 0) >= 0;

    /* ── List Row ── */
    const renderRow = (p: MergedPosition) => {
        const rowProfit = p.totalPnl >= 0;
        const aiInsight = aiData?.positionsAnalysis?.find(a => a.symbol === p.symbol.replace(".NS", "").replace(".BO", ""));

        return (
            <div key={p.key}
                 className="hp-row"
                 style={{ 
                     display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
                     backgroundColor: '#ffffff', padding: '20px 24px',
                     borderBottom: '1px solid #f3f4f6', cursor: 'pointer',
                     position: 'relative', gap: '24px', transition: 'background-color 0.2s'
                 }}
                 onClick={() => navigate(getRoute(p.symbol, p.name))}
                 onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f9fafb'}
                 onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ffffff'}
            >
                <div style={{ position: 'absolute', top: '16px', bottom: '16px', left: 0, width: '4px', borderRadius: '0 4px 4px 0', backgroundColor: rowProfit ? '#059669' : '#dc2626' }} />
                
                {/* 1. Name & Badges */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1.5', minWidth: '220px', paddingLeft: '8px' }}>
                    <div style={{ fontWeight: 700, color: '#111827', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {p.name}
                        {p.lotCount > 1 && <span style={{ backgroundColor: '#f3f4f6', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', color: '#4b5563', fontWeight: '600' }}>{p.lotCount} lots</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 'bold' }}>{p.symbol.replace(".NS", "").replace(".BO", "")}</span>
                        <span className={`hp-product-badge ${p.productType === "Intraday" ? "hp-intra" : "hp-delivery"}`}>{p.productType}</span>
                        <span className={`hp-type-badge ${p.positionType === "LONG" ? "hp-long" : "hp-short"}`}>{p.positionType}</span>
                        {p.stoplossEnabled && p.stopLoss && (
                            <span style={{ backgroundColor: '#fef2f2', color: '#ef4444', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fecaca', fontSize: '10px', fontWeight: 600 }}>SL: {p.stopLossQty} @ {fmt(p.stopLoss)}</span>
                        )}
                    </div>
                </div>

                {/* 2. Position Size */}
                <div style={{ display: 'flex', flexDirection: 'column', flex: '1', minWidth: '100px' }}>
                    <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: '4px', fontWeight: 500 }}>Qty & Avg</div>
                    <div style={{ color: '#111827', fontSize: '14px', fontWeight: 700 }}>{p.totalQty} <span style={{color: '#9ca3af', fontWeight: 500}}>@</span> {fmt(p.totalInvested / p.totalQty)}</div>
                </div>

                {/* 3. Current Live */}
                <div style={{ display: 'flex', flexDirection: 'column', flex: '1', minWidth: '120px' }}>
                    <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: '4px', fontWeight: 500 }}>Live Price</div>
                    <div style={{ color: '#111827', fontSize: '14px', fontWeight: 700 }}>
                        {fmt(p.ltp)} <span style={{ fontSize: '12px', marginLeft: '4px', fontWeight: 700, color: p.dayChangePercent >= 0 ? '#059669' : '#dc2626' }}>{p.dayChangePercent >= 0 ? '▲' : '▼'}{Math.abs(p.dayChangePercent)}%</span>
                    </div>
                </div>

                {/* 4. Total P&L */}
                <div style={{ display: 'flex', flexDirection: 'column', flex: '1', minWidth: '120px' }}>
                    <div style={{ color: '#6b7280', fontSize: '12px', marginBottom: '4px', fontWeight: 500 }}>Total P&L</div>
                    <div style={{ fontSize: '16px', fontWeight: '800', color: rowProfit ? '#059669' : '#dc2626' }}>
                        {rowProfit ? '+' : ''}{fmt(p.totalPnl)} <span style={{ fontSize: '12px', fontWeight: '700', opacity: 0.9 }}>({rowProfit ? '+' : ''}{p.totalPnlPct}%)</span>
                    </div>
                </div>

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
                        <div style={{ fontSize: '12px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                             {aiLoading ? (
                                 <div style={{ position: 'relative', width: '10px', height: '10px' }}>
                                     <div style={{ position: 'absolute', width: '100%', height: '100%', backgroundColor: '#60a5fa', borderRadius: '50%', animation: 'aiPulseOpacity 1.5s infinite ease-in-out' }} />
                                     <div style={{ position: 'absolute', width: '100%', height: '100%', border: '1px solid #60a5fa', borderRadius: '50%', animation: 'aiOrbScale 1.5s infinite ease-out' }} />
                                 </div>
                             ) : '🧠'} 
                             <span style={{ 
                                 background: aiLoading ? 'linear-gradient(90deg, #9ca3af, #60a5fa, #9ca3af)' : 'none',
                                 backgroundSize: '200% 100%',
                                 WebkitBackgroundClip: aiLoading ? 'text' : 'none',
                                 WebkitTextFillColor: aiLoading ? 'transparent' : 'inherit',
                                 animation: aiLoading ? 'aiShimmer 2s infinite linear' : 'none'
                             }}>
                                 {aiLoading ? 'AI ANALYZING...' : 'No insight.'}
                             </span>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px', flex: '0.5', minWidth: '120px', justifyContent: 'flex-end', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                    <button className="h-action-btn h-buy" onClick={() => setDrawer(d => d?.symbol === p.symbol && d?.productType === p.productType && d.tab === "BUY" ? null : { symbol: p.symbol, price: p.ltp, tab: "BUY", availableQty: p.totalQty, productType: p.productType })}>Buy</button>
                    <button className="h-action-btn h-sell" onClick={() => setDrawer(d => d?.symbol === p.symbol && d?.productType === p.productType && d.tab === "SELL" ? null : { symbol: p.symbol, price: p.ltp, tab: "SELL", availableQty: p.totalQty, productType: p.productType })}>Sell</button>
                </div>

                {drawer?.symbol === p.symbol && drawer?.productType === p.productType && (
                    <div style={{ flexBasis: '100%', marginTop: '16px', backgroundColor: '#ffffff', padding: '16px', borderTop: '1px solid #f3f4f6', borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }} onClick={e => e.stopPropagation()}>
                        <InlineOrderDrawer state={drawer} onClose={() => setDrawer(null)} onDone={handleOrderDone} />
                    </div>
                )}
            </div>
        );
    };

    /* ── Section divider ── */
    const sectionHeader = (label: string, rows: MergedPosition[]) => {
        const sectionPnl = rows.reduce((s, r) => s + r.totalPnl, 0);
        const pnlPos     = sectionPnl >= 0;
        return (
            <div key={`sh-${label}`} style={{ width: '100%', display: "flex", alignItems: "center", gap: 12, padding: '12px 24px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', borderLeft: `6px solid ${pnlPos ? '#059669' : '#dc2626'}` }}>
                <span style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>{label}</span>
                <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>{rows.length} position{rows.length !== 1 ? "s" : ""}</span>
                <span style={{ marginLeft: "auto", fontSize: 15, fontWeight: 700, color: pnlPos ? "#059669" : "#dc2626" }}>
                    {pnlPos ? "+" : ""}{fmt(sectionPnl)}
                </span>
            </div>
        );
    };

    return (
        <div className="hp-wrapper">
            {/* Page header */}
            <div className="hp-page-header">
                <div>
                    <h1 className="hp-page-title">Positions</h1>
                    <p className="hp-page-sub">All your open lots — live unrealized P&amp;L updated every few seconds</p>
                </div>
            </div>

            {/* AI Insight */}
            {(loading || aiLoading || aiData) && (
                <AIInsightCard 
                    portfolioRiskScore={aiData?.portfolioRiskScore || 0} 
                    riskCategory={aiData?.riskCategory || ''} 
                    emotionalFlags={aiData?.emotionalFlags || { revengeTrading: false, fomo: false, panicSelling: false, overtrading: false }} 
                    behavioralMetrics={aiData?.behavioralMetrics}
                    overallAdvice={aiData?.overallAdvice || ''} 
                    loading={loading || aiLoading} 
                />
            )}

            {/* Summary bar */}
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
                                <span className="hp-sum-pct">({profit ? "+" : ""}{summary.totalReturnsPercent.toFixed(2)}%)</span>
                            </span>
                        </div>
                        <div className="hp-sum-divider" />
                        <div className="hp-sum-block">
                            <span className="hp-sum-label">Today's P&amp;L</span>
                            <span className={`hp-sum-val ${summary.dayReturns >= 0 ? "hp-profit" : "hp-loss"}`}>
                                {summary.dayReturns >= 0 ? "+" : ""}{fmt(summary.dayReturns)}
                                <span className="hp-sum-pct">({summary.dayReturns >= 0 ? "+" : ""}{summary.dayReturnsPercent.toFixed(2)}%)</span>
                            </span>
                        </div>
                    </>)
                }
            </div>

            {/* Filter pills */}
            <div className="hp-filter-row" style={{ marginBottom: '16px' }}>
                {(["ALL", "LONG", "SHORT", "Intraday", "Delivery"] as const).map(f => (
                    <button
                        key={f}
                        className={`hp-filter-pill${filter === f ? " hp-active" : ""}`}
                        onClick={() => setFilter(f)}
                    >{f}</button>
                ))}
            </div>

            {/* List Layout replacement for Grid/Table */}
            {!loading && filtered.length === 0 ? (
                <div className="hp-empty">
                    <div className="hp-empty-icon">📊</div>
                    <p className="hp-empty-title">No open positions</p>
                    <p className="hp-empty-sub">
                        {filter === "ALL"
                            ? "Your active intraday and delivery positions will appear here with live P&L."
                            : `No ${filter} positions currently open.`}
                    </p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                    {loading
                        ? Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '24px', borderBottom: '1px solid #f3f4f6', backgroundColor: '#ffffff' }}>
                                <div className="holdings-skeleton" style={{ width: '20%', height: '40px', borderRadius: '8px', backgroundColor: '#f3f4f6' }} />
                                <div className="holdings-skeleton" style={{ width: '15%', height: '40px', borderRadius: '8px', backgroundColor: '#f9fafb' }} />
                                <div className="holdings-skeleton" style={{ width: '15%', height: '40px', borderRadius: '8px', backgroundColor: '#f9fafb' }} />
                                <div className="holdings-skeleton" style={{ width: '25%', height: '40px', borderRadius: '8px', backgroundColor: '#eff6ff' }} />
                                <div className="holdings-skeleton" style={{ width: '10%', height: '40px', borderRadius: '8px', backgroundColor: '#f3f4f6', marginLeft: 'auto' }} />
                            </div>
                        ))
                        : showSections
                            ? <>
                                {intraday.length > 0 && <>
                                    {sectionHeader("Intraday", intraday)}
                                    {intraday.map(renderRow)}
                                </>}
                                {delivery.length > 0 && <>
                                    {sectionHeader("Delivery", delivery)}
                                    {delivery.map(renderRow)}
                                </>}
                            </>
                            : filtered.map(renderRow)
                    }
                </div>
            )}
        </div>
    );
};

export default PositionsPage;
