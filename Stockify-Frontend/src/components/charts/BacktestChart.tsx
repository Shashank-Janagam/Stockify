/**
 * BacktestChart.tsx  —  Pixel-Perfect Studio Edition
 * Features:
 *  - Charcoal/dark slate smooth curve with subtle hold zone shading
 *  - Indicator overlays (EMA, SMA, BB bands, VWAP)
 *  - Exact circular B (green) and S (red) trade pins with non-overlapping offsets
 *  - RSI oscillator sub-panel with 70 / 50 / 30 reference lines
 *  - Cursor-anchored wheel zooming, smooth panning, and Focus Trades action
 *  - Formatted X-axis and right Y-axis
 *  - 1-click Line / Candle toggle matching reference UI
 */
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface Trade {
  type: "BUY" | "SELL";
  date: string;
  price: number;
  qty?: number;
  pnl?: number | null;
  reason?: string;
}

interface IndicatorSeries {
  key: string;         // e.g. "EMA_50", "RSI_14"
  indicator: string;   // e.g. "EMA", "RSI"
  params: Record<string, number>;
  data: { date: string; value: number | null }[];
  color: string;
  panel: "price" | "oscillator";
}

interface Props {
  candles: Candle[];
  trades: Trade[];
  indicatorData?: Record<string, { date: string; value: number | null; indicator: string; params: Record<string, number> }[]>;
  symbol: string;
  defaultChartType?: "line" | "candle";
  pnl?: number | null;
}

// ─── Color Palette ────────────────────────────────────────────────────────────

const INDICATOR_COLORS: Record<string, string> = {
  EMA: "#2563eb",         // Blue
  SMA: "#8b5cf6",         // Purple
  VWAP: "#06b6d4",        // Cyan
  RSI: "#334155",         // Charcoal Slate
  MACD: "#2563eb",        // Blue
  MACD_SIGNAL: "#db2777", // Pink
  BB_UPPER: "#94a3b8",    // Slate
  BB_LOWER: "#94a3b8",    // Slate
  ATR: "#ea580c",         // Orange
  ADX: "#9333ea",         // Violet
  SUPERTREND: "#10b981",  // Green
};

const OSCILLATOR_INDICATORS = new Set(["RSI", "MACD", "MACD_SIGNAL", "ADX", "ATR"]);

function normalizeDateStr(s: string): string {
  return String(s || "").trim().replace("T", " ").replace("Z", "");
}

