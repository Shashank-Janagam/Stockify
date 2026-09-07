import React from "react";
import {
  Chart as ChartJS,
  LinearScale,
  TimeScale,
  TimeSeriesScale,
  LineElement,
  PointElement,
  Tooltip,
  ScatterController,
  LineController
} from "chart.js";
import { Chart } from "react-chartjs-2";
import "chartjs-adapter-date-fns";

ChartJS.register(
  LinearScale,
  TimeScale,
  TimeSeriesScale,
  LineElement,
  LineController,
  PointElement,
  Tooltip,
  ScatterController
);

export type IndicatorSeries = {
  key: string;
  label: string;
  color: string;
  width?: number;
  values: { x: string | number; y: number }[];
};

export type AlgoTradeSignal = {
  side: "BUY" | "SELL";
  quantity?: number;
  pricePerShare?: number;
  createdAtIST: string | number;
};

interface AlgoSimulationChartProps {
  lineData: { x: number; y: number }[];
  timeframe: string;
  marketState?: string;
  referencePrice?: number | null;
  percent?: string;
  trades?: AlgoTradeSignal[];
  indicatorSeries?: IndicatorSeries[];
  isScanning?: boolean;
  scanProgress?: number;
}

const parseTs = (v: string | number): number => {
  if (typeof v === 'number') return v;
  const normalized = String(v).replace(' ', 'T');
  const ms = Date.parse(normalized);
  return isNaN(ms) ? 0 : ms;
};

export const isPriceOverlayIndicator = (
  key: string,
  label: string,
  values: any[],
  baseMinPrice: number,
  baseMaxPrice: number
): boolean => {
  const k = (key || "").toLowerCase();
  const l = (label || "").toLowerCase();

  if (
    k.startsWith("ema") || k.startsWith("sma") || k.startsWith("vwap") ||
    k.startsWith("supertrend") || k.startsWith("bb") || k.startsWith("bollinger") ||
    l.includes("ema") || l.includes("sma") || l.includes("vwap") || l.includes("supertrend")
  ) {
    return true;
  }

  if (
    k.startsWith("rsi") || k.startsWith("macd") || k.startsWith("atr") ||
    k.startsWith("stoch") || k.startsWith("roc") || l.includes("rsi") || l.includes("macd") || l.includes("atr")
  ) {
    return false;
  }

  if (values && values.length && baseMinPrice > 0) {
    const valid = values
      .map(v => typeof v.y === 'number' ? v.y : parseFloat(v.y))
      .filter(v => !isNaN(v));
    if (valid.length) {
      const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
      if (avg >= baseMinPrice * 0.4 && avg <= baseMaxPrice * 2.5) {
        return true;
      }
    }
  }

  return false;
};

