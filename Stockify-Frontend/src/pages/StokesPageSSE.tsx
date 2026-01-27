import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import StockHeader from "../components/StockHeader";
import StockChartIndia from "../components/StocksChartIndia";
import TimeframeBar from "../components/TimeframeBar";
import OrderPanel from "../components/OrderPanel";
// import StockCandleChartIndia from "../components/StockCandleChartIndia";
import "../Styles/stock.css";
import StockPerformance from "../components/StockPerformanceFundamentals"
/* =========================
   TYPES
========================= */
type Candle = {
  x: number;
  c: number;
};

type YahooQuote = {
  regularMarketPrice: number;
  regularMarketPreviousClose: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  marketState: string;
  longName?:string;
  fullExchangeName?:string;
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
  "All": "ALL"
};

/* =========================
   MARKET HOURS
========================= */


/* =========================
   PAGE
========================= */
export default function StockPageSSE({onLoginClick}:{onLoginClick:()=>void}) {
  const { symbol = ""} = useParams<{
    symbol: string;
  }>();

  if (!symbol) return null;



  const [timeframe, setTimeframe] = useState("1D");
  const [loading, setLoading] = useState(true);

  const [lineData, setLineData] = useState<
  { x: number; y: number }[]
>([]);
const [marketState, setMarketState] = useState<string | null>(null);

const HOST=import.meta.env.VITE_HOST_ADDRESS

  const [price, setPrice] = useState<number | null>(null);
  const [baseline, setBaseline] = useState<number | null>(null);
  const [change, setChange] = useState<number>(0);
  const [percent, setPercent] = useState<number>(0);
  const [companyName,setCompanyName]=useState("");
  const[exchangeName,setExchangeName]=useState<"NSE"|"BSE">()
const [quote, setQuote] = useState<YahooQuote | null>(null);


 if (!symbol) {
    return null; // or <Navigate /> or fallback UI
  }

  useEffect(() => {
  fetch(`${HOST}/api/indiaSEE/${symbol}/quote`)
    .then(res => res.json())
    .then((q: YahooQuote) => {
      setMarketState(q.marketState);
      setQuote(q); 
      setCompanyName(q.longName??"");
      setPrice(q.regularMarketPrice);
      setBaseline(q.regularMarketPreviousClose);
      setChange(q.regularMarketChange);
      setPercent(q.regularMarketChangePercent);
const exchange =
  q.fullExchangeName === "NSE" || q.fullExchangeName === "BSE"
    ? q.fullExchangeName
    : "NSE";

setExchangeName(exchange);

      setLoading(false);
    });
}, [symbol]);

  /* =========================
     1D → SSE (MARKET OPEN)
  ========================= */
useEffect(() => {
  if (timeframe !== "1D") return;
  if (!marketState) return;

  // 🔥 RESET DATA WHEN SYMBOL CHANGES
  setLineData([]);

  let es: EventSource | null = null;

  // 🟢 MARKET OPEN / REPLAY → SSE
  if (marketState === "REGULAR") {
    es = new EventSource(
       `${HOST}/api/indiaSEE/${symbol}/stream`
    );
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);

      if (data.candles) {
        // ✅ ALWAYS UPDATE (no length check)
        setLineData(
          data.candles.map((d: Candle) => ({
            x: d.x,
            y: d.c
          }))
        );


        const last = data.candles[data.candles.length - 1];
        setPrice(last.c);
      }
      setQuote(data.quote)
    };

    es.onerror = () => {
      es?.close();
    };
  }
  // 🔴 MARKET CLOSED → STATIC
  else {
    fetch( `${HOST}/api/indiaSEE/${symbol}/history?days=1`)
      .then(res => res.json())
      .then((candles: Candle[]) => {
        setLineData(
          candles.map(d => ({
            x: d.x,
            y: d.c
          }))
        );
      });
  }

  // ✅ CLEANUP OLD SSE
  return () => {
    if (es) es.close();
  };
}, [symbol, timeframe, marketState]);


  /* =========================
     NON-1D → STATIC FETCH
  ========================= */
  useEffect(() => {
    if (timeframe === "1D") return;

    const days = timeframeToDays[timeframe];

    fetch( `${HOST}/api/indiaSEE/${symbol}/history?days=${days}`)
      .then(res => res.json())
      .then((data: Candle[]) => {
        if (!data.length) return;

        const first = data[0];
        const last = data[data.length - 1];

       setLineData(
  data.map(d => ({
    x: d.x,
    y: d.c
  }))
);


        setPrice(last.c);
        setBaseline(first.c);
        setChange(last.c - first.c);
        setPercent(((last.c - first.c) / first.c) * 100);
      })
      .finally(() => setLoading(false));
  }, [symbol, timeframe]);

  /* =========================
     RENDER
  ========================= */
  if (loading) {
    return <div style={{ height: 400 }} />;
  }
console.log("quote:",quote)
  return (
    <div className="stock-page">
      <div className="stock-left">
        <StockHeader
          companyName={companyName}
          symbol={symbol}
          price={price??0}
          change={change}
          percent={percent}
          timeframe={timeframe}
        />

        <StockChartIndia
          lineData={lineData}
          timeframe={timeframe}
          referencePrice={baseline}
          marketState={marketState??""}
        />
        <TimeframeBar
          active={timeframe}
          onChange={setTimeframe}
        />
        <StockPerformance quote={quote}/>
      </div>
      <div className="stock-right">
          <OrderPanel
            companyName={companyName}
            symbol={symbol}
            price={price??0}
            changePercent={percent}
            fullExchangeName={exchangeName??"NSE"}
            onLoginClick={onLoginClick}
            
          />
      </div>
    </div>
  );
}
