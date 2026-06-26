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
  ScatterController,
    LineController,      // ✅ ADD THIS
   // 👈 ADD THIS

} from "chart.js";
ChartJS.register(
  LinearScale,
  TimeScale,
  TimeSeriesScale,
  LineElement,
    LineController,      // ✅ ADD THIS

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
    if (!chart.options.plugins?.growwPlugin || !chart.options.plugins.growwPlugin.timeframe) return;
    const event = args.event;

    // Save mouse position for horizontal/marker hover detection
    chart.options.plugins.growwPlugin.mx = event.x;
    chart.options.plugins.growwPlugin.my = event.y;

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
      chart.options.plugins.growwPlugin.mx = null;
      chart.options.plugins.growwPlugin.my = null;
      chart.draw();
    }
  },

  afterDraw(chart: any) {
    if (!chart.options.plugins?.growwPlugin || !chart.options.plugins.growwPlugin.timeframe) return;
    const ctx = chart.ctx;
    const meta = chart.getDatasetMeta(0);
    if (!meta?.data?.length) return;

    ctx.save();

    const { left, right, top, bottom } = chart.chartArea;

    /* =====================
       BASELINE (PREVIOUS CLOSE)
    ===================== */
    const refPrice = chart.options.plugins?.growwPlugin?.referencePrice;
    if (refPrice != null && chart.scales.y) {
      const y = chart.scales.y.getPixelForValue(refPrice);
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.strokeStyle = "rgba(156, 163, 175, 0.45)"; // Soft grey
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }

    /* =====================
       STOPLOSS LINES
    ===================== */
    const mx = chart.options.plugins?.growwPlugin?.mx;
    const my = chart.options.plugins?.growwPlugin?.my;
    const slOrders = chart.options.plugins?.growwPlugin?.pendingSL ?? [];
    
    const ds = chart.data.datasets[0]?.data;
    const currentPrice = ds?.length ? (ds[ds.length - 1] as any).y : null;

    slOrders.forEach((sl: any) => {
      const slPrice = Number(sl.stop_trigger_price);
      if (slPrice && chart.scales.y) {
        const y = chart.scales.y.getPixelForValue(slPrice);
        if (y < top || y > bottom) return;

        const isBuy = sl.side === "BUY";
        const themeColor = isBuy ? "#3b82f6" : "#ef4444";
        
        // Detection
        const isHoveredLine = mx != null && my != null && Math.abs(my - y) < 8 && mx >= left && mx <= right;
        
        // Tiered proximity detection (0–1% = warning zone)
        const distRatio = currentPrice ? Math.abs(currentPrice - slPrice) / currentPrice : 1;
        const isClose    = currentPrice && distRatio < 0.01;  // within 1%
        const isModerate = currentPrice && distRatio < 0.005; // within 0.5%
        const isCritical = currentPrice && distRatio < 0.002; // within 0.2% — imminent!
        
        // Speed scales with urgency: critical = very fast, moderate = medium, far = slow
        const blinkSpeed = isCritical ? 45 : isModerate ? 65 :   100;
        const timeFactor = Date.now() / blinkSpeed;
        
        const isActive = !!(isClose || isHoveredLine);
        // Intensity also scales: critical is most vivid
        const intensityBase = isCritical ? 0.45 : isModerate ? 0.35 : 0.25;
        const intensityRange = isCritical ? 0.55 : isModerate ? 0.50 : 0.40;
        const pulse = isActive
          ? intensityBase + (Math.exp(Math.sin(timeFactor)) / Math.E) * intensityRange
          : 1;
        const glowMax = isCritical ? 16 : isModerate ? 12 : 8;
        const glowSize = isActive ? (Math.exp(Math.sin(timeFactor)) / Math.E) * glowMax : 0;

        ctx.save();
        
        // 1. PROXIMITY SHIELD BAND (scales with urgency)
        if (isClose && currentPrice) {
          const bandHeight = isCritical ? 32 : isModerate ? 24 : 16;
          const bandOpacity = isCritical ? pulse * 0.22 : isModerate ? pulse * 0.15 : pulse * 0.08;
          const auraGradient = ctx.createLinearGradient(0, y - bandHeight/2, 0, y + bandHeight/2);
          auraGradient.addColorStop(0, "rgba(255, 255, 255, 0)");
          auraGradient.addColorStop(0.5, isBuy ? `rgba(59, 130, 246, ${bandOpacity})` : `rgba(239, 68, 68, ${bandOpacity})`);
          auraGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
          ctx.fillStyle = auraGradient;
          ctx.fillRect(left, y - bandHeight/2, right - left, bandHeight);
        }

        if (isHoveredLine) {
          // --- SOLID ON HOVER ---
          ctx.strokeStyle = themeColor;
          ctx.globalAlpha = pulse;
          ctx.shadowBlur = glowSize;
          ctx.shadowColor = themeColor;
          ctx.lineWidth = 2.5; 
          ctx.setLineDash([]); 
          ctx.beginPath();
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
          ctx.stroke();
        } else if (isClose) {
          // --- CONNECTING BEAM ---
          const cp = meta.data[(ds as any[]).length - 1];
          if (cp) {
            ctx.save();
            ctx.setLineDash([3, 4]);
            ctx.strokeStyle = themeColor;
            ctx.globalAlpha = pulse * 0.75;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cp.x, cp.y);
            ctx.lineTo(cp.x, y);
            ctx.stroke();
            
            const distPct = (distRatio * 100).toFixed(2);
            ctx.font = `${isCritical ? "bold" : "600"} 9px 'Inter', sans-serif`;
            ctx.fillStyle = themeColor;
            ctx.globalAlpha = pulse;
            ctx.textAlign = "right";
            ctx.fillText(`${distPct}% away`, cp.x - 5, (cp.y + y) / 2 + 0.5);
            ctx.restore();
          }

          // --- PULSING DOTTED WHEN CLOSE ---
          ctx.strokeStyle = themeColor;
          ctx.globalAlpha = pulse;
          ctx.shadowBlur = glowSize;
          ctx.shadowColor = themeColor;
          ctx.lineWidth = isCritical ? 2.5 : isModerate ? 2 : 1.5;
          ctx.setLineDash([4, 4]); 
          ctx.beginPath();
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
          ctx.stroke();

          // --- CRITICAL "ALERT" TAG ---
          if (isCritical) {
            const alertText = "⚠ NEAR SL";
            ctx.save();
            ctx.font = "bold 9px 'Inter', sans-serif";
            const atw = ctx.measureText(alertText).width;
            const aw = atw + 12, ah = 16;
            const ax = left + 6, ay = y - ah - 4;
            ctx.globalAlpha = pulse;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(ax, ay, aw, ah, 3);
            else ctx.rect(ax, ay, aw, ah);
            ctx.fillStyle = themeColor;
            ctx.fill();
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(alertText, ax + aw / 2, ay + ah / 2);
            ctx.restore();
          }

        } else {
          // --- CLEAN HIGH-FREQ DOTTED (NORMAL) ---
          ctx.strokeStyle = isBuy ? "rgba(59, 130, 246, 0.35)" : "rgba(239, 68, 68, 0.35)";
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
          ctx.stroke();
        }
        ctx.restore();

        // 2. FLOATING HOVER TOOLTIP
        if (isHoveredLine && mx != null) {
          const labelText = `SL: ${sl.quantity} • ₹${slPrice.toFixed(2)}`;
          ctx.save();
          ctx.font = "600 11px 'Inter', sans-serif";
          const tw = ctx.measureText(labelText).width;
          
          const pw = tw + 16;
          const ph = 20;
          let px = mx - pw / 2;
          if (px < left + 4) px = left + 4;
          if (px + pw > right - 4) px = right - pw - 4;
          const py = y - ph - 10;

          ctx.shadowBlur = 10;
          ctx.shadowColor = "rgba(0,0,0,0.2)";

          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, 4);
          else ctx.rect(px, py, pw, ph);
          ctx.fillStyle = themeColor;
          ctx.fill();

          ctx.fillStyle = "#ffffff";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(labelText, px + pw / 2, py + ph / 2 + 0.5);
          ctx.restore();
        }
      }
    });

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

      /* --- PREMIUM VERTICAL CURSOR --- */
      const gradient = ctx.createLinearGradient(0, top, 0, bottom);
      gradient.addColorStop(0, "rgba(0, 179, 134, 0)");
      gradient.addColorStop(0.5, "rgba(0, 179, 134, 0.4)");
      gradient.addColorStop(1, "rgba(0, 179, 134, 0)");

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(p.x, top);
      ctx.lineTo(p.x, bottom);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      /* --- HOVER GLOW DOT --- */
      ctx.save();
      // Outer halo
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0, 179, 134, 0.15)";
      ctx.fill();
      // Inner dot
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#00b386";
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#00b386";
      ctx.fill();
      ctx.restore();

      /* label text */
      const priceText = `₹${Number(point.y).toFixed(2)}`;
      const timeframe =
  chart.options.plugins?.growwPlugin?.timeframe ?? "1D";