export const OscillatorSubChart: React.FC<{
  series: IndicatorSeries;
  timeRange?: { min?: number; max?: number };
}> = ({ series, timeRange }) => {
  const isRsi = series.key.toLowerCase().includes("rsi") || series.label.toLowerCase().includes("rsi");

  const parsedData = (series.values || [])
    .map((pt: any) => ({ x: parseTs(pt.x), y: typeof pt.y === 'number' ? pt.y : parseFloat(String(pt.y)) }))
    .filter((pt: any) => pt.x > 0 && !isNaN(pt.y));

  const yMin = isRsi ? 0 : undefined;
  const yMax = isRsi ? 100 : undefined;
  const currentVal = parsedData.length ? parsedData[parsedData.length - 1].y : null;

  return (
    <div
      style={{
        height: "115px",
        marginTop: "8px",
        background: "#08101a",
        border: "1px solid #1e293b",
        borderRadius: "8px",
        position: "relative",
        padding: "6px 10px"
      }}
    >
      <div style={{ position: "absolute", top: "8px", left: "12px", zIndex: 5, display: "flex", gap: "10px", alignItems: "center" }}>
        <span style={{ color: series.color || "#34d399", fontSize: "0.78rem", fontWeight: "700" }}>
          ● {series.label}: {currentVal != null ? currentVal.toFixed(2) : "--"}
        </span>
        {isRsi && (
          <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: "500" }}>
            (OB: 70 | OS: 30)
          </span>
        )}
      </div>
      <Chart
        type="line"
        data={{
          datasets: [
            {
              data: parsedData,
              borderColor: series.color || "#34d399",
              borderWidth: 1.8,
              pointRadius: 0,
              tension: 0.05,
              parsing: false as const
            },
            ...(isRsi && parsedData.length > 1 ? [
              {
                data: [{ x: parsedData[0].x, y: 70 }, { x: parsedData[parsedData.length - 1].x, y: 70 }],
                borderColor: "rgba(239, 68, 68, 0.5)",
                borderWidth: 1,
                borderDash: [4, 4],
                pointRadius: 0,
                parsing: false as const
              },
              {
                data: [{ x: parsedData[0].x, y: 30 }, { x: parsedData[parsedData.length - 1].x, y: 30 }],
                borderColor: "rgba(16, 185, 129, 0.5)",
                borderWidth: 1,
                borderDash: [4, 4],
                pointRadius: 0,
                parsing: false as const
              }
            ] : [])
          ]
        }}
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
              min: timeRange?.min,
              max: timeRange?.max
            },
            y: {
              display: true,
              position: "right",
              min: yMin,
              max: yMax,
              grid: {
                color: "rgba(255, 255, 255, 0.04)"
              },
              ticks: {
                color: "#64748b",
                font: { size: 9 },
                maxTicksLimit: 3
              }
            }
          }
        }}
      />
    </div>
  );
};

