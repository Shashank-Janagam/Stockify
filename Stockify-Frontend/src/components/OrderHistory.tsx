import { useEffect, useState, useContext, useRef, useCallback } from "react";
import { AuthContext } from "../auth/AuthProvider";
import "../Styles/OrderHistory.css";

type Order = {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  total_price: number;
  status: string;
  created_at_ist: string;
  name:string;
  realized_pnl?: string | number;
};

export default function OrderHistory() {
  const { user } = useContext(AuthContext);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const observer = useRef<IntersectionObserver | null>(null);

  const HOST = import.meta.env.VITE_HOST_ADDRESS;

  // Last Element Reference for Infinite Scroll
  const lastOrderElementRef = useCallback((node: HTMLTableRowElement) => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prevPage => prevPage + 1);
      }
    });
    
    if (node) observer.current.observe(node);
  }, [loading, hasMore]);

  useEffect(() => {
    if (!user) return;

    let isMounted = true;

    const fetchOrders = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${HOST}/api/holdings/orders?page=${page}&limit=20`, {
          method: "GET",
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error("Failed to fetch orders");
        }

        const data = await res.json();
        console.log(data)
        if (isMounted) {
          setOrders(prev => page === 1 ? data : [...prev, ...data]);
          setHasMore(data.length === 20); // Assume more if we got full page
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        if (isMounted) {
          setError("Failed to load order history");
          setLoading(false);
        }
      }
    };

    fetchOrders();

    return () => {
      isMounted = false;
    };
  }, [user, HOST, page]);

  /* =========================
     SKELETON ROW COMPONENT
  ========================= */
  const SkeletonRow = () => (
    <tr className="sk-row">
      <td>
        <div style={{display:'flex', flexDirection:'column', gap: 6}}>
          <div className="sk-block sk-w-60"></div>
          <div className="sk-block sk-w-40" style={{height: 12}}></div>
        </div>
      </td>
      <td><div className="sk-block sk-badge"></div></td>
      <td><div className="sk-block sk-w-40"></div></td>
      <td><div className="sk-block sk-w-60"></div></td>
      <td><div className="sk-block sk-w-60"></div></td>
      <td><div className="sk-block sk-w-40"></div></td>
      <td><div className="sk-block sk-badge"></div></td>
    </tr>
  );

  return (
    <div className="orders-wrapper">
      <div className="orders-header">
        <h2>Order History</h2>
      </div>

      <div className="orders-card">
        {/* EMPTY STATE */}
        {orders.length === 0 && !loading && !error ? (
          <p className="no-orders">No orders found.</p>
        ) : (
          <table className="order-history-table">
            <thead className="order-history-thead">
              <tr>
                <th>Company</th>
                <th>Side</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Total Value</th>
                <th>PnL</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="order-history-tbody">
              {/* REAL DATA */}
              {orders.map((order, index) => {
                const isLast = index === orders.length - 1;
                return (
                  <tr 
                    key={order.id} 
                    ref={isLast ? lastOrderElementRef : null}
                  >
                    <td>
                      <div className="symbol-cell">
                        <span className="symbol-name">{order.name}</span>
                        <span className="order-date">
                          {new Date(order.created_at_ist).toLocaleString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Asia/Kolkata"
                          })}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`order-history-badge ${
                          order.side === "BUY" ? "buy" : "sell"
                        }`}
                      >
                        {order.side}
                      </span>
                    </td>
                    <td className="order-qty-cell">{order.quantity}</td>
                    <td className="order-price">
                      ₹
                      {Number(order.price).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="order-amount">
                      ₹
                      {Number(order.total_price).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="order-amount">
                       {order.side === 'SELL' && order.realized_pnl != null ? (
                          <span style={{ color: Number(order.realized_pnl) >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                              {Number(order.realized_pnl) >= 0 ? "+" : ""}
                              ₹{Number(order.realized_pnl).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </span>
                      ) : (
                          <span style={{ color: '#9ca3af' }}>-</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={`order-status-badge ${order.status.toLowerCase()}`}
                      >
                        {order.status}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {/* SKELETONS (Initial Load OR Loading More) */}
              {loading && (
                <>
                  {Array.from({ length: orders.length === 0 ? 8 : 2 }).map((_, i) => (
                    <SkeletonRow key={`sk-${i}`} />
                  ))}
                </>
              )}
            </tbody>
          </table>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