let dateText: string;

if (timeframe === "1D") {
  // Intraday — x is already IST-shifted as UTC, so read as UTC to avoid double +5:30
  dateText = new Date(point.x).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC"
  });
} else if (["1W", "1M"].includes(timeframe)) {
  // Short range — same: x is IST-as-UTC, read as UTC
  dateText = new Date(point.x).toLocaleDateString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
    timeZone: "UTC"
  });
} else {
  // 1Y, 3Y, 5Y, ALL — same: x is IST-as-UTC, read as UTC
  dateText = new Date(point.x).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
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

  // Draw trades that fall within the chart area
  trades.forEach((trade: any) => {
    const tradeTime = trade.x;
    const tradePrice = trade.y;

    if (!Number.isFinite(tradeTime) || !Number.isFinite(tradePrice)) return;

    const x = xScale.getPixelForValue(tradeTime);
    const y = yScale.getPixelForValue(tradePrice);

    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const isBuy = trade.side === "BUY";
    const color = isBuy ? "#10b981" : "#ef4444";
    
    // Detection: Is mouse near this marker?
    const isHovered = mx != null && my != null && Math.sqrt((mx - x)**2 + (my - y)**2) < 15;

    /* ── VERTICAL FADE LINE ── */
    ctx.save();
    const gradient = ctx.createLinearGradient(0, top, 0, bottom);
    gradient.addColorStop(0, `${color}00`);
    gradient.addColorStop(0.5, isHovered ? `${color}66` : `${color}22`);
    gradient.addColorStop(1, `${color}00`);

    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = isHovered ? 2 : 1;
    ctx.stroke();
    ctx.restore();

    /* ── PRICE-LEVEL MARKER ── */
    ctx.save();
    if (isHovered) {
      ctx.shadowBlur = 12;
      ctx.shadowColor = color;
    }
    ctx.beginPath();
    ctx.arc(x, y, isHovered ? 8 : 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    const markerText = isBuy ? "B" : "S";
    ctx.font = `700 ${isHovered ? 10 : 8}px Inter, system-ui`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(markerText, x, y + 0.5);
    ctx.restore();

    /* ── INFO PILL ON HOVER ── */
    if (isHovered) {
      const infoText = `${trade.quantity} Qty @ ₹${tradePrice.toFixed(2)}`;
      ctx.save();
      ctx.font = "600 10px Inter, sans-serif";
      const tw = ctx.measureText(infoText).width;
      const ph = 18;
      const pw = tw + 14;
      const px = x - pw / 2;
      const py = y - ph - 10;

      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, 4);
      else ctx.rect(px, py, pw, ph);
      
      ctx.fillStyle = "#1e293b";
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(infoText, x, py + ph / 2);
      ctx.restore();
    }
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
    LineController,      // ✅ ADD THIS

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
  pendingSL?: any[]
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
  trades,
  pendingSL
}: Props) {
  if (!lineData.length) return null;
// const today = new Date();
function getNseMarketWindowIST(anchorTs: number) {
  const d = new Date(anchorTs);

  // All lineData x-values have already been shifted +5.5h in StokesPageSSE
  // (e.g. 9:15 IST lives at the UTC timestamp for 9:15 "UTC").
  // So use the IST clock hours directly here to match that convention.
  return {
    marketOpen: Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      9, 15, 0   // 09:15 IST stored as 09:15 UTC (data is pre-shifted)
    ),
    marketClose: Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      15, 30, 0  // 15:30 IST stored as 15:30 UTC (data is pre-shifted)
    )
  };
}

