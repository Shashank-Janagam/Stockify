import { useEffect, useState, useContext, useRef, useCallback } from "react";
import { AuthContext } from "../../auth/AuthProvider";
import "../../Styles/OrderHistory.css";

/* ─── Types ─── */
type Order = {
  id: string;
  symbol: string;
  name: string;
  side: "BUY" | "SELL";
  order_type: string;
  quantity: number;
  price: number | null;
  stop_trigger_price: number | null;
  total_price: number | null;
  category: string;
  sell_type: string;
  status: string;
  created_at_ist: string;
  updated_at_ist: string | null;
  executed_at_ist: string | null;
  realized_pnl?: string | number | null;
};

type StoplossOrder = {
  id: string;
  symbol: string;
  name: string;
  side: "BUY" | "SELL";
  order_type: string;
  quantity: number;
  stop_trigger_price: number;
  category: string;
  sell_type: string;
  status: "PENDING";
  created_at: string;
  updated_at: string;
};

type Tab = "orders" | "stoploss";

const HOST = import.meta.env.VITE_HOST_ADDRESS || "";

/* ─── Formatters ─── */
const fmt = (n: number | null | undefined, decimals = 2) =>
  n == null ? "—" : `₹${n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

// Strip Z/offset so JS doesn't convert the already-IST timestamp from the DB
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const clean = d.replace(/Z$/, "").replace(/[+-]\d{2}:\d{2}$/, "");
  return new Date(clean).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

/* ═══════════════════════════════════════════
   SKELETON
═══════════════════════════════════════════ */
const SkeletonRow = ({ cols }: { cols: number }) => (
  <tr className="sk-row">
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i}><div className={`sk-block ${i === 0 ? "sk-w-80" : i % 2 === 0 ? "sk-w-60" : "sk-w-40"}`} /></td>
    ))}
  </tr>
);

/* ═══════════════════════════════════════════
   ORDER HISTORY TAB
═══════════════════════════════════════════ */
function OrdersTab() {
  const { user } = useContext(AuthContext);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const observer = useRef<IntersectionObserver | null>(null);

  const lastRef = useCallback((node: HTMLTableRowElement | null) => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) setPage(p => p + 1);
    });
    if (node) observer.current.observe(node);
  }, [loading, hasMore]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    setLoading(true);

    fetch(`${HOST}/api/holdings/orders?page=${page}&limit=20`, { credentials: "include" })
      .then(r => r.json())
      .then((data: Order[]) => {
        if (!mounted) return;
        const deduped = Array.from(new Map(data.map(o => [o.id, o])).values());
        setOrders(prev => page === 1 ? deduped : [...prev, ...deduped.filter(o => !prev.some(p => p.id === o.id))]);
        setHasMore(deduped.length === 20);
        setLoading(false);
      })
      .catch(() => { if (mounted) { setError("Failed to load orders"); setLoading(false); } });

    return () => { mounted = false; };
  }, [user, page]);

  if (error) return <p className="oh-empty">{error}</p>;
  if (!loading && orders.length === 0) return (
    <div className="oh-empty-state">
      <div className="oh-empty-icon">📋</div>
      <p className="oh-empty-title">No orders yet</p>
      <p className="oh-empty-sub">Your executed orders will appear here.</p>
    </div>
  );

  return (
    <div className="oh-table-wrap">
      <table className="oh-table">
        <thead>
          <tr>
            <th>Stock</th>
            <th>Side</th>
            <th>Type</th>
            <th>Qty</th>
            <th>Exec. Price</th>
            <th>Total Value</th>
            <th>P&amp;L</th>
            <th>Execution</th>
            <th>Product</th>
            <th>Status</th>
            <th>Date &amp; Time</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order, i) => {
            const isLast = i === orders.length - 1;
            const pnl = order.realized_pnl != null ? Number(order.realized_pnl) : null;
            return (
              <tr key={order.id} ref={isLast ? lastRef : null} className="oh-row">
                {/* Stock */}
                <td>
                  <div className="oh-stock-cell">
                    <span className="oh-stock-name">{order.name || order.symbol}</span>
                    <span className="oh-stock-symbol">{order.symbol}</span>
                  </div>
                </td>
                {/* Side */}
                <td>
                  <span className={`oh-badge oh-side ${order.side === "BUY" ? "oh-buy" : "oh-sell"}`}>
                    {order.side}
                  </span>
                </td>
                {/* Order type */}
                <td>
                  <span className="oh-type-pill">{order.order_type || "MARKET"}</span>
                </td>
                {/* Qty */}
                <td className="oh-num">{order.quantity}</td>
                {/* Exec price */}
                <td className="oh-num oh-price">
                  {order.price != null ? fmt(Number(order.price)) : <span className="oh-null">—</span>}
                </td>
                {/* Total */}
                <td className="oh-num">
                  {order.total_price != null ? fmt(order.total_price) : <span className="oh-null">—</span>}
                </td>
                {/* PnL */}
                <td className="oh-num">
                  {order.side === "SELL" && pnl != null ? (
                    <span className={`oh-pnl ${pnl >= 0 ? "oh-profit" : "oh-loss"}`}>
                      {pnl >= 0 ? "+" : ""}{fmt(pnl)}
                    </span>
                  ) : <span className="oh-null">—</span>}
                </td>
                {/* Execution / category */}
                <td>
                  <span className={`oh-category ${order.category === "STOPLOSS" ? "oh-sl" : order.category === "AUTO_SQUAREOFF" ? "oh-intra" : order.category?.toUpperCase() === "AI ALGO TRADING" ? "oh-ai-algo" : "oh-regular"}`}>
                    {order.category === "AUTO_SQUAREOFF" ? "Auto Squareoff" : order.category || "Regular"}
                  </span>
                </td>
                {/* Product Type / sell_type */}
                <td>
                  <span className={`oh-product-badge ${order.sell_type === "Intraday" ? "oh-intra-text" : "oh-delivery-text"}`}>
                    {order.sell_type || "Delivery"}
                  </span>
                </td>
                {/* Status */}
                <td>
                  <span className={`oh-status oh-status-${order.status?.toLowerCase()}`}>
                    {order.status}
                  </span>
                </td>
                {/* Date */}
                <td>
                  <div className="oh-date-cell">
                    <span className="oh-date-exec">{fmtDate(order.updated_at_ist || order.executed_at_ist || order.created_at_ist)}</span>
                  </div>
                </td>
              </tr>
            );
          })}
          {loading && Array.from({ length: orders.length === 0 ? 6 : 2 }).map((_, i) => (
            <SkeletonRow key={`sk-${i}`} cols={11} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════
   STOPLOSS ORDERS TAB
═══════════════════════════════════════════ */
function StoplossTab() {
  const { user } = useContext(AuthContext);
  const [orders, setOrders] = useState<StoplossOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    setLoading(true);
    fetch(`${HOST}/api/holdings/pending-stoploss`, { credentials: "include" })
      .then(r => r.json())
      .then((data: StoplossOrder[]) => { setOrders(data); setLoading(false); })
      .catch(() => { setError("Failed to load stoploss orders"); setLoading(false); });
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function deleteOrder(id: string) {
    if (!confirm("Delete this stoploss order?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`${HOST}/api/holdings/cancel-stoploss/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      setOrders(prev => prev.filter(o => o.id !== id));
    } catch {
      alert("Failed to delete. Please try again.");
    } finally {
      setDeleting(null);
    }
  }

  function startEdit(order: StoplossOrder) {
    setEditingId(order.id);
    setEditPrice(String(order.stop_trigger_price));
  }

  function discardEdit() { setEditingId(null); setEditPrice(""); }

  async function saveEdit(id: string) {
    const newPrice = Number(editPrice);
    if (!newPrice || newPrice <= 0) { alert("Enter a valid price"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${HOST}/api/holdings/edit-stoploss/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stop_trigger_price: newPrice }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setOrders(prev => prev.map(o =>
        o.id === id ? { ...o, stop_trigger_price: data.stop_trigger_price } : o
      ));
      discardEdit();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to update.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <p className="oh-empty">{error}</p>;
  if (!loading && orders.length === 0) return (
    <div className="oh-empty-state">
      <div className="oh-empty-icon">🎯</div>
      <p className="oh-empty-title">No pending stoploss orders</p>
      <p className="oh-empty-sub">Active stoploss orders will appear here. Delete them to cancel before they trigger.</p>
    </div>
  );

  return (
    <div className="oh-table-wrap">
      <div className="oh-sl-info">
        <span className="oh-sl-info-icon">ℹ️</span>
        These orders execute automatically when the trigger price is hit. Delete to cancel.
      </div>
      <table className="oh-table">
        <thead>
          <tr>
            <th>Stock</th>
            <th>Side</th>
            <th>Qty</th>
            <th>Trigger Price</th>
            <th>Type</th>
            <th>Category</th>
            <th>Placed At</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={8} />)
            : orders.map(order => (
              <tr key={order.id} className="oh-row">
                {/* Stock */}
                <td>
                  <div className="oh-stock-cell">
                    <span className="oh-stock-name">{order.name || order.symbol}</span>
                    <span className="oh-stock-symbol">{order.symbol}</span>
                  </div>
                </td>
                {/* Side */}
                <td>
                  <span className={`oh-badge oh-side ${order.side === "BUY" ? "oh-buy" : "oh-sell"}`}>
                    {order.side}
                  </span>
                </td>
                {/* Qty */}
                <td className="oh-num">{order.quantity}</td>
                {/* Trigger — display or inline edit */}
                <td>
                  {editingId === order.id ? (
                    <div className="oh-edit-row">
                      <input
                        className="oh-edit-input"
                        type="number"
                        value={editPrice}
                        min="0.01" step="0.05"
                        autoFocus
                        onChange={e => setEditPrice(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveEdit(order.id); if (e.key === "Escape") discardEdit(); }}
                      />
                      <button className="oh-save-btn" disabled={saving} onClick={() => saveEdit(order.id)}>
                        {saving ? <span className="oh-cancel-spinner" /> : "Save"}
                      </button>
                      <button className="oh-discard-btn" disabled={saving} onClick={discardEdit}>✕</button>
                    </div>
                  ) : (
                    <div className="oh-trigger-cell">
                      <span className="oh-trigger-icon">⚡</span>
                      <span className="oh-trigger-price">{fmt(Number(order.stop_trigger_price))}</span>
                      <button className="oh-pencil-btn" title="Edit price" onClick={() => startEdit(order)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    </div>
                  )}
                </td>
                {/* Order type */}
                <td><span className="oh-type-pill">{order.order_type || "MARKET"}</span></td>
                {/* Product / sell_type */}
                <td>
                  <span className={`oh-product-badge ${order.sell_type === "Intraday" ? "oh-intra-text" : "oh-delivery-text"}`}>
                    {order.sell_type || "Delivery"}
                  </span>
                </td>
                {/* Date */}
                <td><span className="oh-date-exec">{fmtDate(order.updated_at)}</span></td>
                {/* Delete */}
                <td className="oh-del-cell">
                  <button
                    className="oh-trash-btn"
                    disabled={deleting === order.id}
                    onClick={() => deleteOrder(order.id)}
                    title="Delete stoploss order"
                  >
                    {deleting === order.id
                      ? <span className="oh-cancel-spinner" />
                      : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2.2"
                          strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v6" /><path d="M14 11v6" />
                          <path d="M9 6V4h6v2" />
                        </svg>
                      )
                    }
                  </button>
                </td>
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
  );
}


/* ═══════════════════════════════════════════
   MAIN EXPORT
═══════════════════════════════════════════ */
export default function OrderHistory() {
  const [tab, setTab] = useState<Tab>("orders");

  return (
    <div className="oh-wrapper">
      {/* Header */}
      <div className="oh-header">
        <h2 className="oh-title">Orders</h2>
        <div className="oh-tabs">
          <button
            id="orders-tab-btn"
            className={`oh-tab-btn ${tab === "orders" ? "oh-tab-active" : ""}`}
            onClick={() => setTab("orders")}
          >
            Order History
          </button>
          <button
            id="stoploss-tab-btn"
            className={`oh-tab-btn ${tab === "stoploss" ? "oh-tab-active oh-tab-sl" : ""}`}
            onClick={() => setTab("stoploss")}
          >
            ⚡ Stoploss Orders
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="oh-card">
        {tab === "orders" && <OrdersTab />}
        {tab === "stoploss" && <StoplossTab />}
      </div>
    </div>
  );
}
