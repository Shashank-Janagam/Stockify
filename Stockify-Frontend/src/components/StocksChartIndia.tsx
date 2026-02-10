// import {
//   Chart as ChartJS,
//   LinearScale,
//   TimeScale,
//   LineElement,
//   PointElement,
//   Tooltip
// } from "chart.js";

import {
  Chart as ChartJS,
  LinearScale,
  TimeScale,
  TimeSeriesScale,
  LineElement,
  PointElement,
  Tooltip,
  ScatterController   // 👈 ADD THIS

} from "chart.js";
ChartJS.register(
  LinearScale,
  TimeScale,
  TimeSeriesScale,
  LineElement,
  PointElement,
  Tooltip,
    ScatterController, // 👈 ADD THIS

);

import { Chart } from "react-chartjs-2";
import "chartjs-adapter-date-fns";
import { useEffect, useState } from "react";

type Trade = {
  side: "BUY" | "SELL";
  quantity: number;
  pricePerShare: number;
  createdAtIST: string;
};


/* =========================
   GLOBAL STATE
========================= */
let hoverIndex: number | null = null;
let currentIndex: number | null = null;

/* =========================
   GROWW STYLE PLUGIN
========================= */
/* =========================
   GLOBAL STATE
========================= */


/* =========================
   GROWW STYLE PLUGIN
========================= */
const growwPlugin = {
  id: "growwPlugin",

  afterEvent(chart: any, args: any) {
    const event = args.event;

    if (event.type === "mousemove") {
      const points = chart.getElementsAtEventForMode(
        event,
        "index",
        { intersect: false },
        false
      );
      hoverIndex = points.length ? points[0].index : null;
      chart.draw();
    }

    if (event.type === "mouseout") {
      hoverIndex = null;
      chart.draw();
    }
  },

  afterDraw(chart: any) {
    const ctx = chart.ctx;
    const meta = chart.getDatasetMeta(0);
    if (!meta?.data?.length) return;

    ctx.save();

    const { left, right, top, bottom } = chart.chartArea;

    /* =====================
       BASELINE (DOTTED)
    ===================== */
const refPrice =chart.options.plugins?.growwPlugin?.referencePrice;
    if (refPrice != null && chart.scales.y) {
      const y = chart.scales.y.getPixelForValue(refPrice);

      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.strokeStyle = "rgba(156,163,175,0.8)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /* =====================
       CURRENT PRICE DOT
    ===================== */
    if (currentIndex !== null && hoverIndex === null) {
      const p = meta.data[currentIndex];
      if (p) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = "#00b386";
        ctx.fill();
      }
    }

    /* =====================
       HOVER LINE + LABEL
    ===================== */
    if (hoverIndex !== null) {
      const p = meta.data[hoverIndex];
      const point = chart.data.datasets[0].data[hoverIndex] as any;
      if (!p || !point) return;

      /* vertical line */
      ctx.beginPath();
      ctx.moveTo(p.x, top);
      ctx.lineTo(p.x, bottom);
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1;
      ctx.stroke();

      /* hover dot */
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#00b386";
      ctx.fill();

      /* label text */
      const priceText = `₹${Number(point.y).toFixed(2)}`;
      const timeframe =
  chart.options.plugins?.growwPlugin?.timeframe ?? "1D";

let dateText: string;

if (timeframe === "1D") {
  // Intraday
  dateText = new Date(point.x).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit"
  });
} else if (["1W", "1M"].includes(timeframe)) {
  // Short range
  dateText = new Date(point.x).toLocaleDateString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short"
  });
} else {
  // 1Y, 3Y, 5Y, ALL
  dateText = new Date(point.x).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}


      const yText = top +14;

      ctx.font = "600 14px Inter, system-ui, sans-serif";
      const pw = ctx.measureText(priceText).width;

      ctx.font = "12px Inter, system-ui, sans-serif";
      const dw = ctx.measureText(dateText).width;

      const labelWidth = pw + dw + 6;

      /* CLAMP X INSIDE CHART */
      let startX = p.x - labelWidth / 2;
      const minX = left + 6;
      const maxX = right - labelWidth - 6;

      if (startX < minX) startX = minX;
      if (startX > maxX) startX = maxX;

      /* optional background pill */
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.fillRect(startX - 6, yText - 14, labelWidth + 12, 20);

      /* price */
      ctx.font = "600 14px Inter, system-ui, sans-serif";
      ctx.fillStyle = "#111827";
      ctx.fillText(priceText, startX, yText);

      /* date */
      ctx.font = "12px Inter, system-ui, sans-serif";
      ctx.fillStyle = "#6b7280";
      ctx.fillText(dateText, startX + pw + 6, yText);
    }
    /* =====================
   TRADE VERTICAL LINES
===================== */
/* =====================
   TRADE MARKERS ON PRICE
===================== */
const trades =
  chart.options.plugins?.growwPlugin?.trades ?? [];

const xScale = chart.scales.x;
const yScale = chart.scales.y;

const dataPoints = chart.data.datasets[0]?.data as {
  x: number;
  y: number;
}[];

if (!Array.isArray(dataPoints) || !dataPoints.length) return;

trades.forEach((trade: Trade) => {
  const tradeTime = new Date(trade.createdAtIST).getTime();
  if (!Number.isFinite(tradeTime)) return;

  /* ── FIND NEAREST PRICE POINT ── */
  let nearestIndex = -1;
  let minDelta = Infinity;

  for (let i = 0; i < dataPoints.length; i++) {
    const delta = Math.abs(dataPoints[i].x - tradeTime);
    if (delta < minDelta) {
      minDelta = delta;
      nearestIndex = i;
    }
  }

  if (nearestIndex === -1) return;

  const pricePoint = dataPoints[nearestIndex];
  const x = xScale.getPixelForValue(pricePoint.x);
  const y = yScale.getPixelForValue(pricePoint.y);

  if (!Number.isFinite(x) || !Number.isFinite(y)) return;

  const isBuy = trade.side === "BUY";
  const color = isBuy ? "#16a34a" : "#dc2626";

  /* ── VERTICAL FADE LINE ── */
  const gradient = ctx.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, `${color}00`);
  gradient.addColorStop(0.4, `${color}55`);
  gradient.addColorStop(1, `${color}00`);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, bottom);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 1;
