import React from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Filler, Tooltip
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

interface TradeItem {
  symbol: string;
  side: "BUY" | "SELL";
  realized_pnl?: number | string | null;
  executed_at_ist?: string | null;
  created_at_ist?: string;
  quantity: number;
  price: number | null;
  total_price: number | null;
}

interface ChartPoint {
  date: string;
  value: number;
}

interface Props {
  chartData: ChartPoint[];
  orders: TradeItem[];
  loading?: boolean;
}

function buildStreaks(orders: TradeItem[]) {
  const sells = orders.filter(o => o.side === "SELL" && o.realized_pnl != null);
  const recent = sells.slice(-12);
  return recent.map(o => ({ win: Number(o.realized_pnl) >= 0, sym: o.symbol?.replace(".NS","").replace(".BO","") }));
}

const Layer6_TradeHistory: React.FC<Props> = ({ chartData, orders, loading }) => {
  const sells = orders.filter(o => o.side === "SELL" && o.realized_pnl != null);
  const wins  = sells.filter(o => Number(o.realized_pnl) >= 0);
  const totalPnL = sells.reduce((s, o) => s + Number(o.realized_pnl || 0), 0);
  const avgPnL   = sells.length > 0 ? totalPnL / sells.length : 0;

  const streaks = buildStreaks(orders);
  let curStreak = 0, bestWin = 0, bestLoss = 0, cur = 0, isWin = true;
  for (let i = streaks.length - 1; i >= 0; i--) {
    if (i === streaks.length - 1) { isWin = streaks[i].win; cur = 1; }
    else if (streaks[i].win === isWin) cur++;
    else break;
  }
  curStreak = cur;

  // Equity curve dataset
  const equityLabels = chartData.map(d =>
    new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
  );
  const equityValues = chartData.map(d => d.value);
  const equityColor = (equityValues[equityValues.length - 1] ?? 0) >= (equityValues[0] ?? 0)
    ? "#10d48e" : "#f04444";

  const chartConfig = {
    labels: equityLabels,
    datasets: [{
      data: equityValues,
      fill: true,
      backgroundColor: (ctx: any) => {
        const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 150);
        g.addColorStop(0, equityColor + "33");
        g.addColorStop(1, equityColor + "00");
        return g;
      },
      borderColor: equityColor,
      tension: 0.3,
      pointRadius: chartData.length > 30 ? 0 : 2,
      pointHoverRadius: 4,
      borderWidth: 2,
    }],
  };

  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: "index" as const, intersect: false,
        backgroundColor: "#1e293b",
        titleColor: "#f1f5f9", bodyColor: "#94a3b8",
        borderColor: "rgba(255,255,255,0.07)", borderWidth: 1,
        padding: 10, displayColors: false,
        callbacks: {
          label: (ctx: any) => {
            const val = Number(ctx.parsed.y);
            return isNaN(val) ? "—" : `₹${val.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
          },
        },
      },
    },
    scales: {
      x: { display: false },
      y: { display: false },
    },
    interaction: { mode: "nearest" as const, axis: "x" as const, intersect: false },
  };

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="pc-skeleton" style={{ height: 150, borderRadius: 10 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          {[0,1,2].map(i => <div key={i} className="pc-skeleton" style={{ height: 70, borderRadius: 8 }} />)}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Equity Curve */}
      {chartData.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--pc-text-2)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            Portfolio Equity Curve
          </div>
          <div className="pc-equity-mini">
            <Line data={chartConfig} options={chartOpts} />
          </div>
        </div>
      )}

      <div className="pc-analytics-grid">
        {/* Win/Loss Streak */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--pc-text-2)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
            Recent Trade Streak
          </div>
          {streaks.length === 0 ? (
            <div style={{ color: "var(--pc-text-2)", fontSize: 13 }}>No closed trades yet</div>
          ) : (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {streaks.map((s, i) => (
                <div key={i} className={`pc-streak-dot ${s.win ? "win" : "loss"}`}>
                  {s.win ? "W" : "L"}
                </div>
              ))}
            </div>
          )}
          {curStreak > 0 && (
            <div style={{
              marginTop: 14, padding: "10px 14px", borderRadius: 10,
              background: isWin ? "var(--pc-green-dim)" : "var(--pc-red-dim)",
              border: `1px solid ${isWin ? "rgba(16,212,142,0.2)" : "rgba(240,68,68,0.2)"}`,
              color: isWin ? "var(--pc-green)" : "var(--pc-red)",
              fontSize: 13, fontWeight: 700,
            }}>
              🔥 Current {isWin ? "Win" : "Loss"} Streak: {curStreak} trades
            </div>
          )}
        </div>

        {/* Closed P&L Stats */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--pc-text-2)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
            Closed Trade P&L
          </div>
          <div className="pc-trade-kpis">
            <div className="pc-trade-kpi">
              <div className="pc-trade-kpi-label">Total Realised</div>
              <div className="pc-trade-kpi-val" style={{ color: totalPnL >= 0 ? "var(--pc-green)" : "var(--pc-red)", fontSize: 16 }}>
                {totalPnL >= 0 ? "+" : ""}₹{Math.abs(totalPnL).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="pc-trade-kpi">
              <div className="pc-trade-kpi-label">Wins</div>
              <div className="pc-trade-kpi-val pc-green-text">{wins.length}</div>
            </div>
            <div className="pc-trade-kpi">
              <div className="pc-trade-kpi-label">Losses</div>
              <div className="pc-trade-kpi-val pc-red-text">{sells.length - wins.length}</div>
            </div>
            <div className="pc-trade-kpi">
              <div className="pc-trade-kpi-label">Avg P&L</div>
              <div className="pc-trade-kpi-val" style={{ color: avgPnL >= 0 ? "var(--pc-green)" : "var(--pc-red)", fontSize: 14 }}>
                {avgPnL >= 0 ? "+" : ""}₹{Math.abs(avgPnL).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </div>
            </div>
            <div className="pc-trade-kpi">
              <div className="pc-trade-kpi-label">Total Closed</div>
              <div className="pc-trade-kpi-val">{sells.length}</div>
            </div>
            <div className="pc-trade-kpi">
              <div className="pc-trade-kpi-label">Win Rate</div>
              <div className="pc-trade-kpi-val" style={{ color: "var(--pc-blue-bright)", fontSize: 14 }}>
                {sells.length > 0 ? ((wins.length / sells.length) * 100).toFixed(0) : 0}%
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Layer6_TradeHistory;
