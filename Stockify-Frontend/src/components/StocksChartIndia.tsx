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
  Tooltip
} from "chart.js";
ChartJS.register(
  LinearScale,
  TimeScale,
  TimeSeriesScale,
  LineElement,
  PointElement,
  Tooltip
);

import { Line } from "react-chartjs-2";
import "chartjs-adapter-date-fns";



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
    const refPrice = chart.options.plugins?.referencePrice;
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
      const dateText = new Date(point.x).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      });

      const yText = top + 18;

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
  growwPlugin
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
}

/* =========================
   STOCK CHART INDIA
========================= */
export default function StockChartIndia({
  lineData,
  timeframe,
  marketState
}: Props) {
  if (!lineData.length) return null;
const firstTs = lineData[0].x;
const baseDate = new Date(firstTs);

const marketOpen = new Date(
  baseDate.getFullYear(),
  baseDate.getMonth(),
  baseDate.getDate(),
  9, 15, 0
).getTime();

const marketClose = new Date(
  baseDate.getFullYear(),
  baseDate.getMonth(),
  baseDate.getDate(),
  15, 30, 0
).getTime();

  currentIndex = lineData.length - 1;
  const is1D = timeframe === "1D";

  const prices = lineData.map(d => d.y);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const pad = (maxPrice - minPrice) * 0.08 || minPrice * 0.002;
  const isMarketOpen=marketState==="REGULAR"
console.log("market",isMarketOpen)
  return (
    <div className="chart-container">
      <Line
        data={{
          datasets: [
            {
              data: lineData,
              borderColor: "#00b386",
              borderWidth: 3,
              pointRadius: 0,
              tension: is1D ? 0.05 : 0,
            }
          ]
        }}
        options={{
          animation: false,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
          },
          interaction: {
            intersect: false,
            mode: "index"
          },
          scales: {
x: {
  type: "timeseries",
  display: false,

  min: is1D ? marketOpen : undefined,
  max: is1D ? marketClose : undefined,

  time: {
    unit: is1D ? "minute" : "day",
    tooltipFormat: is1D ? "HH:mm" : "dd MMM"
  }
}



,
            y: {
              display: false,
              min: minPrice - pad,
              max: maxPrice + pad
            }
          }
        }}
      />
    </div>
  );
}