export const AlgoSimulationChart: React.FC<AlgoSimulationChartProps> = ({
  lineData,
  timeframe,
  percent = "0",
  trades = [],
  indicatorSeries = [],
  isScanning = false,
  scanProgress = 0
}) => {
  if (!lineData || !lineData.length) {
    return <div className="chart-empty" style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>No simulation data available</div>;
  }

  const chartData = lineData.filter(d => !isNaN(d.x) && !isNaN(d.y));
  const basePrices = chartData.map(d => d.y);
  const baseMinPrice = basePrices.length ? Math.min(...basePrices) : 100;
  const baseMaxPrice = basePrices.length ? Math.max(...basePrices) : 100;

  const priceOverlays: IndicatorSeries[] = [];
  const oscillatorSeries: IndicatorSeries[] = [];

  (indicatorSeries || []).forEach(ind => {
    if (isPriceOverlayIndicator(ind.key, ind.label, ind.values || [], baseMinPrice, baseMaxPrice)) {
      priceOverlays.push(ind);
    } else {
      oscillatorSeries.push(ind);
    }
  });

  const allVisiblePrices: number[] = [...basePrices];
  trades.forEach(t => {
    if (t.pricePerShare != null && !isNaN(t.pricePerShare)) {
      allVisiblePrices.push(Number(t.pricePerShare));
    }
  });

  priceOverlays.forEach(ind => {
    (ind.values || []).forEach(pt => {
      const v = typeof pt.y === 'number' ? pt.y : parseFloat(String(pt.y));
      if (!isNaN(v) && v >= baseMinPrice * 0.6 && v <= baseMaxPrice * 1.5) {
        allVisiblePrices.push(v);
      }
    });
  });

  const minPriceFinal = allVisiblePrices.length ? Math.min(...allVisiblePrices) : baseMinPrice;
  const maxPriceFinal = allVisiblePrices.length ? Math.max(...allVisiblePrices) : baseMaxPrice;
  const pad = (maxPriceFinal - minPriceFinal) * 0.08 || minPriceFinal * 0.008 || 1;

  const pct = Number(percent) || 0;
  const lineColor = pct > 0 ? "#10b981" : pct < 0 ? "#ef4444" : "#38bdf8";

  // Build Price Overlay Datasets
  const overlayDatasets: any[] = priceOverlays.map(ind => ({
    type: 'line' as const,
    label: ind.label,
    data: (ind.values || [])
      .map((pt: any) => ({ x: parseTs(pt.x), y: typeof pt.y === 'number' ? pt.y : parseFloat(String(pt.y)) }))
      .filter((pt: any) => pt.x > 0 && !isNaN(pt.y)),
    borderColor: ind.color || "#38bdf8",
    borderWidth: ind.width ?? 1.8,
    pointRadius: 0,
    tension: 0.05,
    parsing: false as const,
    fill: false as const,
  }));

  // Build Buy/Sell trade marker datasets
  const buySignals = trades.filter(t => t.side === "BUY").map(t => ({
    x: typeof t.createdAtIST === 'number' ? t.createdAtIST : parseTs(t.createdAtIST),
    y: t.pricePerShare || 0
  })).filter(t => t.x > 0 && t.y > 0);

  const sellSignals = trades.filter(t => t.side === "SELL").map(t => ({
    x: typeof t.createdAtIST === 'number' ? t.createdAtIST : parseTs(t.createdAtIST),
    y: t.pricePerShare || 0
  })).filter(t => t.x > 0 && t.y > 0);

  const tradeDatasets: any[] = [
    {
      type: 'scatter' as const,
      label: 'Buy Signal',
      data: buySignals,
      backgroundColor: '#10b981',
      borderColor: '#ffffff',
      borderWidth: 1.5,
      pointRadius: 5,
      pointHoverRadius: 7,
      parsing: false as const
    },
    {
      type: 'scatter' as const,
      label: 'Sell Signal',
      data: sellSignals,
      backgroundColor: '#ef4444',
      borderColor: '#ffffff',
      borderWidth: 1.5,
      pointRadius: 5,
      pointHoverRadius: 7,
      parsing: false as const
    }
  ];

  const firstTs = chartData[0]?.x;
  const lastTs = chartData[chartData.length - 1]?.x;

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ height: oscillatorSeries.length > 0 ? "260px" : "340px", position: "relative", width: "100%" }}>
        {isScanning && (
          <>
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${scanProgress}%`,
                width: "2px",
                backgroundColor: "#38bdf8",
                boxShadow: "0 0 10px #38bdf8, 0 0 20px #38bdf8",
                zIndex: 10,
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                width: `${scanProgress}%`,
                background: "linear-gradient(90deg, rgba(56,189,248,0) 0%, rgba(56,189,248,0.15) 100%)",
                zIndex: 9,
                pointerEvents: "none"
              }}
            />
          </>
        )}

        <Chart
          key={`algo-sim-${timeframe}-${priceOverlays.length}`}
          type="line"
          data={{
            datasets: [
              {
                data: chartData,
                borderColor: lineColor,
                borderWidth: 2.2,
                pointRadius: 0,
                tension: 0.05,
                parsing: false as const
              },
              ...overlayDatasets,
              ...tradeDatasets
            ]
          }}
          options={{
            animation: false,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                enabled: true,
                mode: "nearest",
                intersect: false,
                backgroundColor: "rgba(15, 23, 42, 0.92)",
                titleColor: "#94a3b8",
                bodyColor: "#f8fafc",
                borderColor: "#334155",
                borderWidth: 1,
                callbacks: {
                  label: (ctx) => {
                    const y = ctx.parsed?.y;
                    return y != null ? `₹${Number(y).toFixed(2)}` : "";
                  }
                }
              }
            },
            scales: {
              x: {
                type: "timeseries",
                display: false,
                min: firstTs,
                max: lastTs
              },
              y: {
                display: true,
                position: "right",
                min: minPriceFinal - pad,
                max: maxPriceFinal + pad,
                grid: {
                  color: "rgba(255, 255, 255, 0.04)"
                },
                ticks: {
                  color: "#64748b",
                  font: { size: 10 },
                  callback: (val: any) => `₹${Number(val).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                }
              }
            }
          }}
        />
      </div>

      {/* Oscillator Subpanels (RSI, MACD, ATR) */}
      {oscillatorSeries.map(osc => (
        <OscillatorSubChart
          key={osc.key}
          series={osc}
          timeRange={{ min: firstTs, max: lastTs }}
        />
      ))}
    </div>
  );
};
