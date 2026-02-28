import React, { useEffect, useState, useContext, useRef } from "react";
import "../Styles/HoldingsPage.css";
import { AuthContext } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";

const HOST = import.meta.env.VITE_HOST_ADDRESS;

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
const fmtD = (d: string | null | undefined) => {
    if (!d) return "—";
    const c = d.replace(/Z$/, "").replace(/[+-]\d{2}:\d{2}$/, "");
    return new Date(c).toLocaleString("en-IN", {
        day: "numeric", month: "short",
        hour: "2-digit", minute: "2-digit",
    });
};

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

        // merge stoploss
        if (p.stoplossEnabled) {
            m.stoplossEnabled = true;
            m.stopLoss        = p.stopLoss;
            m.stopLossQty     = (m.stopLossQty ?? 0) + (p.stopLossQty ?? 0);
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
    const [sseVersion, bump]        = useState(0);

    /* SSE */
    useEffect(() => {
        if (!user) return;
        let es: EventSource | null = null;
        let cancelled = false;

        user.getIdToken().then(token => {
            if (cancelled) return;
            es = new EventSource(
                `${HOST}/api/holdings/positions/stream?token=${encodeURIComponent(token)}`
            );
            es.onmessage = (e) => {
                const d = JSON.parse(e.data);
                setPositions(d.positions);
                setSummary(d.summary);
                setLoading(false);
            };
            es.onerror = () => es?.close();
        });

        return () => { cancelled = true; es?.close(); };
    }, [user, sseVersion]);

    const handleOrderDone = () => { setDrawer(null); bump(v => v + 1); };

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

    /* ── Row ── */
    const renderRow = (p: MergedPosition) => {
        const rowProfit = p.totalPnl >= 0;
        return (
            <React.Fragment key={p.key}>
            <tr
                className="hp-row clickable"
                onClick={() => navigate(getRoute(p.symbol, p.name))}
            >
                <td>
                    <div className="hp-company">
                        <span className="hp-company-name">{p.name}</span>
                        <span className="hp-company-sym">
                            {p.symbol.replace(".NS", "").replace(".BO", "")}
                        </span>
                    </div>
                </td>
                <td>
                    <div className="hp-badges">
                        <span className={`hp-product-badge ${p.productType === "Intraday" ? "hp-intra" : "hp-delivery"}`}>
                            {p.productType}
                        </span>
                        <span className={`hp-type-badge ${p.positionType === "LONG" ? "hp-long" : "hp-short"}`}>
                            {p.positionType}
                        </span>
                    </div>
                </td>
                {/* ✅ Total qty = sum of all lots */}
                <td className="hp-num">
                    {p.totalQty}
                    {p.lotCount > 1 && (
                        <span className="hp-muted" style={{ marginLeft: 4, fontSize: 11 }}>
                            ({p.lotCount} lots)
                        </span>
                    )}
                </td>
                <td>
                    <div className="hp-2line">
                        <span className="hp-primary">{fmt(p.ltp)}</span>
                        <span className="hp-muted">avg {fmt(p.totalInvested / p.totalQty)}</span>
                    </div>
                </td>
                <td>
                    <span className={`hp-sm ${p.dayChangePercent >= 0 ? "hp-profit" : "hp-loss"}`}>
                        {p.dayChangePercent >= 0 ? "▲" : "▼"} {Math.abs(p.dayChangePercent)}%
                    </span>
                </td>
                <td>
                    <div className="hp-2line">
                        <span className="hp-primary">{fmt(p.totalCurrentValue)}</span>
                        <span className="hp-muted">{fmt(p.totalInvested)}</span>
                    </div>
                </td>
                {/* ✅ PnL = sum of all lot PnLs, % recalculated from totals */}
                <td>
                    <div className={`hp-pnl ${rowProfit ? "hp-profit" : "hp-loss"}`}>
                        <span>{rowProfit ? "+" : ""}{fmt(p.totalPnl)}</span>
                        <span className="hp-sm">
                            {p.totalPnlPct >= 0 ? "+" : ""}{p.totalPnlPct}%
                        </span>
                    </div>
                </td>
                <td>
                    {p.stoplossEnabled && p.stopLoss
                        ? <span className="hp-sl-badge">{p.stopLossQty} @ {fmt(p.stopLoss)}</span>
                        : <span className="hp-muted">—</span>}
                </td>
                <td>
                    <span className="hp-muted">{fmtD(p.openedAt)}</span>
                </td>
                {/* ── Buy / Sell action buttons ── */}
                <td className="h-action-cell" onClick={e => e.stopPropagation()}>
                    <button
                        className="h-action-btn h-buy"
                        onClick={() => setDrawer(d =>
                            d?.symbol === p.symbol && d?.productType === p.productType && d.tab === "BUY" ? null
                            : { symbol: p.symbol, price: p.ltp, tab: "BUY", availableQty: p.totalQty, productType: p.productType }
                        )}
                    >Buy</button>
                    <button
                        className="h-action-btn h-sell"
                        onClick={() => setDrawer(d =>
                            d?.symbol === p.symbol && d?.productType === p.productType && d.tab === "SELL" ? null
                            : { symbol: p.symbol, price: p.ltp, tab: "SELL", availableQty: p.totalQty, productType: p.productType }
                        )}
                    >Sell</button>
                </td>
            </tr>

            {/* ── Inline drawer ── */}
            {drawer?.symbol === p.symbol && drawer?.productType === p.productType && (
                <tr className="h-drawer-row">
                    <td colSpan={10} className="h-drawer-cell">
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
    };

    /* ── Section divider ── */
    const sectionHeader = (label: string, rows: MergedPosition[]) => {
        const sectionPnl = rows.reduce((s, r) => s + r.totalPnl, 0);
        const pnlPos     = sectionPnl >= 0;
        return (
            <tr className="hp-section-header-row" key={`sh-${label}`}>
                <td colSpan={10}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: "#374151" }}>{label}</span>
                        <span style={{ fontSize: 12, color: "#9ca3af" }}>
                            {rows.length} stock{rows.length !== 1 ? "s" : ""}
                        </span>
                        <span style={{
                            marginLeft: "auto", fontSize: 13, fontWeight: 700,
                            color: pnlPos ? "#059669" : "#dc2626"
                        }}>
                            {pnlPos ? "+" : ""}{fmt(sectionPnl)}
                        </span>
                    </div>
                </td>
            </tr>
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

            {/* Table */}
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
                <div className="hp-table-card">
                    <table className="hp-table hp-positions-table">
                        <thead>
                            <tr>
                                <th>Stock</th>
                                <th>Type</th>
                                <th>Qty</th>
                                <th>LTP / Avg</th>
                                <th>Day %</th>
                                <th>Cur / Inv</th>
                                <th>P&amp;L</th>
                                <th>Stop Loss</th>
                                <th>Opened</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading
                                ? Array.from({ length: 4 }).map((_, i) => (
                                    <tr key={i} className="hp-sk-row">
                                        {Array.from({ length: 10 }).map((_, j) => (
                                            <td key={j}>
                                                <div className="holdings-skeleton holdings-sk-cell"
                                                    style={{ width: `${40 + (j * 9) % 40}%` }} />
                                            </td>
                                        ))}
                                    </tr>
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
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default PositionsPage;
