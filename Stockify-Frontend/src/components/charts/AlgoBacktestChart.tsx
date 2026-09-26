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
  ScatterController,
  zoomPlugin
);

import { Chart } from "react-chartjs-2";
import "chartjs-adapter-date-fns";
import zoomPlugin from "chartjs-plugin-zoom";
import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";

type Trade = {
  side: "BUY" | "SELL" | "PARTIAL";
  quantity: number;
  pricePerShare: number;
  createdAtIST: string | number;
  pnl?: number;
  reason?: string;
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
  id: "growwPluginV9",

  afterEvent(chart: any, args: any) {
    if (!chart.options.plugins?.growwPluginV9 || !chart.options.plugins.growwPluginV9.timeframe) return;
    const event = args.event;

    // Save mouse position for horizontal/marker hover detection
    chart.options.plugins.growwPluginV9.mx = event.x;
    chart.options.plugins.growwPluginV9.my = event.y;

    if (event.type === "mousemove") {
      const trades = chart.options.plugins.growwPluginV9.trades ?? [];
      const currentHovered = chart.options.plugins.growwPluginV9.mouseHoveredTradeIndex;
      
      let closestTrade = null;
      let minDistance = 25; // 25 pixels max hover radius

      let distToCurrent = Infinity;

      if (chart.scales.x && chart.scales.y && event.x != null && event.y != null) {
        
        // Find distance to current hovered trade (if any) to apply stickiness
        if (currentHovered !== null && currentHovered !== undefined) {
           const t = trades.find((tr: any) => tr.originalIndex === currentHovered);
           if (t) {
               const tx = chart.scales.x.getPixelForValue(t.x);
               const ty = chart.scales.y.getPixelForValue(t.y);
               if (Number.isFinite(tx) && Number.isFinite(ty)) {
                   distToCurrent = Math.sqrt(Math.pow(tx - event.x, 2) + Math.pow(ty - event.y, 2));
               }
           }
        }

        for (let i = 0; i < trades.length; i++) {
           const t = trades[i];
           const tx = chart.scales.x.getPixelForValue(t.x);
           const ty = chart.scales.y.getPixelForValue(t.y);
           if (!Number.isFinite(tx) || !Number.isFinite(ty)) continue;
           const dist = Math.sqrt(Math.pow(tx - event.x, 2) + Math.pow(ty - event.y, 2));
           
           if (dist < minDistance) {
               minDistance = dist;
               closestTrade = t.originalIndex;
           }
        }

        // Apply hysteresis: only switch if the new closest trade is significantly closer (e.g. > 8px closer),
        // or if the current one is no longer within the hover radius.
        if (currentHovered !== null && currentHovered !== undefined && distToCurrent <= 25) {
            if (closestTrade !== currentHovered && minDistance < distToCurrent - 8) {
                // Switch to new trade because it's significantly closer
            } else {
                // Stick to current trade
                closestTrade = currentHovered;
            }
        }
      }
      chart.options.plugins.growwPluginV9.mouseHoveredTradeIndex = closestTrade;

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
      chart.options.plugins.growwPluginV9.mx = null;
      chart.options.plugins.growwPluginV9.my = null;
      chart.options.plugins.growwPluginV9.mouseHoveredTradeIndex = null;
      chart.draw();
    }
  },

  afterDraw(chart: any) {
    if (!chart.options.plugins?.growwPluginV9 || !chart.options.plugins.growwPluginV9.timeframe) return;
    const ctx = chart.ctx;
    const meta = chart.getDatasetMeta(0);
    if (!meta?.data?.length) return;

    ctx.save();

    const { left, right, top, bottom } = chart.chartArea;

    /* =====================
       BASELINE (PREVIOUS CLOSE)
    ===================== */
    const refPrice = chart.options.plugins?.growwPluginV9?.referencePrice;
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
    const mx = chart.options.plugins?.growwPluginV9?.mx;
    const my = chart.options.plugins?.growwPluginV9?.my;
    const slOrders = chart.options.plugins?.growwPluginV9?.pendingSL ?? [];
    
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

      /* --- THIN BLACK VERTICAL CURSOR --- */
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(p.x, top);
      ctx.lineTo(p.x, bottom);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
      ctx.lineWidth = 1;
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

      /* indicator values at hover point */
      if (chart.data.datasets.length > 1) {
        let curX = startX + labelWidth + 14;
        for (let i = 1; i < chart.data.datasets.length; i++) {
          const ds = chart.data.datasets[i];
          if (!ds || !ds.data) continue;
          const dsData = ds.data as { x: number; y: number }[];
          const matchPt = dsData.find(pt => pt && Math.abs(Number(pt.x) - Number(point.x)) < 86400000);
          if (matchPt && matchPt.y != null && !isNaN(matchPt.y)) {
            const indLabel = ds.label || `Ind ${i}`;
            const isOsc = indLabel.includes("RSI") || indLabel.includes("Threshold") || indLabel.includes("Score");
            const valFormatted = isOsc ? Number(matchPt.y).toFixed(1) : `₹${Number(matchPt.y).toFixed(2)}`;
            const textToDraw = `${indLabel}: ${valFormatted}`;
            ctx.font = "600 11px Inter, system-ui, sans-serif";
            const tw = ctx.measureText(textToDraw).width;
            if (curX + tw + 12 < right - 6) {
              ctx.save();
              ctx.fillStyle = "rgba(255,255,255,0.95)";
              ctx.shadowColor = "rgba(0,0,0,0.06)";
              ctx.shadowBlur = 4;
              if (ctx.roundRect) ctx.roundRect(curX - 4, yText - 14, tw + 8, 20, 4);
              else ctx.fillRect(curX - 4, yText - 14, tw + 8, 20);
              ctx.fill();
              ctx.fillStyle = ds.borderColor || "#6366f1";
              ctx.fillText(textToDraw, curX, yText);
              ctx.restore();
              curX += tw + 14;
            }
          }
        }
      }
    }
    /* =====================
   TRADE VERTICAL LINES
===================== */
/* =====================
   TRADE MARKERS ON PRICE
===================== */
const trades =
  chart.options.plugins?.growwPluginV9?.trades ?? [];

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

    // Determine marker type and colors
    const isBuy = trade.side === "BUY";
    const isPartial = trade.side === "PARTIAL"; 
    let color = isBuy ? "#10b981" : "#ef4444";
    let text = isBuy ? "B" : "S";
    if (isPartial) { color = "#f59e0b"; text = "P"; }

    const activeTradeIndex = chart.options.plugins?.growwPluginV9?.activeTradeIndex;
    const previousActiveTradeIndex = chart.options.plugins?.growwPluginV9?.previousActiveTradeIndex;
    
    // Conflict resolution: If activeTradeIndex (from buttons) changed, clear the mouse hover lock
    if (activeTradeIndex !== previousActiveTradeIndex) {
        chart.options.plugins.growwPluginV9.mouseHoveredTradeIndex = null;
        chart.options.plugins.growwPluginV9.previousActiveTradeIndex = activeTradeIndex;
    }

    const mouseHoveredTradeIndex = chart.options.plugins?.growwPluginV9?.mouseHoveredTradeIndex;
    
    let isHovered = false;
    if (mouseHoveredTradeIndex !== undefined && mouseHoveredTradeIndex !== null) {
      if (mouseHoveredTradeIndex === trade.originalIndex) isHovered = true;
    } else if (activeTradeIndex !== undefined && activeTradeIndex === trade.originalIndex) {
      isHovered = true;
    }

    if (isHovered) {
      // Box Dimensions
      const boxWidth = 90; // Fixed width for simple tooltip
      const boxHeight = 44; // Height for price and time only
      const yOffset = isBuy ? 20 : -(boxHeight + 20); // Buy below point, Sell/Partial above point
      
      const boxX = x - boxWidth / 2;
      const boxY = y + yOffset;

      // Stem (connecting line)
      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = color;
      ctx.moveTo(x, y);
      ctx.lineTo(x, isBuy ? boxY : boxY + boxHeight);
      ctx.stroke();
      ctx.restore();
      
      // Box Shadow and Background
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.08)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 6);
      else ctx.rect(boxX, boxY, boxWidth, boxHeight);
      ctx.fill();
      ctx.restore();

      // Box Border
      ctx.save();
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 6);
      else ctx.rect(boxX, boxY, boxWidth, boxHeight);
      ctx.stroke();
      ctx.restore();

      // Icon square inside box
      const iconSize = 16;
      const padding = 8;
      const iconX = boxX + padding;
      const iconY = boxY + padding;
      
      ctx.save();
      ctx.fillStyle = color + "1a"; // 10% opacity background
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(iconX, iconY, iconSize, iconSize, 4);
      else ctx.rect(iconX, iconY, iconSize, iconSize);
      ctx.fill();
      ctx.stroke();
      
      // Icon Text (B / S / P)
      ctx.fillStyle = color;
      ctx.font = "bold 10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, iconX + iconSize / 2, iconY + iconSize / 2 + 1);

      // Price Text
      ctx.fillStyle = "#111827";
      ctx.font = "bold 12px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`₹${tradePrice.toFixed(2)}`, iconX + iconSize + 6, iconY + iconSize / 2 + 1);

      // Time Text
      const timeStr = new Date(tradeTime).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
      ctx.fillStyle = "#6b7280";
      ctx.font = "500 10px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(timeStr, boxX + boxWidth / 2, iconY + iconSize + 14);

      ctx.restore();
      
      // Update hovered trade state in parent
      const onHoverTrade = chart.options.plugins?.growwPluginV9?.onHoverTrade;
      if (onHoverTrade && chart.options.plugins.growwPluginV9.lastHovered !== trade) {
          chart.options.plugins.growwPluginV9.lastHovered = trade;
          setTimeout(() => onHoverTrade(trade), 0);
      }
    }

    // Dot on the chart line (always visible)
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, isHovered ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
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
    LineController,      // ✅ ADD THIS

  growwPlugin,
  ScatterController,
  zoomPlugin
);

