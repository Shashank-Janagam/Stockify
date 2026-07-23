import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import StockHeader from "../components/stocks/StockHeader";
import { StockChartIndia, GraphSkeleton } from "../components/charts/StocksChartIndia";
import TimeframeBar from "../components/charts/TimeframeBar";
import OrderPanel from "../components/stocks/OrderPanel";
// import {useContext} from "react"
// import { AuthContext } from "../auth/AuthProvider";
import { useWebSocket } from "../context/WebSocketContext";
import "../Styles/stock.css";
import StockPerformance from "../components/stocks/StockPerformanceFundamentals"
import AIStockReport from "../components/stocks/AIStockReport";
import CompanyNewsPanel from "../components/stocks/CompanyNewsPanel";
import CompanyProfile from "../components/stocks/CompanyProfile";
import StockSectorAlerts from "../components/stocks/StockSectorAlerts";
import { useContext } from "react"

import { AuthContext } from "../auth/AuthProvider";// import type { Stock } from "../data/stocks";
import StockChart from "../components/charts/StockChart";
/* =========================
   TYPES
========================= */

type Candle2 = {
  x: number;
  o: number;
  h: number;
  l: number;
  c: number;
}
type Trade = {
  side: "BUY" | "SELL";
  quantity: number;
  pricePerShare: number;
  createdAtIST: string;
};
type YahooQuote = {
  regularMarketPrice: number;
  regularMarketPreviousClose: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  marketState: string;
  longName?: string;
  shortName?: string;
  symbol?: string;
  fullExchangeName?: string;
};

/* =========================
   TIMEFRAME → DAYS
========================= */
const timeframeToDays: Record<string, number | "ALL"> = {
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
  "3Y": 1095,
  "5Y": 1825,
  "All": "ALL"
};

/* =========================
   MARKET HOURS
========================= */


