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
   SOUND EFFECTS
========================= */
const playAlertSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    const playTone = (freq: number, type: OscillatorType, startTime: number, duration: number, vol: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
      
      gain.gain.setValueAtTime(vol, ctx.currentTime + startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + startTime + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + startTime);
      osc.stop(ctx.currentTime + startTime + duration);
    };
    
    // Aggressive synth alert
    playTone(800, 'square', 0.0, 0.2, 0.1);
    playTone(600, 'square', 0.15, 0.2, 0.1);
    playTone(400, 'sawtooth', 0.3, 0.4, 0.15);
  } catch(e) {
    console.error("Audio play failed:", e);
  }
};

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
  const [candleInterval, setCandleInterval] = useState<"1m" | "5m">("1m");
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
  const [quote, setQuote] = useState<YahooQuote | null>(null);
  const [profile, setProfile] = useState<{ sector?: string; industry?: string } | null>(null);
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
      });

    // Also fetch profile for Sector/Industry
    fetch(`${HOST}/api/stocks/${encodeURIComponent(symbol)}/profile`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch profile");
        return res.json();
      })
      .then(data => {
        if (data && !data.error) {
          setProfile(data);
        }
      })
      .catch(err => console.error("Error fetching profile for header:", err));
  }, [symbol, timeframe, marketState]); // Added marketState to dependency for safer checks

  /* =========================
     1D → SSE (MARKET OPEN)
  ========================= */
  const { subscribe, unsubscribe, lastMessage, pauseBackgroundFeeds, resumeBackgroundFeeds } = useWebSocket();

  const [stoplossAlert, setStoplossAlert] = useState<{ show: boolean; symbol: string } | null>(null);

  useEffect(() => {
    // Force authentication on this WS connection so backend knows our userId for direct messages
    subscribe("USER_EVENTS");
    return () => unsubscribe("USER_EVENTS");
  }, []);

  // Listen for background Stoploss execution events
  useEffect(() => {
    if (lastMessage?.type === "ORDER_EXECUTED") {
      rerefresh();
      playAlertSound();
      setStoplossAlert({ show: true, symbol: lastMessage.symbol });
      setTimeout(() => setStoplossAlert(null), 8000);
    }
  }, [lastMessage]);

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
      subscribe("STOCK_LIVE", { symbol, interval: candleInterval });
    }
    // 🔴 MARKET CLOSED → STATIC
    else {
      fetch(`${HOST}/api/stocks/${symbol}/history?days=1&interval=${candleInterval}`)
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
        unsubscribe("STOCK_LIVE", { symbol, interval: candleInterval });
      }
    };
  }, [symbol, timeframe, marketState, candleInterval]);

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
    <>
      {stoplossAlert?.show && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(15px)',
            animation: 'fadeIn 0.3s ease-out'
          }}
        >
          <style>{`
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes popIn3D { 
              0% { opacity: 0; transform: perspective(1000px) scale(0.8) rotateX(20deg) translateY(40px); } 
              100% { opacity: 1; transform: perspective(1000px) scale(1) rotateX(0deg) translateY(0); } 
            }
            @keyframes spinBorder {
              100% { transform: rotate(360deg); }
            }
            @keyframes pulseAlert {
              0%, 100% { opacity: 1; transform: scale(1); filter: drop-shadow(0 0 15px rgba(239,68,68,0.8)); }
              50% { opacity: 0.7; transform: scale(0.95); filter: drop-shadow(0 0 5px rgba(239,68,68,0.4)); }
            }
          `}</style>
          
          <div style={{ position: 'relative', padding: '4px', borderRadius: '32px', overflow: 'hidden', animation: 'popIn3D 0.6s cubic-bezier(0.2, 1.2, 0.3, 1)' }}>
            {/* Rotating gradient border */}
            <div style={{
              position: 'absolute',
              top: '-50%', left: '-50%', width: '200%', height: '200%',
              background: 'conic-gradient(from 0deg, transparent 0%, transparent 35%, #ff0000 50%, transparent 65%, transparent 100%)',
              animation: 'spinBorder 2.5s linear infinite',
              zIndex: 0
            }}></div>

            <div 
              style={{
                background: 'linear-gradient(145deg, #111827, #030712)',
                borderRadius: '28px',
                padding: '3.5rem',
                maxWidth: '550px',
                width: '90vw',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                position: 'relative',
                zIndex: 1,
                boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8)'
              }}
            >
              {/* Background ambient glow */}
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '300px', height: '300px', background: 'radial-gradient(circle, rgba(239,68,68,0.15) 0%, transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none' }}></div>

              <div style={{
                width: '120px',
                height: '120px',
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '2rem',
                border: '2px solid rgba(239, 68, 68, 0.6)',
                zIndex: 1,
                animation: 'pulseAlert 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite'
              }}>
                <svg style={{ width: '60px', height: '60px', color: '#ff2222' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>

              <h2 style={{ fontSize: '3rem', fontWeight: 900, color: '#ffffff', marginBottom: '1.25rem', letterSpacing: '0.08em', zIndex: 1, textShadow: '0 0 25px rgba(239,68,68,0.7)', textTransform: 'uppercase' }}>
                STOPLOSS HIT
              </h2>
              
              <p style={{ fontSize: '1.35rem', color: '#e5e7eb', lineHeight: 1.7, zIndex: 1 }}>
                Protective trigger for <span style={{ color: '#ff4444', fontWeight: 900, fontSize: '1.6rem', padding: '0 6px', textShadow: '0 0 15px rgba(239,68,68,0.4)' }}>{stoplossAlert.symbol}</span> executed successfully.
              </p>

              <button 
                onClick={() => setStoplossAlert(null)}
                style={{
                  marginTop: '3rem',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.5)',
                  color: '#ff6666',
                  padding: '1rem 4rem',
                  borderRadius: '9999px',
                  fontWeight: 800,
                  fontSize: '1.2rem',
                  cursor: 'pointer',
                  transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                  zIndex: 1,
                  boxShadow: '0 0 20px rgba(239,68,68,0.15)'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.3)';
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 0 35px rgba(239,68,68,0.4)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 0 20px rgba(239,68,68,0.15)';
                }}
              >
                DISMISS
              </button>
            </div>
          </div>
        </div>
      )}
      <div className={`stock-page ${isIndex ? 'stock-page--index' : ''}`}>
      <div className="stock-left">
        <StockHeader
          companyName={companyName}
          symbol={symbol}
          price={price ?? 0}
          change={change}
          percent={percent}
          timeframe={timeframe}
          marketState={marketState}
          quote={quote}
          profile={profile}
        />
        <div className="chart-controls">
          <TimeframeBar
            active={timeframe}
            onChange={setTimeframe}
          />

          <div className="chart-type-toggle">
            <button
              className={chartType === "line" ? "active" : ""}
              onClick={() => setChartType("line")}
            >
              Line
            </button>
            <button
              className={chartType === "candle" ? "active" : ""}
              onClick={() => setChartType("candle")}
            >
              Candles
            </button>
            {chartType === "candle" && timeframe === "1D" && (
              <>
                <div style={{width: 1, backgroundColor: '#e2e8f0', margin: '0 4px', height: '16px'}}></div>
                <button
                  className={candleInterval === "1m" ? "active" : ""}
                  onClick={() => setCandleInterval("1m")}
                >
                  1m
                </button>
                <button
                  className={candleInterval === "5m" ? "active" : ""}
                  onClick={() => setCandleInterval("5m")}
                >
                  5m
                </button>
              </>
            )}
          </div>

          <button
            className="terminal-btn"
            onClick={() => window.open(`https://www.tradingview.com/chart/?symbol=NSE:${(symbol || "").replace(".NS", "")}`, "_blank")}
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
            ) : (() => {
              let fixedRange = undefined;
              if (timeframe === "1D") {
                const anchorTs = data.length > 0 ? data[data.length - 1].x : Date.now();
                const d = new Date(anchorTs);
                const marketOpen = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 9, 15, 0);
                const marketClose = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 15, 30, 0);
                fixedRange = { min: marketOpen / 1000, max: Math.max(marketClose, anchorTs) / 1000 };
              }
              return <StockChart data={formattedData} fixedXRange={fixedRange} />;
            })()}
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
            fullExchangeName={quote?.fullExchangeName === "BSE" ? "BSE" : "NSE"}
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
    </div>
    </>
  );
}
