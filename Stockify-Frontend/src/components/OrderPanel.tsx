import "../Styles/orderPanel.css";
import { useState, useEffect } from "react";
import { useContext } from "react";
import { AuthContext } from "../auth/AuthProvider";
import imageinvest from "../assets/imageinv.png";
import AddMoneyCard from "./AddMoneyCard";

type OrderPanelProps = {
  symbol: string;
  companyName: string;
  price: number;
  changePercent: number;
  fullExchangeName: "NSE" | "BSE";
  onLoginClick: () => void;
  rerefresh: () => void;
  trades: Trade[];
  availableQty: number;
  intradayQty?: number;
  deliveryQty?: number;
  refresh: number;
  onBuySellChange?: (type: "BUY" | "SELL") => void;
  onModeChange?: (mode: "Delivery" | "Intraday") => void;
  onQtyChange?: (qty: number) => void;
  onSubmit?: (data: {
    type: "BUY" | "SELL";
    mode: "Delivery" | "Intraday";
    qty: number;
  }) => void;
};

type Balance = {
  cash: number;
  blocked: number;
};

type Trade = {
  side: "BUY" | "SELL";
  quantity: number;
  pricePerShare: number;
  createdAtIST: string;
};

export default function OrderPanel({
  trades,
  symbol,
  price,
  companyName,
  fullExchangeName,
  onLoginClick,
  changePercent,
  onBuySellChange,
  onModeChange,
  onQtyChange,
  onSubmit,
  availableQty,
  intradayQty = 0,
  deliveryQty = 0,
  refresh,
  rerefresh,
}: OrderPanelProps) {
  const [tab, setTab] = useState<"BUY" | "SELL">("BUY");
  const [mode, setMode] = useState<"Delivery" | "Intraday">("Delivery");
  const [qty, setQty] = useState<string>("");
  const currentAvailable = mode === "Delivery" ? deliveryQty : intradayQty;
  const [approxReq, setApprox] = useState<number>(0);
  const [slEnabled, setSlEnabled] = useState(false);
  const [slType, setSlType] = useState<"PRICE" | "PERCENT">("PERCENT");
  const [slValue, setSlValue] = useState<string>("");
  const [orderType, setOrderType] = useState<"Market" | "Limit">("Market");
  const [limitPrice, setLimitPrice] = useState<string>("");

  const HOST = import.meta.env.VITE_HOST_ADDRESS || "";

  const [showAddMoney, setShowAddMoney] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user } = useContext(AuthContext);
  const [token, setToken] = useState<string | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [warning, setWarning] = useState<string>("Market order might be subject to price fluctuation");
  const [sellValue, setSellValue] = useState<number>(0);
  const [StockChange, setStockChange] = useState<number>(0);
  const [StockChangePercent, setStockChangePercent] = useState<number>(0);

  const HOST_ADDR = HOST;

  async function placeOrder() {
    if (!user || !token) return;
    try {
      setLoading(true);
      const finalQty = parseInt(qty, 10);
      if (isNaN(finalQty) || finalQty <= 0) {
        alert("Enter a valid quantity");
        return;
      }

      const val = Number(slValue) || 0;
      let finalSlPrice = 0;
      if (slEnabled && val > 0) {
        // BUY SL: trigger is ABOVE current price (buy if price rises to X)
        finalSlPrice = slType === "PRICE" ? val : price * (1 + val / 100);
      }

      const res = await fetch(`${HOST_ADDR}/api/orderExecution/buy`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          quantity: finalQty,
          sl_enabled: slEnabled,
          sl_price: Number(finalSlPrice.toFixed(2)),
          product_type: mode,   // "Delivery" | "Intraday"
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Order failed");
      console.log("Order placed:", data);
    } catch (err) {
      console.error("Failed to place order", err);
    } finally {
      setLoading(false);
      setQty("");
      rerefresh();
    }
  }

  async function sellShares() {
    if (!user || !token) return;
    try {
      setLoading(true);
      const finalQty = parseInt(qty, 10);
      if (isNaN(finalQty) || finalQty <= 0) {
        alert("Enter a valid quantity");
        return;
      }

      const val = Number(slValue) || 0;
      let finalSlPrice = 0;
      if (slEnabled && val > 0) {
        // SELL SL: trigger is BELOW current price (sell if price drops to X)
        finalSlPrice = slType === "PRICE" ? val : price * (1 - val / 100);
      }

      const res = await fetch(`${HOST_ADDR}/api/sellstock/sell`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          quantity: finalQty,
          sl_enabled: slEnabled,
          sl_price: Number(finalSlPrice.toFixed(2)),
          product_type: mode,   // "Delivery" | "Intraday"
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Order failed");
      console.log("Order placed:", data);
    } catch (err) {
      console.error("Failed to place order", err);
    } finally {
      setLoading(false);
      setQty("");
      rerefresh();
    }
  }

  useEffect(() => {
    if (!user || typeof user.getIdToken !== "function") return;
    let mounted = true;
    const fetchToken = async () => {
      try {
        const jwt = await user.getIdToken(true);
        if (mounted) setToken(jwt);
      } catch (err) {
        console.error("Failed to fetch token", err);
      }
    };
    fetchToken();
    return () => { mounted = false; };
  }, [user]);

  useEffect(() => {
    if (!trades || availableQty <= 0) return;
    let remainingQty = availableQty;
    let invested = 0;
    let pnl = 0;
    const buys = trades
      .filter((t) => t.side === "BUY")
      .sort(
        (a, b) =>
          new Date(b.createdAtIST).getTime() -
          new Date(a.createdAtIST).getTime()
      );
    for (const lot of buys) {
      if (remainingQty <= 0) break;
      const q = Math.min(lot.quantity, remainingQty);
      invested += q * lot.pricePerShare;
      pnl += q * (price - lot.pricePerShare);
      remainingQty -= q;
    }
    setStockChange(pnl);
    setStockChangePercent(invested > 0 ? (pnl / invested) * 100 : 0);
  }, [trades, price, availableQty]);

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    const fetchBalance = async () => {
      try {
        const res = await fetch(`${HOST_ADDR}/api/getBalance/getBalance`, {
          method: "GET",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch balance");
        const data = await res.json();
        if (mounted) setBalance(data);
      } catch (err) {
        console.error(err);
      }
    };
    fetchBalance();
    return () => { mounted = false; };
  }, [token, refresh]);

  useEffect(() => {
    const required = Number(qty || 0) * price;
    setApprox(required);
    const q = Number(qty || 0);

    if (tab === "BUY") {
      if (required > (balance?.cash ?? 0)) {
        setWarning("Available amount is not enough");
      } else {
        setWarning("Market order might be subject to price fluctuation");
      }
    }

    if (tab === "SELL") {
      setSellValue(q * price);
      if (q > currentAvailable) {
        setWarning(`You don't have enough ${mode} shares to sell`);
      } else {
        setWarning("Market order might be subject to price fluctuation");
      }
    }
  }, [qty, price, balance, tab, currentAvailable, mode]);

  useEffect(() => {
    if (!slEnabled || !slValue) return;
    if (slType === "PRICE") {
      const val = Number(slValue);
      if (tab === "BUY") {
        if (val >= price) {
          setWarning("Stoploss trigger must be lower than buy price");
        } else if (warning.startsWith("Stoploss")) {
          setWarning("Market order might be subject to price fluctuation");
        }
      } else if (tab === "SELL") {
        // SELL SL trigger must be LOWER than current price (sell if drops to X)
        if (val >= price) {
          setWarning("Stoploss trigger must be lower than current price");
        } else if (warning.startsWith("Stoploss")) {
          setWarning("Market order might be subject to price fluctuation");
        }
      }
    } else {
      const val = Number(slValue);
      if (val > 50) {
        setWarning("Stoploss percentage reasonable limit is 50%");
      } else if (warning.startsWith("Stoploss")) {
        setWarning("Market order might be subject to price fluctuation");
      }
    }
  }, [slEnabled, slValue, slType, tab, price]);

  const qtyNum = Number(qty);

  /* ─── NOT LOGGED IN ─── */
  if (!user) {
    return (
      <div className="login-cta">
        <div className="cta-illustration">
          <img src={imageinvest} alt="Invest illustration" />
        </div>
        <h2 className="cta-title">Want to invest in this stock?</h2>
        <p className="cta-subtitle">
          Open a free Demat account in minutes to start investing in stocks.
        </p>
        <button className="cta-button" onClick={onLoginClick}>
          Buy now
        </button>
      </div>
    );
  }

  /* ─── ADD MONEY FLOW ─── */
  if (showAddMoney) {
    return (
      <AddMoneyCard
        initialAmount={approxReq - (balance?.cash ?? 0)}
        onPaymentSuccess={() => {
          setShowAddMoney(false);
          rerefresh();
        }}
      />
    );
  }

  const isBuy = tab === "BUY";

  return (
    <div className="order-panel">

      {/* ── HEADER ── */}
      <div className="op-header">
        <h2>{companyName}</h2>
        <p>
          {fullExchangeName} : ₹{price.toFixed(2)}{" "}
          <span className={changePercent >= 0 ? "pos" : "neg"}>
            ({changePercent.toFixed(2)}%)
          </span>

          {availableQty > 0 && (
            <>
              <br />
              <div className="holding-info-container">
                <div className="holding-row primary">
                  <span className="label">Total Holdings</span>
                  <span className="val">{availableQty}</span>
                </div>
                <div className="holding-grid">
                  <div className="holding-sub">
                    <span className="label">Intraday</span>
                    <span className="val">{intradayQty}</span>
                  </div>
                  <div className="holding-sub">
                    <span className="label">Delivery</span>
                    <span className="val">{deliveryQty}</span>
                  </div>
                </div>
                <div className="holding-status-bar">
                  <span className="mode-tag">{mode} Available</span>
                  <span className={`avail-val ${currentAvailable > 0 ? "pos" : ""}`}>
                    {currentAvailable} shares
                  </span>
                </div>
              </div>

              {/* Live P&L */}
              <p
                className={`stock-caption ${
                  StockChange >= 0 ? "pos" : "neg"
                }`}
                style={{ marginTop: 4 }}
              >
                {StockChange >= 0 ? "You're up by " : "You're down by "}
                <strong>
                  ₹
                  {Math.abs(StockChange).toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </strong>{" "}
                ({StockChangePercent >= 0 ? "+" : "-"}
                {Math.abs(StockChangePercent).toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                %)
              </p>
            </>
          )}
        </p>
      </div>

      {/* ── BUY / SELL TABS ── */}
      <div className="border-tabs">
        <div className="op-tabs">
          <button
            className={isBuy ? "active buy" : ""}
            onClick={() => { setTab("BUY"); onBuySellChange?.("BUY"); }}
          >
            BUY
          </button>
          <button
            className={!isBuy ? "active sell" : ""}
            onClick={() => { setTab("SELL"); onBuySellChange?.("SELL"); }}
          >
            SELL
          </button>
        </div>
      </div>

      {/* ── PRODUCT & ORDER TYPES (Consolidated Row) ── */}
      <div className="op-options mixed">
        <div className="op-group">
          <button
            className={mode === "Delivery" ? "selected" : ""}
            onClick={() => { setMode("Delivery"); onModeChange?.("Delivery"); }}
          >
            Delivery
          </button>
          <button
            className={mode === "Intraday" ? "selected" : ""}
            onClick={() => { setMode("Intraday"); onModeChange?.("Intraday"); }}
          >
            Intraday
          </button>
        </div>

        <div className="op-group">
          {(["Market", "Limit"] as const).map((t) => (
            <button
              key={t}
              className={orderType === t ? "selected" : ""}
              onClick={() => t !== "Limit" && setOrderType(t)}
              disabled={t === "Limit"}
              style={t === "Limit" ? { opacity: 0.5, cursor: "not-allowed" } : {}}
            >
              {t}
            </button>
          ))}
        </div>

        <button
          className={`mtf ${slEnabled ? "selected" : ""}`}
          onClick={() => setSlEnabled(!slEnabled)}
        >
          SL
        </button>
      </div>

      {/* ── QTY — stepper ── */}
      <div className="op-field">
        <div className="type">
          <div className="Qty">Qty</div>
          <div className="Stype">{fullExchangeName}</div>
        </div>
        <div className="input-wrapper" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <button
            style={{
              width: 32, height: 36, border: "1px solid #d1d5db",
              borderRadius: "8px 0 0 8px", background: "#f3f4f6",
              fontSize: 18, cursor: "pointer", flexShrink: 0,
            }}
            onClick={() => {
              const n = Math.max(0, qtyNum - 1);
              setQty(n > 0 ? String(n) : "");
              onQtyChange?.(n);
            }}
          >−</button>
          <input
            type="number"
            value={qty}
            inputMode="numeric"
            className="qty-input"
            placeholder="0"
            style={{ borderRadius: 0, textAlign: "center", width: "100%" }}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "") { setQty(""); onQtyChange?.(0); return; }
              if (Number(val) < 0) return;
              setQty(val);
              onQtyChange?.(Number(val));
            }}
          />
          <button
            style={{
              width: 32, height: 36, border: "1px solid #d1d5db",
              borderRadius: "0 8px 8px 0", background: "#f3f4f6",
              fontSize: 18, cursor: "pointer", flexShrink: 0,
            }}
            onClick={() => {
              const n = qtyNum + 1;
              setQty(String(n));
              onQtyChange?.(n);
            }}
          >+</button>
        </div>
      </div>

      {/* ── PRICE field ── */}
      <div className="op-field">
        <div className="type">
          <div className="Qty">Price</div>
          <div className="Stype">{orderType}</div>
        </div>
        <div className="input-wrapper" style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {orderType === "Market" ? (
            <button className="market-btn" style={{ flex: 1 }}>
              At market · ₹{price.toFixed(2)}
            </button>
          ) : (
            <>
              <button
                style={{
                  width: 32, height: 36, border: "1px solid #d1d5db",
                  borderRadius: "8px 0 0 8px", background: "#f3f4f6",
                  fontSize: 18, cursor: "pointer", flexShrink: 0,
                }}
                onClick={() => {
                  const n = Math.max(0, Number(limitPrice || price) - 0.05);
                  setLimitPrice(n.toFixed(2));
                }}
              >−</button>
              <input
                type="number"
                value={limitPrice}
                placeholder={price.toFixed(2)}
                className="qty-input"
                style={{ borderRadius: 0, textAlign: "center", width: "100%" }}
                onChange={(e) => {
                  if (Number(e.target.value) < 0) return;
                  setLimitPrice(e.target.value);
                }}
              />
              <button
                style={{
                  width: 32, height: 36, border: "1px solid #d1d5db",
                  borderRadius: "0 8px 8px 0", background: "#f3f4f6",
                  fontSize: 18, cursor: "pointer", flexShrink: 0,
                }}
                onClick={() => {
                  const n = Number(limitPrice || price) + 0.05;
                  setLimitPrice(n.toFixed(2));
                }}
              >+</button>
            </>
          )}
        </div>
      </div>

      {/* ── STOPLOSS INPUT ── */}
      {slEnabled && (
        <div className="op-field sl-field">
          <div className="type">
            <div className="Qty">SL Trigger</div>
            <div
              className="sl-toggle"
              onClick={() => setSlType(slType === "PRICE" ? "PERCENT" : "PRICE")}
            >
              {slType === "PRICE" ? "Price" : "%"} ⇋
            </div>
          </div>
          <div className="input-wrapper">
            <input
              type="number"
              value={slValue}
              placeholder={slType === "PRICE" ? "Trigger Price" : "Percentage %"}
              className="qty-input"
              onChange={(e) => {
                if (Number(e.target.value) < 0) return;
                setSlValue(e.target.value);
              }}
            />
            {slValue && !isNaN(Number(slValue)) && (
              <div className="sl-hint">
                {(() => {
                  const val = Number(slValue);
                  const tPrice =
                    slType === "PRICE"
                      ? val
                      : price * (1 - val / 100);  // both BUY & SELL SL: trigger below current
                  return isBuy
                    ? `Pending BUY triggers when price reaches ₹${tPrice.toFixed(2)}`
                    : `Executes SELL if price drops to ₹${tPrice.toFixed(2)}`;
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── FOOTER ── */}
      <div className="footer">
        <div className="op-warning">{warning}</div>

        <div className="line" />

        <div className="op-footer">
          <div className="money">
            {isBuy ? (
              <>
                <div className="money-row">
                  <span className="money-label">Balance</span>
                  <span className="money-val">₹{balance?.cash.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? 0}</span>
                </div>
                <div className="money-row">
                  <span className="money-label">Approx Req.</span>
                  <span className="money-val req">₹{approxReq.toLocaleString("en-IN")}</span>
                </div>
              </>
            ) : (
              <>
                <div className="money-row">
                  <span className="money-label">Available ({mode})</span>
                  <span className="money-val">{currentAvailable} shares</span>
                </div>
                <div className="money-row">
                  <span className="money-label">Approx Value</span>
                  <span className="money-val sell">₹{sellValue.toLocaleString("en-IN")}</span>
                </div>
              </>
            )}
          </div>

          <button
            className="cta-button"
            style={{ marginTop: 10, background: isBuy ? "#04ad83" : "#dc2626" }}
            disabled={
              loading ||
              Number(qty) <= 0 ||
              (tab === "SELL" && Number(qty) > currentAvailable)
            }
            onClick={async () => {
              if (loading) return;
              if (isBuy) {
                if (approxReq > (balance?.cash ?? 0)) {
                  setShowAddMoney(true);
                  return;
                }
                await placeOrder();
              }
              if (!isBuy) {
                if (Number(qty) > availableQty) return;
                await sellShares();
              }
              onSubmit?.({ type: tab, mode, qty: Number(qty) });
            }}
          >
            {loading ? (
              <span className="btn-loader" />
            ) : isBuy ? (
              approxReq > (balance?.cash ?? 0)
                ? "Add Money"
                : `Buy${qtyNum > 0 ? ` ${qtyNum}` : ""}`
            ) : (
              `Sell${qtyNum > 0 ? ` ${qtyNum}` : ""}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