/* =========================
   TYPES
========================= */
type LinePoint = {
  x: number; // timestamp
  y: number; // price
};

type IndicatorSeries = {
  key: string;
  label: string;
  color: string;
  width?: number;
  values: { x: string | number; y: number }[];
};

interface Props {
  lineData: LinePoint[];
  timeframe: string;
  referencePrice?: number | null;
  marketState: string;
  percent: string;
  trades: Trade[];
  pendingSL?: any[];
  indicatorSeries?: IndicatorSeries[];
  onHoverTrade?: (trade: any) => void;
  activeTrade?: any;
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






function formatIndicatorLabel(key: string, label?: string): string {
  const raw = label && label !== key ? label : key;
  const match = raw.match(/threshold[\s_]*(\d+(\.\d+)?)/i) || key.match(/threshold[\s_]*(\d+(\.\d+)?)/i);
  if (match) {
    return `Threshold (${match[1]})`;
  }
  return raw
    .replace(/^indicator_/i, '')
    .replace(/period(\d+)/i, '($1)')
    .replace(/_/g, ' ')
    .trim();
}

function formatIndicatorValue(key: string, val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '—';
  const u = key.toUpperCase();
  if (u.includes('RSI') || u.includes('THRESHOLD') || u.includes('SCORE') || u.includes('PCT')) {
    return val.toFixed(1);
  }
  return `₹${val.toFixed(2)}`;
}

function OscillatorSubChart({
  series,
  thresholds = []
}: {
  series: IndicatorSeries;
  thresholds?: IndicatorSeries[];
}) {
  const isRsi = series.key.toLowerCase().includes("rsi") || series.label.toLowerCase().includes("rsi");
  
  const parsedData = (series.values || [])
    .map(pt => ({
      x: typeof pt.x === 'number' ? pt.x : new Date(pt.x).getTime(),
      y: Number(pt.y)
    }))
    .filter(pt => !isNaN(pt.x) && !isNaN(pt.y));

  const currentVal = parsedData.length ? parsedData[parsedData.length - 1].y : null;

  // Find threshold values (e.g. from thresholds array or default 70 / 30 for RSI)
  const threshVals = thresholds
    .map(t => {
      const match = t.key.match(/\d+(\.\d+)?/);
      return match ? parseFloat(match[0]) : null;
    })
    .filter((v): v is number => v !== null);

  const upperThresh = threshVals.find(v => v >= 50) ?? (isRsi ? 70 : undefined);
  const lowerThresh = threshVals.find(v => v < 50) ?? (isRsi ? 30 : undefined);

  let statusText = "";
  let statusColor = "#64748b";
  if (isRsi && currentVal != null) {
    if (upperThresh != null && currentVal >= upperThresh) {
      statusText = "Overbought";
      statusColor = "#ef4444";
    } else if (lowerThresh != null && currentVal <= lowerThresh) {
      statusText = "Oversold";
      statusColor = "#10b981";
    } else {
      statusText = "Neutral";
      statusColor = "#64748b";
    }
  }

  const datasets: any[] = [
    {
      label: series.label,
      data: parsedData,
      borderColor: series.color || "#8b5cf6",
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.08,
      parsing: false as const
    }
  ];

  if (parsedData.length > 1 && thresholds.length > 0) {
    thresholds.forEach(t => {
      const match = t.key.match(/\d+(\.\d+)?/);
      const val = match ? parseFloat(match[0]) : (t.values && t.values.length ? Number(t.values[0].y) : null);
      if (val != null && !isNaN(val)) {
        const isUpper = val >= 50;
        datasets.push({
          label: formatIndicatorLabel(t.key, t.label),
          data: [{ x: parsedData[0].x, y: val }, { x: parsedData[parsedData.length - 1].x, y: val }],
          borderColor: t.color || (isUpper ? "rgba(239, 68, 68, 0.65)" : "rgba(16, 185, 129, 0.65)"),
          borderWidth: 1.3,
          borderDash: [5, 4],
          pointRadius: 0,
          parsing: false as const,
          fill: false
        });
      }
    });
  }

  return (
    <div
      style={{
        height: "135px",
        marginTop: "8px",
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: "8px",
        position: "relative",
        padding: "8px 12px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "11px",
          fontWeight: 600,
          marginBottom: "4px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: series.color || "#8b5cf6", display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: series.color || "#8b5cf6", display: "inline-block" }} />
            {series.label}: {currentVal != null ? currentVal.toFixed(2) : "—"}
          </span>
          {statusText && (
            <span
              style={{
                fontSize: "10px",
                padding: "1px 6px",
                borderRadius: "4px",
                background: `${statusColor}15`,
                color: statusColor,
                fontWeight: 600
              }}
            >
              {statusText}
            </span>
          )}
        </div>
        {isRsi && (
          <span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 500 }}>
            OB: {upperThresh ?? 70} | OS: {lowerThresh ?? 30}
          </span>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, position: "relative", width: "100%" }}>
        <Chart
          type="line"
          data={{ datasets }}
          options={{
            animation: false,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: { enabled: false }
            },
            scales: {
              x: {
                type: "timeseries",
                display: false,
                min: undefined,
                max: undefined
              },
              y: {
                type: "linear",
                display: true,
                position: "right",
                min: isRsi ? 0 : undefined,
                max: isRsi ? 100 : undefined,
                grid: {
                  color: "rgba(0, 0, 0, 0.04)"
                },
                ticks: {
                  color: "#94a3b8",
                  font: { size: 9 },
                  stepSize: 25,
                  maxTicksLimit: 5
                }
              }
            }
          }}
        />
      </div>
    </div>
  );
}

