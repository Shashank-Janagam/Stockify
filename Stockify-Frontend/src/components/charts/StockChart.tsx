import React, { useEffect, useRef, useState } from "react";

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface Props {
  data: Candle[];
  fixedXRange?: { min: number, max: number };
}

export default function StockChart({ data, fixedXRange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [dimensions, setDimensions] = useState({ width: 0, height: 400 });
  const viewRef = useRef({
    zoom: 100, // Number of candles visible
    panOffset: 0, // Offset from right edge
    isDragging: false,
    dragStartX: 0,
    crosshair: null as { x: number, y: number, candle: Candle | null } | null
  });

  // Observe container size
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (let e of entries) {
        setDimensions({ width: e.contentRect.width, height: e.contentRect.height });
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Main drawing loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length === 0 || dimensions.width === 0) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);
    
    // Set initial zoom based on data length if it's small
    if (viewRef.current.zoom > data.length && data.length > 0) {
      viewRef.current.zoom = Math.max(10, data.length);
    }

    let animationFrameId: number;

    const draw = () => {
      const { width, height } = dimensions;
      ctx.clearRect(0, 0, width, height);

      const rightMargin = 60;
      const bottomMargin = 25;
      const chartWidth = width - rightMargin;
      const chartHeight = height - bottomMargin;

      const view = viewRef.current;
      
      // Enforce bounds
      view.zoom = Math.min(Math.max(view.zoom, 10), data.length || 10);
      view.panOffset = Math.max(0, Math.min(view.panOffset, data.length - view.zoom));

      const startIndex = Math.max(0, data.length - view.zoom - view.panOffset);
      const endIndex = Math.min(data.length, startIndex + view.zoom);
      
      const isFixed = !!fixedXRange;
      const minT = fixedXRange?.min || 0;
      const maxT = fixedXRange?.max || 1;

      const visibleData = isFixed ? data : data.slice(Math.floor(startIndex), Math.ceil(endIndex));
      if (visibleData.length === 0) return;

      // Find price range
      let minPrice = Infinity;
      let maxPrice = -Infinity;
      for (const d of visibleData) {
        if (d.low < minPrice) minPrice = d.low;
        if (d.high > maxPrice) maxPrice = d.high;
      }
      
      if (minPrice === Infinity) return;
      const priceRange = maxPrice - minPrice || 1;
      const paddedMin = minPrice - priceRange * 0.1;
      const paddedMax = maxPrice + priceRange * 0.1;
      const finalRange = paddedMax - paddedMin;

      const priceToY = (p: number) => chartHeight - ((p - paddedMin) / finalRange) * chartHeight;
      let candleWidth = chartWidth / view.zoom;
      if (isFixed) {
        const totalMinutes = (maxT - minT) / 60;
        let intervalMins = 1;
        if (visibleData.length > 1) {
          let minDiff = Infinity;
          for (let k = 1; k < Math.min(visibleData.length, 10); k++) {
            const diff = (visibleData[k].time - visibleData[k - 1].time) / 60;
            if (diff > 0 && diff < minDiff) minDiff = diff;
          }
          if (minDiff !== Infinity) intervalMins = Math.round(minDiff);
        }
        candleWidth = (chartWidth / totalMinutes) * intervalMins;
      }
      const bodyWidth = Math.max(1, candleWidth * 0.9);
      
      // Grid & Y-Axis
      ctx.strokeStyle = "rgba(100, 116, 139, 0.1)"; // Very faint grid
      ctx.lineWidth = 1;
      
      const numYLines = 5;
      ctx.fillStyle = "#94a3b8"; // Muted text
      ctx.font = "11px Inter, system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      
      for (let i = 0; i <= numYLines; i++) {
        const y = (chartHeight / numYLines) * i;
        const p = paddedMax - (finalRange / numYLines) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(chartWidth, y);
        ctx.stroke();
        ctx.fillText(p.toFixed(2), chartWidth + 5, y);
      }

      // Draw Candles
      for (let i = 0; i < visibleData.length; i++) {
        const d = visibleData[i];
        let x = 0;
        if (isFixed) {
          x = ((d.time - minT) / (maxT - minT)) * chartWidth;
        } else {
          const exactIndex = Math.floor(startIndex) + i;
          x = ((exactIndex - startIndex) / view.zoom) * chartWidth;
        }
        
        const isUp = d.close >= d.open;
        const color = isUp ? "#10b981" : "#ef4444";
        
        const yOpen = priceToY(d.open);
        const yClose = priceToY(d.close);
        const yHigh = priceToY(d.high);
        const yLow = priceToY(d.low);

        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        
        // Wick
        ctx.beginPath();
        ctx.moveTo(x + candleWidth / 2, yHigh);
        ctx.lineTo(x + candleWidth / 2, yLow);
        ctx.stroke();

        // Body
        const bTop = Math.min(yOpen, yClose);
        const bHeight = Math.max(Math.abs(yOpen - yClose), 1);
        ctx.fillRect(x + (candleWidth - bodyWidth) / 2, bTop, bodyWidth, bHeight);
        
        // X-Axis labels (roughly 5 labels)
        if (!isFixed && i % Math.ceil(view.zoom / 5) === 0) {
          ctx.fillStyle = "#94a3b8";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          const date = new Date(d.time > 1e11 ? d.time : d.time * 1000);
          const timeStr = view.zoom > 100 ? date.toLocaleDateString(undefined, {month:'short', day:'numeric'}) : date.toLocaleTimeString(undefined, {hour:'2-digit', minute:'2-digit'});
          ctx.fillText(timeStr, x + candleWidth / 2, chartHeight + 5);
        }
      }

      // Draw fixed X-Axis labels
      if (isFixed) {
        for(let j = 0; j <= 5; j++) {
           const t = minT + (maxT - minT) * (j / 5);
           const lx = (j / 5) * chartWidth;
           ctx.fillStyle = "#94a3b8";
           ctx.textAlign = "center";
           ctx.textBaseline = "top";
           const date = new Date(t * 1000);
           const timeStr = date.toLocaleTimeString(undefined, {hour:'2-digit', minute:'2-digit', timeZone: 'UTC'});
           ctx.fillText(timeStr, lx, chartHeight + 5);
        }
      }

      // Crosshair & Tooltip
      if (view.crosshair) {
        const { x, y, candle } = view.crosshair;
        if (x >= 0 && x <= chartWidth && y >= 0 && y <= chartHeight) {
          ctx.strokeStyle = "rgba(100, 116, 139, 0.4)";
          ctx.setLineDash([4, 4]);
          
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, chartHeight);
          ctx.stroke();
          
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(chartWidth, y);
          ctx.stroke();
          ctx.setLineDash([]);
          
          if (candle) {
            // Price Tag on Y Axis
            const priceVal = paddedMax - (y / chartHeight) * finalRange;
            ctx.fillStyle = "#1e293b"; // slate-800
            ctx.fillRect(chartWidth, y - 10, rightMargin, 20);
            ctx.fillStyle = "#f8fafc"; // slate-50
            ctx.textAlign = "left";
            ctx.fillText(priceVal.toFixed(2), chartWidth + 5, y);
            
            // Tooltip Box
            const boxW = 110;
            const boxH = 75;
            let bx = x + 10;
            let by = y + 10;
            if (bx + boxW > chartWidth) bx = x - boxW - 10;
            if (by + boxH > chartHeight) by = y - boxH - 10;
            
            ctx.fillStyle = "rgba(15, 23, 42, 0.9)"; // slate-900 / 90%
            ctx.beginPath();
            ctx.roundRect(bx, by, boxW, boxH, 6);
            ctx.fill();
            
            ctx.fillStyle = "#e2e8f0"; // slate-200
            ctx.font = "10px Inter, system-ui, sans-serif";
            const d = new Date(candle.time > 1e11 ? candle.time : candle.time * 1000);
            ctx.fillText(d.toLocaleString(undefined, {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}), bx + 8, by + 12);
            
            ctx.fillStyle = "#10b981"; ctx.fillText(`O: ${candle.open.toFixed(2)}`, bx + 8, by + 28);
            ctx.fillStyle = "#10b981"; ctx.fillText(`H: ${candle.high.toFixed(2)}`, bx + 55, by + 28);
            ctx.fillStyle = "#ef4444"; ctx.fillText(`L: ${candle.low.toFixed(2)}`, bx + 8, by + 42);
            ctx.fillStyle = candle.close >= candle.open ? "#10b981" : "#ef4444"; 
            ctx.fillText(`C: ${candle.close.toFixed(2)}`, bx + 55, by + 42);
            
            const change = candle.close - candle.open;
            const changePct = (change / candle.open) * 100;
            ctx.fillStyle = change >= 0 ? "#10b981" : "#ef4444";
            ctx.fillText(`${change > 0 ? '+' : ''}${change.toFixed(2)} (${changePct.toFixed(2)}%)`, bx + 8, by + 60);
          }
        }
      }
    };

    const render = () => {
      draw();
      animationFrameId = requestAnimationFrame(render);
    };
    render();

    return () => cancelAnimationFrame(animationFrameId);
  }, [data, dimensions]);

  // Prevent browser scrolling when zooming the chart
  useEffect(() => {
    const preventScroll = (e: WheelEvent) => e.preventDefault();
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener("wheel", preventScroll, { passive: false });
      return () => canvas.removeEventListener("wheel", preventScroll);
    }
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    if (fixedXRange) return;
    e.preventDefault();
    if (!data.length) return;
    const zoomFactor = 0.15;
    const oldZoom = viewRef.current.zoom;
    let newZoom = oldZoom * (1 + (e.deltaY > 0 ? zoomFactor : -zoomFactor));
    
    // Clamp zoom
    newZoom = Math.min(Math.max(newZoom, 10), data.length);
    
    // Adjust pan to zoom towards mouse cursor
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const chartWidth = dimensions.width - 60;
      
      if (mouseX >= 0 && mouseX <= chartWidth) {
        const mousePct = mouseX / chartWidth;
        // Shift panOffset to keep the candle under mouse stationary
        const shift = (newZoom - oldZoom) * (1 - mousePct);
        viewRef.current.panOffset = Math.max(0, Math.min(viewRef.current.panOffset + shift, data.length - newZoom));
      }
    }
    
    viewRef.current.zoom = newZoom;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (fixedXRange) return;
    viewRef.current.isDragging = true;
    viewRef.current.dragStartX = e.clientX;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current || !data.length) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const chartWidth = dimensions.width - 60;
    const view = viewRef.current;
    
    if (view.isDragging) {
      const dx = e.clientX - view.dragStartX;
      const candlesShifted = (dx / chartWidth) * view.zoom;
      view.panOffset = Math.max(0, Math.min(view.panOffset + candlesShifted, data.length - view.zoom));
      view.dragStartX = e.clientX;
      view.crosshair = null; 
    } else {
      let candle = null;
      if (fixedXRange) {
        const t = fixedXRange.min + (x / chartWidth) * (fixedXRange.max - fixedXRange.min);
        let minDiff = Infinity;
        for (const d of data) {
          const diff = Math.abs(d.time - t);
          if (diff < minDiff) {
            minDiff = diff;
            candle = d;
          }
        }
        if (minDiff > 5 * 60) candle = null; // Hide if cursor is >5 mins away from nearest candle
      } else {
        const startIndex = data.length - view.zoom - view.panOffset;
        const hoverIndex = Math.floor(startIndex + (x / chartWidth) * view.zoom);
        
        if (hoverIndex >= 0 && hoverIndex < data.length) {
          candle = data[hoverIndex];
        }
      }
      view.crosshair = { x, y, candle };
    }
  };

  const handleMouseUpOrLeave = (e: React.MouseEvent) => {
    viewRef.current.isDragging = false;
    if (e.type === 'mouseleave') {
      viewRef.current.crosshair = null;
    }
  };

  return (
    <div 
      ref={containerRef} 
      style={{ width: "100%", height: "100%", position: "relative", minHeight: "400px" }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          cursor: viewRef.current.isDragging ? "grabbing" : "crosshair",
          touchAction: "none" // Prevent browser scrolling on touch
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
      />
    </div>
  );
}