ctx.setLineDash([]);          // 🔥 solid line
ctx.lineWidth = 1.5;          // modern thickness
  ctx.stroke();
  ctx.restore();

  /* ── PRICE-LEVEL MARKER ── */
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 6;
  ctx.fill();

  /* ── LETTER INSIDE MARKER ── */
 const qtyText = String(trade.quantity);

ctx.font =
  trade.quantity >= 100
    ? "700 8px Inter, system-ui"
    : "700 9px Inter, system-ui";

ctx.fillStyle = "#ffffff";
ctx.textAlign = "center";
ctx.textBaseline = "middle";
ctx.fillText(qtyText, x, y + 0.5);

  ctx.restore();
});


    ctx.restore();
  }
};


/* =========================
   REGISTER
========================= */
ChartJS.register(
  LinearScale,
  TimeScale,
  LineElement,
  PointElement,
  Tooltip,
  growwPlugin,
    ScatterController, // 👈 ADD THIS

);

/* =========================
   TYPES
========================= */
type LinePoint = {
  x: number; // timestamp
  y: number; // price
};

interface Props {
  lineData: LinePoint[];
  timeframe: string;
  referencePrice?: number | null;
  marketState:string;
  percent:string
  trades:Trade[]
}

/* =========================
   STOCK CHART INDIA
========================= */
export function GraphSkeleton() {
  return (
    <div
      className="chart-container"
      style={{
        height: "360px",
        width: "100%",
        position: "relative",
        backgroundColor: "white",
        borderBottom: "1px solid #e5e7eb",
        overflow: "hidden"
      }}
    >
      {/* Groww-style loading dots */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          display: "flex",
          gap: "8px"
        }}
      >
        <span className="groww-dot" />
        <span className="groww-dot" />
        <span className="groww-dot" />
      </div>

      <style>
        {`
          .groww-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: #00b386;
            opacity: 0.3;
            animation: growwPulse 1.2s infinite ease-in-out;
          }

          .groww-dot:nth-child(2) {
            animation-delay: 0.15s;
          }

          .groww-dot:nth-child(3) {
            animation-delay: 0.3s;
          }

          @keyframes growwPulse {
            0% {
              transform: scale(0.8);
              opacity: 0.3;
            }
            50% {
              transform: scale(1.2);
              opacity: 1;
            }
            100% {
              transform: scale(0.8);
              opacity: 0.3;
            }
          }
        `}
      </style>
    </div>
  );
}






export  function StockChartIndia({
  lineData,
  timeframe,
  marketState,
  referencePrice,
  percent,
  trades
}: Props) {
  if (!lineData.length) return null;
const today = new Date();
const marketOpen = new Date(
  today.getFullYear(),
  today.getMonth(),
  today.getDate(),
  9, 15, 0, 0
).getTime();

const marketClose = new Date(
  today.getFullYear(),
  today.getMonth(),
  today.getDate(),
  15, 30, 0, 0
).getTime();

const tradePoints = trades.map(t => {
  const ts = new Date(t.createdAtIST).getTime();   // ✅ FIXED
  return {
    x: ts,
    y: t.pricePerShare,                        // ✅ FIXED
    side: t.side
  };
});





  currentIndex = lineData.length - 1;
  const is1D = timeframe === "1D";

const prices = [
  ...lineData.map(d => d.y),
  ...tradePoints.map(t => t.y)
];
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const pad = (maxPrice - minPrice) * 0.08 || minPrice * 0.002;
  const isMarketOpen=marketState==="REGULAR"
  const [lineColor,setLineColor]=useState("")
  useEffect(() => {
  const pct = Number(percent) || 0;

  setLineColor(
    pct > 0 ? "#00b386" :
    pct < 0 ? "#f76767" :
    "#9ca3af"
  );
}, [timeframe, percent]);


console.log("market open",marketOpen)
console.log("market close",marketClose)


const chartData = lineData;
currentIndex = chartData.length - 1;
console.log("trading points are-----",tradePoints)

  
console.log("market",isMarketOpen)

 return (
  <div className="chart-container">
    {chartData.length ? (
      <Chart
        key={`${timeframe}-${marketState}`}

        type="line"
        data={{
    datasets: [
  {
    data: chartData,
    borderColor: lineColor,
    borderWidth: 3,
    pointRadius: 0,
    tension: 0.05,
    parsing: false
  }
]

  }}
        options={{
          animation:false,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
            growwPlugin: { timeframe, referencePrice: referencePrice??0,trades }
          } as any,
          interaction: {
            intersect: false,
            mode: "index"
          },
          scales: {
            x: is1D && isMarketOpen ? {
            type: "linear",
            display: false,
            min: marketOpen,
            max: marketClose,
            ticks: {
              stepSize: 60
            }
              }:{
              type: "timeseries",
              display: false,

              min:  undefined,
              max:  undefined,

              time: {
                unit: is1D ? "minute" : "day",
                tooltipFormat: is1D ? "HH:mm" : "dd MMM"
              }
            },


            y: {
              display: false,
              min: minPrice - pad,
              max: maxPrice + pad
            }
          }
        }}
      />
    ) : (
      <div className="chart-empty">No data available</div>
    )}
  </div>
);

}