export function AlgoBacktestChart({
  lineData,
  timeframe,
  marketState,
  referencePrice,
  percent,
  trades,
  pendingSL,
  indicatorSeries = [],
  onHoverTrade,
  activeTrade
}: Props) {
  if (!lineData.length) return null;

  const [visibleIndicators, setVisibleIndicators] = useState<Record<string, boolean>>({});
  const [hoveredIndicatorKey, setHoveredIndicatorKey] = useState<string | null>(null);
  const [oscillatorViewMode, setOscillatorViewMode] = useState<"overlay" | "subchart">("overlay");
  const [customThresholds, setCustomThresholds] = useState<number[]>([]);
  const [showAddThresholdPopover, setShowAddThresholdPopover] = useState(false);
  const [customThresholdInput, setCustomThresholdInput] = useState("");
  const [isMaximized, setIsMaximized] = useState(false);

  // Helper: test if an indicator is a non-price oscillator like RSI or MACD
  const isOscillator = (key: string) => {
    const k = key.toLowerCase();
    return k.includes("rsi") || k.includes("macd") || k.includes("atr") || k.includes("stoch");
  };

  const hasOscillators = indicatorSeries.some(s => isOscillator(s.key));

  // Merge indicatorSeries with any user-selected threshold values
  const allIndicatorSeries = useMemo(() => {
    const list = [...indicatorSeries];
    const existingVals = new Set<number>();

    list.forEach(s => {
      const k = s.key.toLowerCase();
      if (k.startsWith("threshold")) {
        const m = k.match(/\d+(\.\d+)?/);
        if (m) existingVals.add(parseFloat(m[0]));
      }
    });

    customThresholds.forEach(val => {
      if (!existingVals.has(val)) {
        const isUpper = val >= 50;
        list.push({
          key: `Threshold_${val}`,
          label: `Threshold (${val})`,
          color: isUpper ? "#ef4444" : "#10b981",
          width: 1.5,
          values: lineData.map(pt => ({
            x: pt.x,
            y: val
          }))
        });
        existingVals.add(val);
      }
    });

    return list;
  }, [indicatorSeries, customThresholds, lineData]);

  // Toolbar indicators: show all indicators including threshold values so user can select any of them!
  const toolbarIndicators = useMemo(() => {
    return allIndicatorSeries;
  }, [allIndicatorSeries]);

  // Initialize all indicators to visible by default when allIndicatorSeries changes
  useEffect(() => {
    if (allIndicatorSeries && allIndicatorSeries.length > 0) {
      setVisibleIndicators(prev => {
        const next = { ...prev };
        let changed = false;
        allIndicatorSeries.forEach(ind => {
          if (next[ind.key] === undefined) {
            next[ind.key] = true;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [allIndicatorSeries]);

  const toggleIndicator = (key: string) => {
    setVisibleIndicators(prev => ({
      ...prev,
      [key]: prev[key] === false ? true : false
    }));
  };

  const handleSelectThreshold = (val: number) => {
    if (isNaN(val) || val < 0 || val > 100) return;
    setCustomThresholds(prev => prev.includes(val) ? prev : [...prev, val]);
    setVisibleIndicators(prev => ({
      ...prev,
      [`Threshold_${val}`]: true
    }));
    setShowAddThresholdPopover(false);
    setCustomThresholdInput("");
  };

  const handleRemoveCustomThreshold = (e: React.MouseEvent, key: string, val: number) => {
    e.stopPropagation();
    setCustomThresholds(prev => prev.filter(v => v !== val));
    setVisibleIndicators(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const showAllIndicators = () => {
    const next: Record<string, boolean> = {};
    toolbarIndicators.forEach(ind => { next[ind.key] = true; });
    setVisibleIndicators(next);
  };

  const hideAllIndicators = () => {
    const next: Record<string, boolean> = {};
    toolbarIndicators.forEach(ind => { next[ind.key] = false; });
    setVisibleIndicators(next);
  };

  const activeIndicatorSeries = useMemo(() => {
    return allIndicatorSeries.filter(ind => visibleIndicators[ind.key] !== false);
  }, [allIndicatorSeries, visibleIndicators]);

  // Active price overlays (e.g. SMA, EMA, VWAP) for main price chart
  const activePriceOverlays = useMemo(() => {
    return activeIndicatorSeries.filter(s => {
      const k = s.key.toLowerCase();
      if (isOscillator(k)) return false;
      if (k.startsWith("threshold")) {
        const numMatch = k.match(/\d+(\.\d+)?/);
        const val = numMatch ? parseFloat(numMatch[0]) : null;
        if (val != null && val <= 100 && hasOscillators) return false;
      }
      return true;
    });
  }, [activeIndicatorSeries, hasOscillators]);

  // Active oscillators (e.g. RSI, MACD)
  const activeOscillators = useMemo(() => {
    return activeIndicatorSeries.filter(s => isOscillator(s.key));
  }, [activeIndicatorSeries]);

  // Active thresholds associated with oscillators (e.g. 75, 40)
  const activeOscillatorThresholds = useMemo(() => {
    return activeIndicatorSeries.filter(s => {
      const k = s.key.toLowerCase();
      if (k.startsWith("threshold")) {
        const numMatch = k.match(/\d+(\.\d+)?/);
        const val = numMatch ? parseFloat(numMatch[0]) : null;
        return val != null && val <= 100;
      }
      return false;
    });
  }, [activeIndicatorSeries]);

  const activeCount = toolbarIndicators.filter(ind => visibleIndicators[ind.key] !== false).length;

  function getNseMarketWindowIST(anchorTs: number) {
    const d = new Date(anchorTs);

    return {
      marketOpen: Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
        9, 15, 0
      ),
      marketClose: Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
        15, 30, 0
      )
    };
  }

  const lastCandleTs = lineData.length ? lineData[lineData.length - 1].x : Date.now();
  const validTradeTimestamps = trades
    .map(t => typeof t.createdAtIST === 'number' ? t.createdAtIST : new Date(t.createdAtIST).getTime())
    .filter(t => !isNaN(t));
  const maxTradeTs = validTradeTimestamps.length ? Math.max(...validTradeTimestamps) : 0;
  const chartMax = Math.max(lastCandleTs, maxTradeTs);

  const { marketOpen, marketClose } = getNseMarketWindowIST(lastCandleTs);
  const finalMarketClose = Math.max(marketClose, chartMax);

  const tradePoints = trades
    .map((t, index) => {
      const ts = typeof t.createdAtIST === 'number' ? t.createdAtIST : new Date(t.createdAtIST).getTime();
      return {
        x: isNaN(ts) ? Date.now() : ts,
        y: Number(t.pricePerShare) || 0,
        side: t.side,
        quantity: t.quantity || 1,
        pnl: t.pnl,
        reason: t.reason,
        originalIndex: index
      };
    })
    .filter(t => !isNaN(t.x) && !isNaN(t.y));

  currentIndex = lineData.length - 1;
  const is1D = timeframe === "1D";

  // Include trade prices in the scale so markers aren't cut off vertically
  const allVisiblePrices: number[] = lineData.map(d => d.y).filter(y => y != null && !isNaN(y));
  trades.forEach(t => {
    const ts = typeof t.createdAtIST === 'number' ? t.createdAtIST : new Date(t.createdAtIST).getTime();
    if (!isNaN(ts) && ts >= marketOpen && ts <= finalMarketClose && t.pricePerShare != null && !isNaN(t.pricePerShare)) {
      allVisiblePrices.push(Number(t.pricePerShare));
    }
  });

  // Include active overlay indicator values in price scale
  activePriceOverlays.forEach(ind => {
    ind.values.forEach(v => {
      if (v.y != null && !isNaN(v.y)) {
        allVisiblePrices.push(Number(v.y));
      }
    });
  });

  if (!allVisiblePrices.length) allVisiblePrices.push(100);

  const minPriceFinal = Math.min(...allVisiblePrices);
  const maxPriceFinal = Math.max(...allVisiblePrices);
  const pad = (maxPriceFinal - minPriceFinal) * 0.12 || minPriceFinal * 0.005 || 1;
  const isMarketOpen = marketState === "REGULAR" || marketState === "SIMULATION";
  const [lineColor, setLineColor] = useState("");
  useEffect(() => {
    const pct = Number(percent) || 0;

    setLineColor(
      pct > 0 ? "#00b386" :
      pct < 0 ? "#f76767" :
      "#9ca3af"
    );
  }, [timeframe, percent]);

  const chartData = lineData.filter(d => !isNaN(d.x) && !isNaN(d.y));
  currentIndex = chartData.length - 1;

  // Build datasets for the main chart
  const datasets = [
    {
      label: "Stock Price",
      data: chartData,
      borderColor: lineColor,
      backgroundColor: (context: any) => {
        if (!lineColor) return "transparent";
        const chart = context.chart;
        const { ctx, chartArea } = chart;
        if (!chartArea) return null;
        const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        gradient.addColorStop(0, lineColor + '40'); // 25% opacity
        gradient.addColorStop(1, lineColor + '00'); // 0% opacity
        return gradient;
      },
      fill: true,
      borderWidth: 3,
      pointRadius: 0,
      tension: 0.05,
      parsing: false as const,
      yAxisID: 'y'
    },
    ...activePriceOverlays.map(ind => {
      const isHovered = hoveredIndicatorKey === ind.key;
      const isAnyHovered = hoveredIndicatorKey !== null;

      let borderColor = ind.color || '#6366f1';
      let borderWidth = ind.width || 2;

      if (isHovered) {
        borderWidth = (ind.width || 2) + 1.5;
      } else if (isAnyHovered) {
        borderColor = borderColor + '30'; // Dim non-hovered indicators to 20% opacity
        borderWidth = 1;
      }

      return {
        id: ind.key,
        label: formatIndicatorLabel(ind.key, ind.label),
        data: ind.values,
        borderColor,
        borderWidth,
        borderDash: ind.key.startsWith('Threshold') ? [5, 5] : [],
        fill: false,
        pointRadius: 0,
        tension: 0.1,
        parsing: false as const,
        yAxisID: 'y'
      };
    }),
    // When in overlay mode, plot active oscillators (like RSI) as a line graph directly on the main chart
    ...(oscillatorViewMode === "overlay" ? activeOscillators.map(ind => {
      const isHovered = hoveredIndicatorKey === ind.key;
      const isAnyHovered = hoveredIndicatorKey !== null;

      let borderColor = ind.color || '#8b5cf6';
      let borderWidth = ind.width || 2;

      if (isHovered) {
        borderWidth = (ind.width || 2) + 1.5;
      } else if (isAnyHovered) {
        borderColor = borderColor + '30';
        borderWidth = 1;
      }

      return {
        id: ind.key,
        label: formatIndicatorLabel(ind.key, ind.label),
        data: (ind.values || []).map(pt => ({
          x: typeof pt.x === 'number' ? pt.x : new Date(pt.x).getTime(),
          y: Number(pt.y)
        })).filter(pt => !isNaN(pt.x) && !isNaN(pt.y)),
        borderColor,
        borderWidth,
        borderDash: [],
        fill: false,
        pointRadius: 0,
        tension: 0.1,
        parsing: false as const,
        yAxisID: 'y1'
      };
    }) : []),
    // When in overlay mode, plot active oscillator thresholds (like Threshold 75, Threshold 40, Threshold 70, etc.) on scale y1
    ...(oscillatorViewMode === "overlay" ? activeOscillatorThresholds.map(ind => {
      const isHovered = hoveredIndicatorKey === ind.key;
      const isAnyHovered = hoveredIndicatorKey !== null;

      const numMatch = ind.key.match(/\d+(\.\d+)?/);
      const val = numMatch ? parseFloat(numMatch[0]) : (ind.values && ind.values.length ? Number(ind.values[0].y) : 50);
      const isUpper = val >= 50;

      let borderColor = ind.color || (isUpper ? "#ef4444" : "#10b981");
      let borderWidth = isHovered ? 2.5 : 1.3;

      if (!isHovered && isAnyHovered) {
        borderColor = borderColor + '30';
        borderWidth = 1;
      }

      // Generate points spanning from first to last candle for a solid reference line across chart
      const startX = chartData.length ? chartData[0].x : 0;
      const endX = chartData.length ? chartData[chartData.length - 1].x : 0;

      return {
        id: ind.key,
        label: formatIndicatorLabel(ind.key, ind.label),
        data: chartData.length ? [
          { x: startX, y: val },
          { x: endX, y: val }
        ] : (ind.values || []).map(pt => ({
          x: typeof pt.x === 'number' ? pt.x : new Date(pt.x).getTime(),
          y: Number(pt.y)
        })).filter(pt => !isNaN(pt.x) && !isNaN(pt.y)),
        borderColor,
        borderWidth,
        borderDash: [5, 4],
        fill: false,
        pointRadius: 0,
        tension: 0,
        parsing: false as const,
        yAxisID: 'y1'
      };
    }) : [])
  ];

  const chartContent = (
      <div
        className="chart-container"
        style={isMaximized ? {
          position: "fixed",
          top: "3vh", left: "3vw",
          height: "94vh", width: "94vw",
          zIndex: 999999,
          backgroundColor: "white",
          display: "flex",
          flexDirection: "column",
          padding: "20px",
          borderRadius: "16px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
          overflow: "hidden"
        } : {
          height: "100%",
          width: "100%",
          position: "relative",
          display: "flex",
          flexDirection: "column"
        }}
      >
      {/* Indicator Selection & Identification Bar */}
      {toolbarIndicators && toolbarIndicators.length > 0 && (
        <div
          className="algo-chart-indicator-bar"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "8px",
            padding: "8px 12px",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            marginBottom: "8px",
            fontSize: "12px",
            userSelect: "none",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)"
          }}
        >
          {/* Left: Section Header & Quick Selectors */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontWeight: 700,
                color: "#334155",
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.05em"
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#4f46e5" }}>
                <line x1="18" y1="20" x2="18" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="6" y1="20" x2="6" y2="14"></line>
              </svg>
              <span>Indicators</span>
              <span
                style={{
                  background: activeCount > 0 ? "#e0e7ff" : "#f1f5f9",
                  color: activeCount > 0 ? "#4338ca" : "#64748b",
                  padding: "1px 6px",
                  borderRadius: "10px",
                  fontSize: "10px",
                  fontWeight: 600
                }}
              >
                {activeCount}/{toolbarIndicators.length}
              </span>
            </div>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <div style={{ display: "inline-flex", background: "#f1f5f9", borderRadius: "5px", padding: "2px", border: "1px solid #e2e8f0" }}>
              <button
                type="button"
                onClick={showAllIndicators}
                title="Show all indicators"
                style={{
                  border: "none",
                  background: activeCount === toolbarIndicators.length ? "#ffffff" : "transparent",
                  color: activeCount === toolbarIndicators.length ? "#0f172a" : "#64748b",
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "3px",
                  cursor: "pointer",
                  boxShadow: activeCount === toolbarIndicators.length ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  transition: "all 0.15s ease"
                }}
              >
                All
              </button>
              <button
                type="button"
                onClick={hideAllIndicators}
                title="Hide all indicators for clean price view"
                style={{
                  border: "none",
                  background: activeCount === 0 ? "#ffffff" : "transparent",
                  color: activeCount === 0 ? "#0f172a" : "#64748b",
                  fontSize: "10px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "3px",
                  cursor: "pointer",
                  boxShadow: activeCount === 0 ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                  transition: "all 0.15s ease"
                }}
              >
                None
              </button>
            </div>

            {/* Toggle between Overlay on Chart vs Sub-Panel */}
            {hasOscillators && (
              <div style={{ display: "inline-flex", background: "#f1f5f9", borderRadius: "5px", padding: "2px", border: "1px solid #e2e8f0" }}>
                <button
                  type="button"
                  onClick={() => setOscillatorViewMode("overlay")}
                  title="Plot RSI as a line graph directly on the main chart"
                  style={{
                    border: "none",
                    background: oscillatorViewMode === "overlay" ? "#ffffff" : "transparent",
                    color: oscillatorViewMode === "overlay" ? "#4f46e5" : "#64748b",
                    fontSize: "10px",
                    fontWeight: 600,
                    padding: "2px 7px",
                    borderRadius: "3px",
                    cursor: "pointer",
                    boxShadow: oscillatorViewMode === "overlay" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                    transition: "all 0.15s ease"
                  }}
                >
                  📈 On Chart
                </button>
                <button
                  type="button"
                  onClick={() => setOscillatorViewMode("subchart")}
                  title="Display RSI in a separate sub-panel graph below"
                  style={{
                    border: "none",
                    background: oscillatorViewMode === "subchart" ? "#ffffff" : "transparent",
                    color: oscillatorViewMode === "subchart" ? "#4f46e5" : "#64748b",
                    fontSize: "10px",
                    fontWeight: 600,
                    padding: "2px 7px",
                    borderRadius: "3px",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                >
                  📊 Sub-Panel
                </button>
              </div>
            )}

            {/* Threshold Selector: Allow user to select / add threshold values */}
            {hasOscillators && (
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setShowAddThresholdPopover(v => !v)}
                  title="Add or select RSI threshold values (e.g. 70, 30, 80, 20)"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    padding: "2px 8px",
                    borderRadius: "5px",
                    fontSize: "10px",
                    fontWeight: 600,
                    background: showAddThresholdPopover ? "#ede9fe" : "#f8fafc",
                    border: "1px dashed #8b5cf6",
                    color: "#7c3aed",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                >
                  <span style={{ fontSize: "11px", fontWeight: "bold" }}>+</span>
                  <span>Threshold</span>
                </button>

                {showAddThresholdPopover && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: 0,
                      zIndex: 100,
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
                      padding: "10px",
                      minWidth: "220px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "#334155" }}>
                        Select RSI Threshold
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAddThresholdPopover(false)}
                        style={{ border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: "14px", padding: 0 }}
                      >
                        ×
                      </button>
                    </div>
                    
                    {/* Quick Preset Buttons */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                      {[
                        { val: 70, label: "70 (OB)" },
                        { val: 30, label: "30 (OS)" },
                        { val: 80, label: "80" },
                        { val: 20, label: "20" },
                        { val: 50, label: "50" }
                      ].map(p => (
                        <button
                          key={p.val}
                          type="button"
                          onClick={() => handleSelectThreshold(p.val)}
                          style={{
                            padding: "3px 8px",
                            borderRadius: "4px",
                            fontSize: "10px",
                            fontWeight: 600,
                            border: p.val >= 50 ? "1px solid #fecaca" : "1px solid #a7f3d0",
                            background: p.val >= 50 ? "#fef2f2" : "#ecfdf5",
                            color: p.val >= 50 ? "#dc2626" : "#059669",
                            cursor: "pointer"
                          }}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>

                    {/* Custom Input */}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const num = parseFloat(customThresholdInput);
                        if (!isNaN(num)) handleSelectThreshold(num);
                      }}
                      style={{ display: "flex", gap: "6px", marginTop: "2px" }}
                    >
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        placeholder="Custom 0-100"
                        value={customThresholdInput}
                        onChange={(e) => setCustomThresholdInput(e.target.value)}
                        style={{
                          flex: 1,
                          padding: "3px 6px",
                          fontSize: "11px",
                          border: "1px solid #cbd5e1",
                          borderRadius: "4px",
                          outline: "none"
                        }}
                      />
                      <button
                        type="submit"
                        style={{
                          padding: "3px 8px",
                          background: "#7c3aed",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "4px",
                          fontSize: "10px",
                          fontWeight: 600,
                          cursor: "pointer"
                        }}
                      >
                        Add
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}
            
            {/* Maximize Button */}
            <button
              type="button"
              onClick={() => setIsMaximized(v => !v)}
              title={isMaximized ? "Minimize graph" : "Maximize graph"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "28px",
                height: "28px",
                borderRadius: "6px",
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                color: "#475569",
                cursor: "pointer",
                transition: "all 0.15s ease",
                marginLeft: "auto"
              }}
            >
              {isMaximized ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                </svg>
              )}
            </button>
            </div>
          </div>

          {/* Right: Individual indicator toggle chips */}
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
            {toolbarIndicators.map(ind => {
              const isVisible = visibleIndicators[ind.key] !== false;
              const isHovered = hoveredIndicatorKey === ind.key;
              const isThreshold = ind.key.toLowerCase().startsWith("threshold");
              const isDashed = isThreshold;
              const threshMatch = ind.key.match(/\d+(\.\d+)?/);
              const threshNum = threshMatch ? parseFloat(threshMatch[0]) : null;
              const isCustom = threshNum != null && customThresholds.includes(threshNum);

              let color = ind.color;
              if (!color) {
                if (isThreshold && threshNum != null) {
                  color = threshNum >= 50 ? "#ef4444" : "#10b981";
                } else {
                  color = "#6366f1";
                }
              }

              const label = formatIndicatorLabel(ind.key, ind.label);
              const lastPoint = ind.values && ind.values.length ? ind.values[ind.values.length - 1] : null;
              const formattedVal = lastPoint ? formatIndicatorValue(ind.key, lastPoint.y) : null;

              return (
                <button
                  key={ind.key}
                  type="button"
                  onClick={() => toggleIndicator(ind.key)}
                  onMouseEnter={() => setHoveredIndicatorKey(ind.key)}
                  onMouseLeave={() => setHoveredIndicatorKey(null)}
                  title={`Click to ${isVisible ? 'hide' : 'show'} ${label}. Hover to highlight line.`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "3px 9px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: isVisible ? 600 : 500,
                    cursor: "pointer",
                    border: isVisible
                      ? (isHovered ? `1.5px solid ${color}` : `1px solid ${color}80`)
                      : "1px dashed #cbd5e1",
                    background: isVisible
                      ? (isHovered ? `${color}20` : `${color}0d`)
                      : "#f8fafc",
                    color: isVisible ? "#1e293b" : "#94a3b8",
                    boxShadow: isHovered && isVisible ? `0 2px 6px ${color}35` : "none",
                    transform: isHovered ? "translateY(-1px)" : "none",
                    transition: "all 0.15s ease",
                    opacity: isVisible ? 1 : 0.65
                  }}
                >
                  {/* Colored line style preview */}
                  <span
                    style={{
                      display: "inline-block",
                      width: "14px",
                      height: "0px",
                      borderTop: isVisible
                        ? (isDashed ? `2px dashed ${color}` : `2.5px solid ${color}`)
                        : "2px dotted #94a3b8",
                      borderRadius: "1px"
                    }}
                  />
                  <span>{label}</span>
                  {formattedVal && (
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        color: isVisible ? color : "#94a3b8",
                        background: isVisible ? "#ffffff" : "transparent",
                        padding: "1px 5px",
                        borderRadius: "3px",
                        border: isVisible ? `1px solid ${color}30` : "none"
                      }}
                    >
                      {formattedVal}
                    </span>
                  )}
                  {isCustom && (
                    <span
                      role="button"
                      onClick={(e) => handleRemoveCustomThreshold(e, ind.key, threshNum!)}
                      title="Remove this threshold"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "14px",
                        height: "14px",
                        borderRadius: "50%",
                        marginLeft: "2px",
                        fontSize: "12px",
                        color: "#94a3b8",
                        cursor: "pointer",
                        lineHeight: 1
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#ef4444"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#94a3b8"; }}
                    >
                      ×
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Stock Price Chart Area */}
      <div style={{ flex: 1, minHeight: 0, position: "relative", width: "100%" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
          {chartData.length ? (
            <Chart
              key={`${timeframe}-${marketState}-${activePriceOverlays.length}-${oscillatorViewMode}-${activeOscillators.length}-${activeOscillatorThresholds.length}`}
              type="line"
              data={{ datasets }}
              options={{
                animation: false,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: { enabled: false },
                  growwPluginV8: false,
                  growwPluginV9: {
                    timeframe,
                    referencePrice: referencePrice ?? 0,
                    trades: tradePoints,
                    pendingSL: pendingSL || [],
                    onHoverTrade: onHoverTrade,
                    activeTrade: activeTrade?.originalIndex
                  },
                  zoom: {
                    zoom: {
                      wheel: {
                        enabled: true,
                        speed: 0.1
                      },
                      pinch: {
                        enabled: true
                      },
                      mode: "x"
                    },
                    pan: {
                      enabled: true,
                      mode: "x"
                    }
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
                  } : {
                    type: "timeseries",
                    display: false,
                    min: undefined,
                    max: finalMarketClose > lastCandleTs ? finalMarketClose : undefined,
                    time: {
                      unit: is1D ? "minute" : "day",
                      tooltipFormat: is1D ? "HH:mm" : "dd MMM"
                    }
                  },
                  y: {
                    display: false,
                    min: minPriceFinal - pad,
                    max: maxPriceFinal + pad
                  },
                  y1: {
                    type: "linear",
                    display: oscillatorViewMode === "overlay" && (activeOscillators.length > 0 || activeOscillatorThresholds.length > 0),
                    position: "right",
                    min: 0,
                    max: 100,
                    grid: {
                      drawOnChartArea: false,
                      color: "rgba(0, 0, 0, 0.04)"
                    },
                    ticks: {
                      color: activeOscillators[0]?.color || "#8b5cf6",
                      font: { size: 9, weight: "bold" },
                      stepSize: 25,
                      maxTicksLimit: 5,
                      callback: (v: any) => `${v}`
                    }
                  }
                }
              }}
            />
          ) : (
            <div className="chart-empty">No data available</div>
          )}
        </div>
      </div>

      {/* Active Oscillator Sub-Charts (when sub-panel mode is selected) */}
      {oscillatorViewMode === "subchart" && activeOscillators.map(osc => (
        <OscillatorSubChart
          key={osc.key}
          series={osc}
          thresholds={activeOscillatorThresholds}
        />
      ))}
    </div>
  );

  return isMaximized ? createPortal(
    <>
      <div 
        style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(15, 23, 42, 0.85)",
          zIndex: 999998,
          backdropFilter: "blur(4px)"
        }} 
        onClick={() => setIsMaximized(false)} 
      />
      {chartContent}
    </>,
    document.body
  ) : chartContent;
}