/* =========================
   PAGE
========================= */
export default function StockPageSSE({ onLoginClick }: { onLoginClick: () => void }) {
  const { symbol = "" } = useParams<{
    symbol: string;
  }>();

  if (!symbol) return null;

  const isIndex = ["^NSEI", "^BSESN", "^NSEBANK", "^CNXMIDCAP", "NIFTY_FIN_SERVICE.NS"].includes(symbol.toUpperCase());



  const [timeframe, setTimeframe] = useState("1D");
  const [chartType, setChartType] = useState<"line" | "candle">("line");
  const [loading, setLoading] = useState(true);

  const [lineData, setLineData] = useState<
    { x: number; y: number }[]
  >([]);
  const [marketState, setMarketState] = useState<string | null>(null);

  const HOST = import.meta.env.VITE_HOST_ADDRESS || ""
  const [refresh, setRefresh] = useState(0)
  function rerefresh() {
    setRefresh(refresh + 1);
  }
  const [price, setPrice] = useState<number | null>(null);
  const [baseline, setBaseline] = useState<number | null>(null);
  const [change, setChange] = useState<number>(0);
  const [percent, setPercent] = useState<number>(0);
  const [companyName, setCompanyName] = useState("");
  const [exchangeName, setExchangeName] = useState<"NSE" | "BSE">()
  const [quote, setQuote] = useState<YahooQuote | null>(null);


  if (!symbol) {
    return null; // or <Navigate /> or fallback UI
  }

  const { user } = useContext(AuthContext);
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    if (!user) {
      return;
    }

    let isMounted = true;
    console.log("fetching token for user:", user)
    const fetchToken = async () => {
      try {
        const jwt = await user.getIdToken(true); // force refresh
        if (isMounted) {
          console.log("fetched token:", jwt)
          setToken(jwt);
        }
      } catch (err) {
        console.log("Failed to fetch token", err);
      }
    };

    fetchToken();

    return () => {
      isMounted = false;
    };
  }, [user]); // Added [user] dependency to stop infinite loop
  useEffect(() => {
    const updateRecent = async () => {
      if (!companyName || !symbol) return;
      if (isIndex) return;

      try {
        await fetch(`${HOST}/api/searchUpdates/hit`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol, name: companyName })
        });
      } catch (e) {
        // ignore safely
      }
    };

    updateRecent();
  }, [symbol, companyName]);

  const [trades, setTrades] = useState<Trade[]>([]);
  const [availableQty, setAvailableQty] = useState<number>(0);
  const [intradayQty, setIntradayQty] = useState<number>(0);
  const [deliveryQty, setDeliveryQty] = useState<number>(0);
  const [pendingSL, setPendingSL] = useState<any[]>([]);

  useEffect(() => {
    if (!token) return;
    fetch(`${HOST}/api/holdings/pending-stoploss`, {
      method: "GET",
      credentials: "include"
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const filtered = data.filter((o: any) => o.symbol === symbol);
          setPendingSL(filtered);
        }
      });
  }, [symbol, token, refresh]);

  useEffect(() => {
    if (!token) return;
    fetch(`${HOST}/api/sellstock/holding/${symbol}`, {
      method: "GET",
      credentials: "include"

    })
      .then(res => res.json())
      .then(data => {
        setTrades(data.trades);
        setAvailableQty(data.totalQuantity);
        setIntradayQty(data.intradayQuantity || 0);
        setDeliveryQty(data.deliveryQuantity || 0);
      });
  }, [symbol, token, refresh]);






  useEffect(() => {
    setLoading(true);

  }, [timeframe])
  useEffect(() => {
    // Only fetch quote if symbol changed OR market is open OR we don't have a quote yet
    const isMarketOpen = marketState === "REGULAR";
    if (quote && quote.symbol === symbol && !isMarketOpen && timeframe !== "1D") {
      // If we already have the quote for this symbol, market is closed, and we're just changing timeframe, 
      // we don't need to re-fetch the basic quote info unless it's 1D (where we might want latest status).
      return;
    }

    fetch(`${HOST}/api/stocks/${symbol}/quote`)
      .then(res => res.json())
      .then((q: YahooQuote) => {
        setMarketState(q.marketState);
        setQuote(q);
        setCompanyName(q.longName ?? q.shortName ?? q.symbol ?? symbol);
        setPrice(q.regularMarketPrice);
        setBaseline(q.regularMarketPreviousClose);
        setChange(q.regularMarketChange);
        setPercent(q.regularMarketChangePercent);
        const exchange =
          q.fullExchangeName === "NSE" || q.fullExchangeName === "BSE"
            ? q.fullExchangeName
            : "NSE";

        setExchangeName(exchange);
      });
  }, [symbol, timeframe, marketState]); // Added marketState to dependency for safer checks

  /* =========================
     1D → SSE (MARKET OPEN)
  ========================= */
  const { subscribe, unsubscribe, lastMessage, pauseBackgroundFeeds, resumeBackgroundFeeds } = useWebSocket();

  // ⏸️ Pause all background feeds while this stock page is active for faster updates
  useEffect(() => {
    pauseBackgroundFeeds();
    return () => {
      resumeBackgroundFeeds();
    };
  }, []);

  useEffect(() => {
    if (timeframe !== "1D") return;
    if (!marketState) return;

    // 🔥 RESET DATA WHEN SYMBOL CHANGES
    setLineData([]);

    // 🟢 MARKET OPEN / REPLAY → WS
    if (marketState === "REGULAR") {
      subscribe("STOCK_LIVE", { symbol });
    }
    // 🔴 MARKET CLOSED → STATIC
    else {
      fetch(`${HOST}/api/stocks/${symbol}/history?days=1`)
        .then(res => res.json())
        .then((candles: Candle2[]) => {
          const shifted = candles.map(d => ({
            ...d,
            x: d.x + 5.5 * 3600 * 1000
          }));
          setLineData(
            shifted.map(d => ({
              x: d.x,
              y: d.c
            }))
          );
          setData(shifted);
          setLoading(false);
        });
    }

    return () => {
      if (marketState === "REGULAR") {
        unsubscribe("STOCK_LIVE", { symbol });
      }
    };
  }, [symbol, timeframe, marketState]);

  useEffect(() => {
    if (lastMessage?.type === "STOCK_UPDATE" && lastMessage.symbol === symbol) {
      const { candles, quote } = lastMessage.data;
      if (candles) {
        const shifted = candles.map((d: any) => ({
          ...d,
          x: d.x + 5.5 * 3600 * 1000
        }));
        setLineData(
          shifted.map((d: any) => ({
            x: d.x,
            y: d.c
          }))
        );
        setData(shifted);
        const last = shifted[shifted.length - 1];
        if (last) setPrice(last.y || last.c);
        setLoading(false);
      }
      if (quote) setQuote(quote);
    }
  }, [lastMessage, symbol]);


  /* =========================
     NON-1D → STATIC FETCH
  ========================= */
  const [data, setData] = useState<Candle2[]>([]);
  useEffect(() => {
    if (timeframe === "1D") return;

    const days = timeframeToDays[timeframe];

    fetch(`${HOST}/api/stocks/${symbol}/history?days=${days}`)
      .then(res => res.json())
      .then((data: Candle2[]) => {
        if (!data.length) return;

        const shifted = data.map(d => ({
          ...d,
          x: d.x + 5.5 * 3600 * 1000
        }));

        const first = shifted[0];
        const last = shifted[shifted.length - 1];

        setLineData(
          shifted.map(d => ({
            x: d.x,
            y: d.c
          }))
        );

        setPrice(last.c);
        setBaseline(first.c);
        setChange(last.c - first.c);
        setPercent(((last.c - first.c) / first.c) * 100);
        setData(shifted);
      })
      .finally(() => setLoading(false));
  }, [symbol, timeframe]);
  const formattedData = [...data]
    .filter((v, i, a) => a.findIndex(t => t.x === v.x) === i) // Unique timestamps
    .sort((a, b) => a.x - b.x) // Chronological order
    .map((c) => ({
      // Timestamp already shifted by 5.5 hours at the source
      time: (c.x / 1000) as any,
      open: c.o,
      high: c.h,
      low: c.l,
      close: c.c,
    }));

  /* =========================
     RENDER
  ========================= */

  console.log("quote:", quote)
  return (
    <div className={`stock-page ${isIndex ? 'stock-page--index' : ''}`}>
      <div className="stock-left">
        <StockHeader
          companyName={companyName}
          symbol={symbol}
          price={price ?? 0}
          change={change}
          percent={percent}
          timeframe={timeframe}
        />
        <div className="chart-controls" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <TimeframeBar
            active={timeframe}
            onChange={setTimeframe}
          />

          <div className="chart-type-toggle" style={{ display: "flex", gap: "8px", background: "#f3f4f6", padding: "4px", borderRadius: "8px" }}>
            <button
              onClick={() => setChartType("line")}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "500",
                backgroundColor: chartType === "line" ? "#ffffff" : "transparent",
                boxShadow: chartType === "line" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                color: chartType === "line" ? "#00b386" : "#6b7280",
                transition: "all 0.2s"
              }}
            >
              Line
            </button>
            <button
              onClick={() => setChartType("candle")}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "none",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: "500",
                backgroundColor: chartType === "candle" ? "#ffffff" : "transparent",
                boxShadow: chartType === "candle" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                color: chartType === "candle" ? "#00b386" : "#6b7280",
                transition: "all 0.2s"
              }}
            >
              Candles
            </button>
          </div>

          <button
            onClick={() => window.open(`https://www.tradingview.com/chart/?symbol=${exchangeName ?? "NSE"}:${symbol.replace(".NS", "")}`, "_blank")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 16px",
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              backgroundColor: "#ffffff",
              color: "#374151",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
              transition: "all 0.2s",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = "#f9fafb";
              e.currentTarget.style.borderColor = "#d1d5db";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = "#ffffff";
              e.currentTarget.style.borderColor = "#e5e7eb";
            }}
          >
            <span>Terminal</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </button>
        </div>

        {loading && <GraphSkeleton />}

        {!loading && (
          <div className="main-chart-container" style={{ height: "400px", width: "100%" }}>
            {chartType === "line" ? (
              <StockChartIndia
                lineData={lineData}
                timeframe={timeframe}
                referencePrice={baseline}
                marketState={marketState ?? ""}
                trades={trades}
                percent={percent.toString()}
                pendingSL={pendingSL}
              />
            ) : (
              <StockChart data={formattedData} />
            )
            }
          </div>
        )}

        {!isIndex && <StockSectorAlerts symbol={symbol} />}
        {!isIndex && <StockPerformance quote={quote} />}
        {!isIndex && <CompanyProfile symbol={symbol} companyName={companyName} />}

      </div>
      {!isIndex && (
        <div className="stock-right">
          <OrderPanel
            companyName={companyName}
            symbol={symbol}
            price={price ?? 0}
            changePercent={percent}
            fullExchangeName={exchangeName ?? "NSE"}
            onLoginClick={onLoginClick}
            trades={trades}
            availableQty={availableQty}
            intradayQty={intradayQty}
            deliveryQty={deliveryQty}
            refresh={refresh}
            rerefresh={rerefresh}
          />
          <CompanyNewsPanel symbol={symbol} />
        </div>
      )}
      <AIStockReport symbol={symbol} />
    </div>
  );
}