export default function BacktestChart({
  candles,
  trades,
  indicatorData,
  symbol,
  defaultChartType = "line",
  pnl,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 420 });
  const [chartType, setChartType] = useState<"line" | "candle">(defaultChartType);
  const [renderTick, setRenderTick] = useState(0);

  const [visibleIndicators, setVisibleIndicators] = useState<Record<string, boolean>>({});

  const viewRef = useRef({
    zoom: Math.max(10, candles.length || 60),
    panOffset: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartPan: 0,
    crosshair: null as { x: number; y: number; idx: number } | null,
  });

  // ── Helper: Map trade dates to candle indices with exact precision ────────
  const findCandleIdxForDate = useCallback((tradeDateStr: string, cList: Candle[]): number => {
    if (!cList.length || !tradeDateStr) return -1;
    const raw = normalizeDateStr(tradeDateStr);
    const raw19 = raw.substring(0, 19);
    const raw16 = raw.substring(0, 16);

    // 1. Exact full 19-char timestamp match (e.g. 2026-08-14 09:30:00)
    for (let i = 0; i < cList.length; i++) {
      const cNorm = normalizeDateStr(cList[i].date);
      if (cNorm === raw || cNorm.substring(0, 19) === raw19) {
        return i;
      }
    }

    // 2. Exact 16-char minute match (e.g. 2026-08-14 09:30)
    if (raw16.length >= 16) {
      for (let i = 0; i < cList.length; i++) {
        const cNorm = normalizeDateStr(cList[i].date);
        if (cNorm.substring(0, 16) === raw16) {
          return i;
        }
      }
    }

    // 3. Closest epoch timestamp match (handles timezone / sub-minute offsets)
    const tTime = new Date(tradeDateStr).getTime();
    if (!isNaN(tTime)) {
      let bestIdx = -1;
      let bestDiff = Infinity;
      for (let i = 0; i < cList.length; i++) {
        const cTime = new Date(cList[i].date).getTime();
        if (!isNaN(cTime)) {
          const diff = Math.abs(cTime - tTime);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = i;
          }
        }
      }
      if (bestIdx >= 0) return bestIdx;
    }

    // 4. Daily date fallback (YYYY-MM-DD) only if no minute/timestamp match
    const day = raw.substring(0, 10);
    for (let i = 0; i < cList.length; i++) {
      const cNorm = normalizeDateStr(cList[i].date);
      if (cNorm.substring(0, 10) === day) {
        return i;
      }
    }

    return -1;
  }, []);

  // ── Map trades by candle index ─────────────────────────────────────────────
  const tradesByCandleIdx = useMemo(() => {
    const m: Record<number, Trade[]> = {};
    trades.forEach(t => {
      const idx = findCandleIdxForDate(t.date, candles);
      if (idx >= 0 && idx < candles.length) {
        if (!m[idx]) m[idx] = [];
        m[idx].push(t);
      }
    });
    return m;
  }, [trades, candles, findCandleIdxForDate]);

  // ── Compute Trade Bounds ───────────────────────────────────────────────────
  const tradeCandleIndices = useMemo(() => {
    return Object.keys(tradesByCandleIdx).map(Number).sort((a, b) => a - b);
  }, [tradesByCandleIdx]);

  // ── Reset Zoom / Pan whenever symbol or candle set changes ────────────────
  useEffect(() => {
    if (candles.length > 0) {
      if (tradeCandleIndices.length > 0 && candles.length > 300) {
        // Frame trade activity area with margin if dataset is huge
        const minIdx = tradeCandleIndices[0];
        const maxIdx = tradeCandleIndices[tradeCandleIndices.length - 1];
        const span = Math.max(20, maxIdx - minIdx + 1);
        const padding = Math.max(15, Math.floor(span * 0.25));
        const targetStart = Math.max(0, minIdx - padding);
        const targetEnd = Math.min(candles.length, maxIdx + padding + 1);
        const targetZoom = Math.max(15, targetEnd - targetStart);
        viewRef.current.zoom = targetZoom;
        viewRef.current.panOffset = Math.max(0, candles.length - targetZoom - targetStart);
      } else {
        viewRef.current.zoom = Math.max(10, candles.length);
        viewRef.current.panOffset = 0;
      }
      setRenderTick(t => t + 1);
    }
  }, [symbol, candles.length, tradeCandleIndices]);

  // ── Parse indicator series from backend format ─────────────────────────────
  const indicatorSeries: IndicatorSeries[] = useMemo(() => {
    if (!indicatorData) return [];
    const result: IndicatorSeries[] = [];
    for (const [key, entries] of Object.entries(indicatorData)) {
      if (!entries.length) continue;
      const first = entries.find(e => e.indicator);
      const indName = first?.indicator || key.split("_")[0];
      const params = first?.params || {};
      result.push({
        key,
        indicator: indName,
        params,
        data: entries.map(e => ({ date: e.date, value: e.value })),
        color: INDICATOR_COLORS[indName] || "#64748b",
        panel: OSCILLATOR_INDICATORS.has(indName) ? "oscillator" : "price",
      });
    }
    return result;
  }, [indicatorData]);

  useEffect(() => {
    if (indicatorSeries.length > 0) {
      const init: Record<string, boolean> = {};
      indicatorSeries.forEach(s => { init[s.key] = true; });
      setVisibleIndicators(init);
    }
  }, [indicatorSeries]);

  const activePriceIndicators = indicatorSeries.filter(s => s.panel === "price" && visibleIndicators[s.key] !== false);
  const activeOscillators = indicatorSeries.filter(s => s.panel === "oscillator" && visibleIndicators[s.key] !== false);
  const hasOscillators = activeOscillators.length > 0;

  // ── Build shaded trade regions ─────────────────────────────────────────────
  const tradeRegions = useMemo(() => {
    const regions: { buyIdx: number; sellIdx: number; pnl: number }[] = [];
    let lastBuyIdx = -1;
    for (const t of trades) {
      const idx = findCandleIdxForDate(t.date, candles);
      if (idx < 0) continue;
      if (t.type === "BUY") {
        lastBuyIdx = idx;
      } else if (t.type === "SELL" && lastBuyIdx >= 0) {
        regions.push({ buyIdx: lastBuyIdx, sellIdx: idx, pnl: Number(t.pnl ?? 0) });
        lastBuyIdx = -1;
      }
    }
    return regions;
  }, [trades, candles, findCandleIdxForDate]);

  // ── ResizeObserver ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const e of entries) {
        setDimensions({ width: e.contentRect.width, height: e.contentRect.height });
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // ── Draw Loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !candles.length || dimensions.width === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    const { width, height } = dimensions;
    const rightMargin = 55;
    const bottomMargin = 26;
    const priceRatio = hasOscillators ? 0.70 : 1.0;
    const priceHeight = (height - bottomMargin) * priceRatio - (hasOscillators ? 10 : 0);
    const oscPanelH = hasOscillators ? (height - bottomMargin) * 0.30 - 10 : 0;
    const oscPanelY = priceHeight + 16;
    const chartWidth = width - rightMargin;

    const view = viewRef.current;
    view.zoom = Math.min(Math.max(view.zoom, 8), candles.length || 8);
    view.panOffset = Math.max(0, Math.min(view.panOffset, candles.length - view.zoom));

    const startIdx = Math.max(0, candles.length - view.zoom - view.panOffset);
    const endIdx = Math.min(candles.length, startIdx + view.zoom);
    const visible = candles.slice(Math.floor(startIdx), Math.ceil(endIdx));
    if (!visible.length) return;

    const candleW = chartWidth / view.zoom;
    const bodyW = Math.max(1, candleW * 0.72);

    // ── Price range ──────────────────────────────────────────────────────────
    let minP = Infinity, maxP = -Infinity;
    for (const c of visible) {
      if (c.low < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
    }

    for (const s of activePriceIndicators) {
      for (const c of visible) {
        const entry = s.data.find(d => d.date === c.date);
        if (entry?.value != null) {
          if (entry.value < minP) minP = entry.value;
          if (entry.value > maxP) maxP = entry.value;
        }
      }
    }

    const priceRange = maxP - minP || 1;
    const padMin = minP - priceRange * 0.08;
    const padMax = maxP + priceRange * 0.08;
    const finalRange = padMax - padMin;

    const priceToY = (p: number) => priceHeight - ((p - padMin) / finalRange) * priceHeight;
    const xAt = (i: number) => ((i - startIdx) / view.zoom) * chartWidth;

    // ── Draw background ──────────────────────────────────────────────────────
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // ── Ultra-subtle grid lines ──────────────────────────────────────────────
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = (priceHeight / gridLines) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartWidth, y); ctx.stroke();
    }
    const vLines = Math.min(8, Math.ceil(view.zoom / 12));
    for (let i = 0; i <= vLines; i++) {
      const x = (chartWidth / vLines) * i;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, priceHeight); ctx.stroke();
    }

    // ── Shade trade hold regions ─────────────────────────────────────────────
    for (const region of tradeRegions) {
      if (region.buyIdx < startIdx && region.sellIdx < startIdx) continue;
      if (region.buyIdx > endIdx) continue;
      const x1 = xAt(Math.max(region.buyIdx, startIdx));
      const x2 = xAt(Math.min(region.sellIdx, endIdx));
      if (x2 <= x1) continue;
      ctx.fillStyle = "rgba(226, 232, 240, 0.45)"; // Soft gray hold zone matching screenshot
      ctx.fillRect(x1, 0, x2 - x1, priceHeight);
    }

    // ── Y-axis labels (Right aligned: 3.4k, 3.0k, 2.7k...) ───────────────────
    ctx.fillStyle = "#64748b";
    ctx.font = "10px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= gridLines; i++) {
      const p = padMax - (finalRange / gridLines) * i;
      const y = (priceHeight / gridLines) * i;
      ctx.fillText(p >= 1000 ? `${(p / 1000).toFixed(1)}k` : p.toFixed(1), chartWidth + 8, y);
    }

    // ── X-axis labels (Feb '23, Mar '23, Apr '23...) ─────────────────────────
    ctx.fillStyle = "#64748b";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const labelStep = Math.max(1, Math.ceil(view.zoom / 7));
    for (let i = 0; i < visible.length; i += labelStep) {
      const c = visible[i];
      const x = xAt(startIdx + i);
      const raw = String(c.date || "");
      let label = raw;
      try {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) {
          if (raw.length > 10) {
            label = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
          } else {
            label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }).replace(" ", " '");
          }
        }
      } catch (_) {}
      ctx.fillText(label, x, priceHeight + (hasOscillators ? oscPanelH + 20 : 6));
    }

    // ── Draw indicator lines (price panel) ────────────────────────────────────
    for (const s of activePriceIndicators) {
      const dateMap: Record<string, number> = {};
      for (const e of s.data) { if (e.value != null) dateMap[String(e.date).substring(0, 19)] = e.value; }

      ctx.beginPath();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.75;
      let started = false;
      for (let i = 0; i < visible.length; i++) {
        const dateKey = String(visible[i].date).substring(0, 19);
        const val = dateMap[dateKey];
        if (val == null) continue;
        const x = xAt(startIdx + i) + candleW / 2;
        const y = priceToY(val);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // ── Determine Green vs Red Color Based on Profit or Loss ────────────────
    const isProfit = pnl !== undefined && pnl !== null
      ? pnl >= 0
      : (visible[visible.length - 1]?.close ?? 0) >= (visible[0]?.close ?? 0);
    const themeLineColor = isProfit ? "#10b981" : "#ef4444"; // Green for profit, Red for loss

    if (chartType === "line") {
      ctx.save();
      ctx.strokeStyle = themeLineColor;
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      for (let i = 0; i < visible.length; i++) {
        const x = xAt(startIdx + i) + candleW / 2;
        const y = priceToY(visible[i].close);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      // Current live dot at last bar (matching profit green or loss red)
      if (visible.length > 0) {
        const lastI = visible.length - 1;
        const lastX = xAt(startIdx + lastI) + candleW / 2;
        const lastY = priceToY(visible[lastI].close);

        ctx.save();
        ctx.beginPath();
        ctx.arc(lastX, lastY, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = themeLineColor;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }
    } else {
      // Candlesticks (Wicks + Body)
      for (let i = 0; i < visible.length; i++) {
        const c = visible[i];
        const x = xAt(startIdx + i);
        const isUp = c.close >= c.open;
        const color = isUp ? "#10b981" : "#ef4444";

        const yHigh = priceToY(c.high);
        const yLow = priceToY(c.low);
        const yOpen = priceToY(c.open);
        const yClose = priceToY(c.close);

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        // Wick
        ctx.beginPath();
        ctx.moveTo(x + candleW / 2, yHigh);
        ctx.lineTo(x + candleW / 2, yLow);
        ctx.stroke();
        // Body
        const bTop = Math.min(yOpen, yClose);
        const bH = Math.max(Math.abs(yOpen - yClose), 1);
        ctx.fillStyle = color;
        ctx.fillRect(x + (candleW - bodyW) / 2, bTop, bodyW, bH);
      }
    }

    // ── Draw Exact Trade Pins (S in Red Circle, B in Green Circle) ───────────
    for (let i = 0; i < visible.length; i++) {
      const c = visible[i];
      const candleIdx = Math.floor(startIdx + i);
      const matched = tradesByCandleIdx[candleIdx] || [];
      if (!matched.length) continue;

      const baseX = xAt(startIdx + i) + candleW / 2;
      matched.forEach((t, tIdx) => {
        const isBuy = t.type === "BUY";
        const pinColor = isBuy ? "#10b981" : "#ef4444";
        const offsetShift = (tIdx - (matched.length - 1) / 2) * 14;
        const pinX = baseX + offsetShift;
        const rawPinY = isBuy ? priceToY(c.low) + 14 : priceToY(c.high) - 14;
        const pinY = Math.max(14, Math.min(priceHeight - 14, rawPinY));

        // Circular pin
        ctx.save();
        ctx.beginPath();
        ctx.arc(pinX, pinY, 7.5, 0, Math.PI * 2);
        ctx.fillStyle = pinColor;
        ctx.fill();

        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 9px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(isBuy ? "B" : "S", pinX, pinY + 0.5);
        ctx.restore();
      });
    }

    // ── Oscillator Sub-Panel (RSI with 70, 50, 30 Guidelines) ────────────────
    if (hasOscillators && oscPanelH > 0) {
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, oscPanelY); ctx.lineTo(chartWidth, oscPanelY); ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, oscPanelY, chartWidth, oscPanelH);

      let oscMin = 0, oscMax = 100;
      const oscRange = oscMax - oscMin || 1;
      const oscToY = (v: number) => oscPanelY + oscPanelH - ((v - oscMin) / oscRange) * oscPanelH;

      // 70 / 50 / 30 reference lines matching screenshot
      for (const lvl of [70, 50, 30]) {
        const y = oscToY(lvl);
        ctx.strokeStyle = lvl === 70 ? "#fca5a5" : (lvl === 50 ? "#e2e8f0" : "#86efac");
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartWidth, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = lvl === 70 ? "#ef4444" : (lvl === 50 ? "#64748b" : "#10b981");
        ctx.font = "9px Inter, sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(String(lvl), chartWidth + 8, y);
      }

      // Draw oscillator curve
      for (const s of activeOscillators) {
        const dateMap: Record<string, number> = {};
        for (const e of s.data) { if (e.value != null) dateMap[String(e.date).substring(0, 19)] = e.value; }

        ctx.beginPath();
        ctx.strokeStyle = "#1e293b"; // Charcoal line matching screenshot
        ctx.lineWidth = 1.6;
        let started = false;
        for (let i = 0; i < visible.length; i++) {
          const val = dateMap[String(visible[i].date).substring(0, 19)];
          if (val == null) continue;
          const x = xAt(startIdx + i) + candleW / 2;
          const y = oscToY(val);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Shaded soft channel
        ctx.globalAlpha = 0.06;
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(0, oscToY(70), chartWidth, oscToY(30) - oscToY(70));
        ctx.globalAlpha = 1;
      }
    }

    // ── Crosshair HUD ────────────────────────────────────────────────────────
    const ch = view.crosshair;
    if (ch && ch.x >= 0 && ch.x <= chartWidth) {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ch.x, 0); ctx.lineTo(ch.x, hasOscillators ? oscPanelY + oscPanelH : priceHeight); ctx.stroke();

      const candle = candles[ch.idx];
      if (candle && ch.y <= priceHeight) {
        const cDate = String(candle.date).trim();
        const priceVal = candle.close;
        const hoverY = priceToY(priceVal);

        ctx.beginPath();
        ctx.arc(ch.x, hoverY, 4, 0, Math.PI * 2);
        ctx.fillStyle = "#10b981";
        ctx.fill();

        // Check if there are trade(s) on this candle
        const matchedTrades = tradesByCandleIdx[ch.idx] || [];
        let labelText = `₹${priceVal.toFixed(2)} · ${cDate.substring(0, 16)}`;
        if (matchedTrades.length > 0) {
          const tDesc = matchedTrades.map(t => `${t.type === "BUY" ? "🟢 BUY" : "🔴 SELL"} @ ₹${Number(t.price).toFixed(2)}${t.pnl != null ? ` (${t.pnl >= 0 ? "+" : ""}₹${Math.round(t.pnl)})` : ""}`).join(" | ");
          labelText = `${labelText}  •  ${tDesc}`;
        }

        ctx.font = "600 11px Inter, sans-serif";
        const tw = ctx.measureText(labelText).width + 16;
        let tx = ch.x - tw / 2;
        if (tx < 6) tx = 6;
        if (tx + tw > chartWidth - 6) tx = chartWidth - tw - 6;

        ctx.fillStyle = "#0f172a";
        ctx.beginPath();
        if ((ctx as any).roundRect) (ctx as any).roundRect(tx, 6, tw, 22, 4);
        else ctx.rect(tx, 6, tw, 22);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(labelText, tx + tw / 2, 17);
      }
    }

  }, [candles, trades, indicatorSeries, dimensions, tradesByCandleIdx, tradeRegions, chartType, visibleIndicators, activePriceIndicators, activeOscillators, hasOscillators, renderTick]);

  // ── Native Wheel Zoom with Cursor Anchoring ───────────────────────────────
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || !candles.length) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      const chartWidth = Math.max(50, dimensions.width - 55);
      const ratio = Math.max(0, Math.min(1, clientX / chartWidth));

      const view = viewRef.current;
      const currentStart = candles.length - view.zoom - view.panOffset;
      const anchorCandleIdx = currentStart + ratio * view.zoom;

      const zoomFactor = e.deltaY > 0 ? 1.30 : 0.77;
      const newZoom = Math.min(candles.length, Math.max(8, view.zoom * zoomFactor));

      const newStart = anchorCandleIdx - ratio * newZoom;
      const newPan = candles.length - newZoom - newStart;

      view.zoom = newZoom;
      view.panOffset = Math.max(0, Math.min(candles.length - newZoom, newPan));
      setRenderTick(t => t + 1);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [candles.length, dimensions.width]);

  // ── Mouse Drag Panning & Crosshair ─────────────────────────────────────────
  const getIdxAtX = (clientX: number) => {
    if (!canvasRef.current || !candles.length) return -1;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const chartWidth = dimensions.width - 55;
    const view = viewRef.current;
    const startIdx = candles.length - view.zoom - view.panOffset;
    const idx = Math.floor(startIdx + (x / chartWidth) * view.zoom);
    return Math.max(0, Math.min(idx, candles.length - 1));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current || !candles.length) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const view = viewRef.current;

    if (view.isDragging) {
      const dx = e.clientX - view.dragStartX;
      const chartWidth = Math.max(50, dimensions.width - 55);
      const candleShift = (dx / chartWidth) * view.zoom;
      view.panOffset = Math.max(0, Math.min(candles.length - view.zoom, view.dragStartPan + candleShift));
    }

    view.crosshair = { x, y, idx: getIdxAtX(e.clientX) };
    setRenderTick(t => t + 1);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    viewRef.current.isDragging = true;
    viewRef.current.dragStartX = e.clientX;
    viewRef.current.dragStartPan = viewRef.current.panOffset;
  };

  const handleMouseUp = () => {
    viewRef.current.isDragging = false;
    setRenderTick(t => t + 1);
  };

  const handleMouseLeave = () => {
    viewRef.current.isDragging = false;
    viewRef.current.crosshair = null;
    setRenderTick(t => t + 1);
  };

  const handleFitAll = () => {
    viewRef.current.zoom = Math.max(10, candles.length);
    viewRef.current.panOffset = 0;
    setRenderTick(t => t + 1);
  };

  const handleFocusTrades = () => {
    if (!tradeCandleIndices.length) {
      handleFitAll();
      return;
    }
    const minIdx = tradeCandleIndices[0];
    const maxIdx = tradeCandleIndices[tradeCandleIndices.length - 1];
    const span = Math.max(20, maxIdx - minIdx + 1);
    const padding = Math.max(15, Math.floor(span * 0.25));
    const targetStart = Math.max(0, minIdx - padding);
    const targetEnd = Math.min(candles.length, maxIdx + padding + 1);
    const targetZoom = Math.max(15, targetEnd - targetStart);
    viewRef.current.zoom = targetZoom;
    viewRef.current.panOffset = Math.max(0, candles.length - targetZoom - targetStart);
    setRenderTick(t => t + 1);
  };

  const handleZoomIn = () => {
    const view = viewRef.current;
    const centerIdx = (candles.length - view.zoom - view.panOffset) + view.zoom / 2;
    const newZoom = Math.max(8, view.zoom * 0.6);
    const newStart = centerIdx - newZoom / 2;
    view.zoom = newZoom;
    view.panOffset = Math.max(0, Math.min(candles.length - newZoom, candles.length - newZoom - newStart));
    setRenderTick(t => t + 1);
  };

  const handleZoomOut = () => {
    const view = viewRef.current;
    const centerIdx = (candles.length - view.zoom - view.panOffset) + view.zoom / 2;
    const newZoom = Math.min(candles.length, view.zoom * 1.6);
    const newStart = centerIdx - newZoom / 2;
    view.zoom = newZoom;
    view.panOffset = Math.max(0, Math.min(candles.length - newZoom, candles.length - newZoom - newStart));
    setRenderTick(t => t + 1);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      {/* ── Mode Toggle & Zoom Toolbar ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 6, flexWrap: "wrap" }}>
        {/* Left: Trade Coverage Info */}
        <div style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 6 }}>
          <span>Showing <strong>{candles.length}</strong> candles · <strong>{trades.length}</strong> trade pins</span>
        </div>

        {/* Right: Zoom controls and Line/Candle Toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Zoom controls */}
          <div style={{ display: "flex", background: "#f8fafc", borderRadius: 6, padding: 2, border: "1px solid #e2e8f0", gap: 2 }}>
            <button
              type="button"
              title="Zoom In (or use mouse scroll wheel)"
              style={{
                border: "none",
                background: "transparent",
                color: "#0f172a",
                fontWeight: 800,
                fontSize: 13,
                padding: "2px 8px",
                borderRadius: 4,
                cursor: "pointer",
              }}
              onClick={handleZoomIn}
            >
              +
            </button>
            <button
              type="button"
              title="Zoom Out (or use mouse scroll wheel)"
              style={{
                border: "none",
                background: "transparent",
                color: "#0f172a",
                fontWeight: 800,
                fontSize: 13,
                padding: "2px 8px",
                borderRadius: 4,
                cursor: "pointer",
              }}
              onClick={handleZoomOut}
            >
              -
            </button>
            <button
              type="button"
              title="Zoom directly to frame all executed trades"
              style={{
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: "#2563eb",
                fontWeight: 700,
                fontSize: 10,
                padding: "2px 8px",
                borderRadius: 4,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
              onClick={handleFocusTrades}
            >
              🎯 Focus Trades
            </button>
            <button
              type="button"
              title="Fit all candles & timeline"
              style={{
                border: "1px solid #e2e8f0",
                background: "#ffffff",
                color: "#0f172a",
                fontWeight: 600,
                fontSize: 10,
                padding: "2px 8px",
                borderRadius: 4,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
              onClick={handleFitAll}
            >
              Fit All
            </button>
          </div>

          {/* Line vs Candle toggle */}
          <div style={{ display: "flex", background: "#f1f5f9", borderRadius: 6, padding: 2, border: "1px solid #e2e8f0" }}>
            <button
              type="button"
              style={{
                border: chartType === "line" ? "1px solid #cbd5e1" : "none",
                background: chartType === "line" ? "#ffffff" : "transparent",
                color: chartType === "line" ? "#0f172a" : "#64748b",
                fontWeight: chartType === "line" ? 600 : 500,
                fontSize: 11,
                padding: "3px 10px",
                borderRadius: 4,
                cursor: "pointer",
                boxShadow: chartType === "line" ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
              onClick={() => setChartType("line")}
            >
              📈 Line
            </button>
            <button
              type="button"
              style={{
                border: chartType === "candle" ? "1px solid #cbd5e1" : "none",
                background: chartType === "candle" ? "#ffffff" : "transparent",
                color: chartType === "candle" ? "#0f172a" : "#64748b",
                fontWeight: chartType === "candle" ? 600 : 500,
                fontSize: 11,
                padding: "3px 10px",
                borderRadius: 4,
                cursor: "pointer",
                boxShadow: chartType === "candle" ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
              onClick={() => setChartType("candle")}
            >
              🕯 Candle
            </button>
          </div>
        </div>
      </div>

      {/* ── Canvas Chart Box ── */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          minHeight: 380,
          borderRadius: 8,
          overflow: "hidden",
          background: "#ffffff",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            cursor: viewRef.current.isDragging ? "grabbing" : "crosshair",
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        />
      </div>
    </div>
  );
}