const lastCandleTs = lineData[lineData.length - 1].x;
const maxTradeTs = trades.length ? Math.max(...trades.map(t => new Date(t.createdAtIST).getTime())) : 0;
const chartMax = Math.max(lastCandleTs, maxTradeTs);

const { marketOpen, marketClose } = getNseMarketWindowIST(lastCandleTs);
const finalMarketClose = Math.max(marketClose, chartMax);


// positions.created_at is now set with NOW() — pure UTC.
const tradePoints = trades.map(t => {
  const ts = t.createdAtIST;
  return {
    x: typeof ts === 'number' ? ts : new Date(ts).getTime(),
    y: t.pricePerShare,
    side: t.side,
    quantity: t.quantity
  };
});






  currentIndex = lineData.length - 1;
  const is1D = timeframe === "1D";

// Include trade prices in the scale so markers aren't cut off vertically
const allVisiblePrices = [...lineData.map(d => d.y)];
trades.forEach(t => {
  const ts = typeof t.createdAtIST === 'number' ? t.createdAtIST : new Date(t.createdAtIST).getTime();
  // Only include trade prices if they are within or near the current time range
  if (ts >= marketOpen && ts <= finalMarketClose) {
    allVisiblePrices.push(t.pricePerShare);
  }
});

const minPrice = Math.min(...allVisiblePrices);
const maxPrice = Math.max(...allVisiblePrices);
const pad = (maxPrice - minPrice) * 0.12 || minPrice * 0.005;
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




const chartData = lineData;
currentIndex = chartData.length - 1;

  

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
            growwPlugin: { 
              timeframe, 
              referencePrice: referencePrice??0, 
              trades: tradePoints,
              pendingSL: pendingSL || []
            }
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
            max: finalMarketClose,
            ticks: {
              stepSize: 60
            }
              }:{
              type: "timeseries",
              display: false,

              min:  undefined,
              max:  finalMarketClose > lastCandleTs ? finalMarketClose : undefined,

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
