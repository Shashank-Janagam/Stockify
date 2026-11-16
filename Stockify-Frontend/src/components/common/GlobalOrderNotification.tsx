import { useEffect, useState, useRef, useContext, useCallback } from "react";
import { useWebSocket } from "../../context/WebSocketContext";
import { AuthContext } from "../../auth/AuthProvider";
import StockLogo from "./StockLogo";

export type OrderNotificationData = {
  show: boolean;
  symbol: string;
  stockName?: string;
  side: "BUY" | "SELL";
  quantity?: number;
  price?: number;
  orderType?: string;
  orderId?: string | number;
  isStoploss?: boolean;
};

// Subtle pleasant chime for trade fill
const playSuccessSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
    gain1.gain.setValueAtTime(0.04, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.12);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.07);
    gain2.gain.setValueAtTime(0.05, ctx.currentTime + 0.07);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.07);
    osc2.stop(ctx.currentTime + 0.3);
  } catch (_) {}
};

export default function GlobalOrderNotification() {
  const { user } = useContext(AuthContext);
  const { lastMessage, subscribe, isConnected } = useWebSocket();
  const [notification, setNotification] = useState<OrderNotificationData | null>(null);

  const dismissTimerRef = useRef<any>(null);
  const lastKeyRef = useRef<string | null>(null);

  // Subscribe to USER_EVENTS globally so executions are received on ANY page
  useEffect(() => {
    if (user && isConnected) {
      subscribe("USER_EVENTS");
    }
  }, [user, isConnected]);

  const triggerNotification = useCallback(
    (data: {
      symbol: string;
      stockName?: string;
      side?: "BUY" | "SELL";
      quantity?: number;
      price?: number;
      orderType?: string;
      orderId?: string | number;
      isStoploss?: boolean;
    }) => {
      if (!data.symbol) return;
      const cleanSym = data.symbol.replace(/\.(NS|BO)$/i, "").trim().toUpperCase();
      const dedupKey = `${data.orderId || ""}_${data.side || ""}_${cleanSym}_${data.quantity || ""}`;

      if (dedupKey && lastKeyRef.current === dedupKey) return;
      lastKeyRef.current = dedupKey;

      setTimeout(() => {
        if (lastKeyRef.current === dedupKey) lastKeyRef.current = null;
      }, 4000);

      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);

      setNotification({
        show: true,
        symbol: cleanSym,
        stockName: data.stockName || cleanSym,
        side: data.side || "BUY",
        quantity: data.quantity ?? 1,
        price: data.price ? Number(data.price) : 0,
        orderType: data.orderType || "Market",
        orderId: data.orderId,
        isStoploss: data.isStoploss,
      });

      playSuccessSound();

      dismissTimerRef.current = setTimeout(() => {
        setNotification(null);
      }, 6000);
    },
    []
  );

  // 1. Listen for live WebSocket executions from Kafka
  useEffect(() => {
    if (lastMessage?.type === "ORDER_EXECUTED") {
      if (lastMessage.status && lastMessage.status !== "EXECUTED") return;
      const isStoploss = lastMessage.isStoploss === true || lastMessage.category === "STOPLOSS";
      const isAegis = lastMessage.category === "AEGIS";

      let orderTypeDisplay = lastMessage.orderType || "Market";
      if (isStoploss) {
        orderTypeDisplay = "Stoploss";
      } else if (isAegis) {
        orderTypeDisplay = "Aegis AI";
      }

      triggerNotification({
        symbol: lastMessage.symbol,
        stockName: lastMessage.stockName,
        side: lastMessage.side,
        quantity: lastMessage.quantity,
        price: lastMessage.price,
        orderType: orderTypeDisplay,
        orderId: lastMessage.orderId,
        isStoploss,
      });
    }
  }, [lastMessage, triggerNotification]);

  // 2. Listen for custom dispatch events (e.g., simulation trade fills)
  useEffect(() => {
    const handleCustomOrder = (e: any) => {
      if (e.detail) {
        triggerNotification(e.detail);
      }
    };
    window.addEventListener("STOCKIFY_ORDER_EXECUTED", handleCustomOrder);
    return () => window.removeEventListener("STOCKIFY_ORDER_EXECUTED", handleCustomOrder);
  }, [triggerNotification]);

  if (!notification?.show) return null;

  const isBuy = notification.side === "BUY";
  const qty = Number(notification.quantity) || 1;
  const unitPrice = Number(notification.price) || 0;
  const totalPriceVal = (qty * unitPrice).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const formattedUnitPrice = unitPrice.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const displayName = notification.stockName && notification.stockName !== notification.symbol
    ? notification.stockName
    : notification.symbol;

  return (
    <div
      style={{
        position: "fixed",
        top: "24px",
        right: "24px",
        zIndex: 999999,
        background: "#ffffff",
        borderRadius: "24px",
        border: "1px solid #f0f2f5",
        boxShadow: "0 18px 45px -8px rgba(0, 0, 0, 0.1), 0 4px 16px -2px rgba(0, 0, 0, 0.04)",
        animation: "slideInCard 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        width: "410px",
        maxWidth: "92vw",
        padding: "22px 24px",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color: "#0f172a",
        cursor: "pointer",
      }}
      onClick={() => setNotification(null)}
      title="Click to dismiss"
    >
      <style>{`
        @keyframes slideInCard {
          0% { transform: translateY(-20px) scale(0.97); opacity: 0; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>

      {/* ─── Top Row: Logo + Title + Status + "Just now" ─── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "14px" }}>
        {/* Left: Logo & Text */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flex: 1, minWidth: 0 }}>
          {/* Logo container squircle */}
          <div
            style={{
              width: "60px",
              height: "60px",
              minWidth: "60px",
              borderRadius: "16px",
              border: "1px solid #edf0f4",
              background: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "4px",
              overflow: "hidden",
            }}
          >
            <StockLogo
              symbol={notification.symbol}
              fallbackToAvatar={true}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
            />
          </div>

          {/* Title & Executed Subtitle */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              style={{
                margin: "0 0 5px 0",
                fontSize: "1.2rem",
                fontWeight: 800,
                color: "#0f172a",
                lineHeight: 1.25,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {displayName}
            </h3>

            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              {/* Solid Green Checkmark Circle */}
              <div
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  background: isBuy ? "#16a34a" : "#dc2626",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="3.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              <span
                style={{
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  color: isBuy ? "#16a34a" : "#dc2626",
                  letterSpacing: "-0.01em",
                }}
              >
                {notification.isStoploss
                  ? "Stop-loss order executed"
                  : isBuy
                  ? "Buy order executed"
                  : "Sell order executed"}
              </span>
            </div>
          </div>
        </div>

        {/* Right: "Just now" */}
        <span
          style={{
            fontSize: "0.9rem",
            color: "#94a3b8",
            fontWeight: 500,
            whiteSpace: "nowrap",
            paddingTop: "2px",
          }}
        >
          Just now
        </span>
      </div>

      {/* ─── Thin Divider Line ─── */}
      <div
        style={{
          height: "1px",
          background: "#f1f5f9",
          margin: "18px 0 16px 0",
        }}
      />

      {/* ─── Middle 3-Column Metrics Grid ─── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* Col 1: Quantity */}
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ fontSize: "0.92rem", color: "#64748b", fontWeight: 500, marginBottom: "4px" }}>
            Quantity
          </div>
          <div style={{ fontSize: "1.18rem", color: "#0f172a", fontWeight: 800, letterSpacing: "-0.01em" }}>
            {qty} {qty === 1 ? "share" : "shares"}
          </div>
        </div>

        {/* Divider 1 */}
        <div style={{ width: "1px", height: "36px", background: "#f1f5f9", margin: "0 14px" }} />

        {/* Col 2: Price */}
        <div style={{ flex: 1.1, textAlign: "left" }}>
          <div style={{ fontSize: "0.92rem", color: "#64748b", fontWeight: 500, marginBottom: "4px" }}>
            Price
          </div>
          <div style={{ fontSize: "1.18rem", color: "#0f172a", fontWeight: 800, letterSpacing: "-0.01em" }}>
            ₹{formattedUnitPrice}
          </div>
        </div>

        {/* Divider 2 */}
        <div style={{ width: "1px", height: "36px", background: "#f1f5f9", margin: "0 14px" }} />

        {/* Col 3: Order Type */}
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ fontSize: "0.92rem", color: "#64748b", fontWeight: 500, marginBottom: "4px" }}>
            Order type
          </div>
          <div style={{ fontSize: "1.18rem", color: "#0f172a", fontWeight: 800, letterSpacing: "-0.01em" }}>
            {notification.orderType || "Market"}
          </div>
        </div>
      </div>

      {/* ─── Bottom Mint Green Total Banner ─── */}
      <div
        style={{
          marginTop: "16px",
          background: isBuy ? "#eafaf1" : "#fef2f2",
          borderRadius: "14px",
          padding: "12px 18px",
          display: "flex",
          alignItems: "center",
        }}
      >
        {/* Trending arrow icon */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke={isBuy ? "#10b981" : "#ef4444"}
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
        >
          {isBuy ? (
            <>
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </>
          ) : (
            <>
              <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
              <polyline points="17 18 23 18 23 12" />
            </>
          )}
        </svg>

        {/* Vertical divider */}
        <div
          style={{
            width: "1.5px",
            height: "20px",
            background: isBuy ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)",
            margin: "0 16px",
          }}
        />

        {/* Total Text */}
        <div
          style={{
            fontSize: "1.25rem",
            fontWeight: 800,
            color: isBuy ? "#047857" : "#b91c1c",
            letterSpacing: "-0.02em",
          }}
        >
          Total: ₹{totalPriceVal}
        </div>
      </div>
    </div>
  );
}
