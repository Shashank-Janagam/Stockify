import React, { useEffect, useState, useContext, useRef } from "react";
import "../Styles/HoldingsPage.css";
import { AuthContext } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";
type Holding = {
  symbol: string;
  name: string;
  quantity: number;
  currentPrice: number;
  dayChangePercent: number;
  invested: number;
  current: number;
  pnl: number;
  pnlPercent: number;
  datetime:string
};

type Summary = {
  investedValue: number;
  currentValue: number;
  totalReturns: number;
  totalReturnsPercent: number;
};
function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
function getStockRoute(
  symbol: string,
  name: string
) {
  const symbol1 = symbol.trim().toUpperCase();
  const slug = slugify(name);


  if (symbol1.endsWith(".NS") || symbol1.endsWith(".BO")) {
    return `/indiaSEE/${symbol1}/${slug}`;
  }

  return `/us/${symbol1}/${slug}`;
}
const HOST = import.meta.env.VITE_HOST_ADDRESS;

/* ── Compact inline order drawer ── */
type DrawerState = { symbol: string; price: number; tab: "BUY" | "SELL"; availableQty: number } | null;

function InlineOrderDrawer({
  state, onClose, onDone
}: { state: DrawerState; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"BUY" | "SELL">(state?.tab ?? "BUY");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTab(state?.tab ?? "BUY");
    setQty("");
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [state?.symbol, state?.tab]);

  if (!state) return null;

  const estimated = (Number(qty) || 0) * state.price;
  const overSell  = tab === "SELL" && Number(qty) > state.availableQty;

  const submit = async () => {
    const finalQty = parseInt(qty, 10);
    if (isNaN(finalQty) || finalQty <= 0) return;
    setLoading(true);
    try {
      const url = tab === "BUY"
        ? `${HOST}/api/orderExecution/buy`
        : `${HOST}/api/sellstock/sell`;
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: state.symbol, quantity: finalQty, sl_enabled: false, sl_price: 0 }),
      });
      if (!res.ok) throw new Error();
      onDone();
    } catch {
      alert("Order failed. Please try again.");
    } finally {
      setLoading(false);
      setQty("");
    }
  };

  return (
    <div className="h-drawer">
      <div className="h-drawer-tabs">
        <button className={tab === "BUY"  ? "h-tab h-tab-buy active"  : "h-tab h-tab-buy"}  onClick={() => setTab("BUY")}>Buy</button>
        <button className={tab === "SELL" ? "h-tab h-tab-sell active" : "h-tab h-tab-sell"} onClick={() => setTab("SELL")}>Sell</button>
        <button className="h-drawer-close" onClick={onClose}>✕</button>
      </div>
      <div className="h-drawer-body">
        <span className="h-drawer-price">@ ₹{state.price.toFixed(2)}</span>
        <input
          ref={inputRef}
          type="number"
          className="h-drawer-qty"
          placeholder="Qty"
          min={1}
          value={qty}
          onChange={e => setQty(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !overSell && submit()}
        />
        <span className="h-drawer-est">≈ ₹{estimated.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
        <button
          className={tab === "BUY" ? "h-drawer-btn h-btn-buy" : "h-drawer-btn h-btn-sell"}
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

const HoldingsPage: React.FC = () => {
  const { user } = useContext(AuthContext);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [sseVersion, setSseVersion] = useState(0); // bumped after every order → restarts SSE
  const navigate = useNavigate();

  // Called by InlineOrderDrawer after a successful buy/sell
  const handleOrderDone = () => {
    setDrawer(null);
    setLoading(true);          // show skeleton while fresh data loads
    setSseVersion(v => v + 1); // triggers SSE useEffect cleanup + restart
  };

  useEffect(() => {
    if (!user) return;

    const es = new EventSource(`${HOST}/api/holdings/stocks/stream`, {
      withCredentials: true,
    });

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setHoldings(data.holdings);
      setSummary(data.summary);
      setLoading(false);
    };

    es.onerror = (err) => {
      console.error("SSE error:", err);
      es.close();
    };

    return () => {
      es.close();
    };
  }, [user, sseVersion]);


  return (
    <div className="holdings-wrapper">
      {/* LEFT */}
      <div className="holdings-left">
        {/* SUMMARY */}
        <div className="summary-card">
          {loading ? (
            <div className="holdings-skeleton holdings-sk-summary" />
          ) : (
            <>
              <div>
                <p className="label " >Current value</p>
                <h2 className={summary!.totalReturns >= 0 ? "positive" : "negative"}>₹{summary!.currentValue.toLocaleString("en-IN")}</h2>
                
              </div>

              <div>
                <p className="label">Invested value</p>
                <h2>₹{summary!.investedValue.toLocaleString("en-IN")}</h2>
              </div>

              <div>
                <p className="label">Total returns</p>
                <div className="percent">
                <h2 className={summary!.totalReturns >= 0 ? "positive" : "negative"}>
                  {summary!.totalReturns >= 0 ? "+" : ""}
                  ₹{summary!.totalReturns.toLocaleString("en-IN")}
                  
                </h2>
                <span className={summary!.totalReturns >= 0 ? "positive down" : "negative down"}>
                  {summary!.totalReturns >= 0 ? "+" : ""}
                  {summary!.totalReturnsPercent.toFixed(2)}%
                </span>
              </div>
              </div>
             
            </>
          )}
        </div>

        {/* TABLE */}
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Market price (1D)</th>
                <th>Returns</th>
                <th>Current / Invested</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      <td>
                        <div className="holdings-skeleton holdings-sk-cell h-w-60" />
                        <div className="holdings-skeleton holdings-sk-cell h-w-40" style={{ marginTop: 6, height: 14 }} />
                      </td>
                      <td>
                        <div className="holdings-skeleton holdings-sk-cell h-w-40" />
                        <div className="holdings-skeleton holdings-sk-cell h-w-40" style={{ marginTop: 6, height: 14 }} />
                      </td>
                      <td>
                        <div className="holdings-skeleton holdings-sk-cell h-w-40" />
                      </td>
                      <td>
                        <div className="holdings-skeleton holdings-sk-cell h-w-60" />
                        <div className="holdings-skeleton holdings-sk-cell h-w-40" style={{ marginTop: 6, height: 14 }} />
                      </td>
                    </tr>
                  ))
                : holdings.map(h => (
                    <React.Fragment key={h.symbol}>
                      <tr
                        onClick={() => navigate(getStockRoute(h.symbol, h.name))}
                        className="clickable"
                      >
                        <td>
                          <strong>{h.name}</strong>
                          <div className="muted">{h.quantity} shares</div>
                        </td>

                        <td>
                          <strong>₹{h.currentPrice}</strong>
                          <div className={h.dayChangePercent >= 0 ? "positive" : "negative"}>
                            {h.dayChangePercent >= 0 ? "+" : ""}
                            {h.dayChangePercent}%
                          </div>
                        </td>

                        <td className={h.pnl >= 0 ? "positive" : "negative"}>
                          <strong>
                            {h.pnl >= 0 ? "+" : ""}₹{h.pnl}
                          </strong>
                          <div>
                            {h.pnl >= 0 ? "+" : ""}
                            {h.pnlPercent}%
                          </div>
                        </td>

                        <td>
                          <strong>₹{h.current}</strong>
                          <div className="muted">₹{h.invested}</div>
                        </td>

                        {/* ── Per-row Buy / Sell buttons ── */}
                        <td className="h-action-cell" onClick={e => e.stopPropagation()}>
                          <button
                            className="h-action-btn h-buy"
                            onClick={() =>
                              setDrawer(d =>
                                d?.symbol === h.symbol && d.tab === "BUY" ? null
                                : { symbol: h.symbol, price: h.currentPrice, tab: "BUY", availableQty: h.quantity }
                              )
                            }
                          >Buy</button>
                          <button
                            className="h-action-btn h-sell"
                            onClick={() =>
                              setDrawer(d =>
                                d?.symbol === h.symbol && d.tab === "SELL" ? null
                                : { symbol: h.symbol, price: h.currentPrice, tab: "SELL", availableQty: h.quantity }
                              )
                            }
                          >Sell</button>
                        </td>
                      </tr>

                      {/* ── Inline drawer row — rendered only for the active holding ── */}
                      {drawer?.symbol === h.symbol && (
                        <tr className="h-drawer-row">
                          <td colSpan={5} className="h-drawer-cell">
                            <InlineOrderDrawer
                              state={drawer}
                              onClose={() => setDrawer(null)}
                              onDone={handleOrderDone}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

     
    </div>
  );
};

export default HoldingsPage;
