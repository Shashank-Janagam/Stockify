import { useState } from "react";
import "../Styles/Portfolio.css";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Filler,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const Portfolio = () => {
  const [timeRange, setTimeRange] = useState("1M");

  // Mock Data
  const portfolioSummary = {
    currentValue: "₹12,45,320.00",
    investedValue: "₹10,50,000.00",
    totalReturns: 195320,
    totalReturnsPercent: 18.6,
    dayReturns: 12450,
    dayReturnsPercent: 1.2,
  };

  const holdings = [
    { id: 1, symbol: "RELIANCE", name: "Reliance Industries", qty: 50, avg: 2400, ltp: 2550, pnl: 7500, pnlPercent: 6.25, logo: "R" },
    { id: 2, symbol: "TCS", name: "Tata Consultancy Svc", qty: 25, avg: 3200, ltp: 3450, pnl: 6250, pnlPercent: 7.81, logo: "T" },
    { id: 3, symbol: "INFY", name: "Infosys Limited", qty: 100, avg: 1400, ltp: 1380, pnl: -2000, pnlPercent: -1.42, logo: "I" },
    { id: 4, symbol: "HDFCBANK", name: "HDFC Bank Ltd", qty: 40, avg: 1600, ltp: 1650, pnl: 2000, pnlPercent: 3.12, logo: "H" },
    { id: 5, symbol: "ICICIBANK", name: "ICICI Bank Ltd", qty: 80, avg: 900, ltp: 960, pnl: 4800, pnlPercent: 6.66, logo: "I" },
  ];

  // Chart Data: Performance
  const performanceData = {
    labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"],
    datasets: [
      {
        label: "Portfolio Value",
        data: [1050000, 1080000, 1065000, 1120000, 1150000, 1210000, 1245320],
        fill: true,
        backgroundColor: (context: any) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 400);
          gradient.addColorStop(0, "rgba(16, 185, 129, 0.2)");
          gradient.addColorStop(1, "rgba(16, 185, 129, 0)");
          return gradient;
        },
        borderColor: "#10b981",
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 6,
      },
    ],
  };

  const performanceOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        mode: "index" as const,
        intersect: false,
        backgroundColor: "#1f2937",
        titleColor: "#f3f4f6",
        bodyColor: "#f3f4f6",
        borderColor: "#374151",
        borderWidth: 1,
        padding: 10,
        displayColors: false,
        callbacks: {
          label: function (context: any) {
            return ` ₹${context.parsed.y.toLocaleString()}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: "#9ca3af",
          font: { size: 12 },
        },
      },
      y: {
        display: false,
        min: 1000000,
      },
    },
    interaction: {
      mode: "nearest" as const,
      axis: "x" as const,
      intersect: false,
    },
  };

  const formatCurrency = (val: number) => {
    return val >= 0 ? `+₹${val.toLocaleString()}` : `-₹${Math.abs(val).toLocaleString()}`;
  };

  return (
    <div className="portfolio-page fade-in">
      {/* HEADER */}
      <header className="portfolio-header">
        <div>
          <h1 className="portfolio-title">My Portfolio</h1>
          <p className="portfolio-subtitle">Welcome back, here is your investment overview</p>
        </div>
        <div className="portfolio-actions">
           <button className="action-btn primary">Add New</button>
           <button className="action-btn secondary">Reports</button>
        </div>
      </header>

      {/* SUMMARY GRID */}
      <section className="portfolio-summary-grid">
        {/* Main Value Card */}
        <div className="summary-card main-card">
          <div className="card-label">Current Value</div>
          <div className="card-value-lg">{portfolioSummary.currentValue}</div>
          <div className="card-meta">
            <span className="meta-label">Total Returns</span>
            <span className="meta-value pnl-green">
              {formatCurrency(portfolioSummary.totalReturns)} ({portfolioSummary.totalReturnsPercent}%)
            </span>
          </div>
           <div className="card-meta">
            <span className="meta-label">1D Returns</span>
            <span className="meta-value pnl-green">
              {formatCurrency(portfolioSummary.dayReturns)} ({portfolioSummary.dayReturnsPercent}%)
            </span>
          </div>
        </div>

        {/* Invested Value */}
        <div className="summary-card">
          <div className="card-icon-wrapper blue-bg">
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>
          </div>
          <div className="card-label">Invested Value</div>
          <div className="card-value">{portfolioSummary.investedValue}</div>
        </div>
        
         {/* Cash Balance (Mock) */}
        <div className="summary-card">
           <div className="card-icon-wrapper purple-bg">
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          </div>
          <div className="card-label">Free Cash</div>
          <div className="card-value">₹45,230.50</div>
           <div className="mini-link">Add Funds &rarr;</div>
        </div>

      </section>

      {/* CONTENT LAYOUT */}
      <div className="portfolio-content-layout">
        
        {/* FULL WIDTH COLUMN: CHARTS + HOLDINGS */}
        <div className="portfolio-main">
          
          {/* PERFORMANCE CHART */}
          <div className="card-container chart-section">
            <div className="section-header-row">
              <h2 className="section-title">Portfolio Performance</h2>
              <div className="time-toggles">
                 {["1W", "1M", "6M", "1Y", "ALL"].map(t => (
                   <button 
                    key={t} 
                    className={`time-btn ${timeRange === t ? "active" : ""}`}
                    onClick={() => setTimeRange(t)}
                   >
                     {t}
                   </button>
                 ))}
              </div>
            </div>
            <div className="chart-wrapper-line">
              <Line data={performanceData} options={performanceOptions} />
            </div>
          </div>

          {/* HOLDINGS TABLE */}
          <div className="card-container holdings-section">
             <div className="section-header-row">
              <h2 className="section-title">Holdings ({holdings.length})</h2>
              <button className="view-all-btn">View All</button>
            </div>
            
            <table className="holdings-table-enhanced">
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th>Qty.</th>
                  <th>Avg. Cost</th>
                  <th>LTP</th>
                  <th>Cur. Val</th>
                  <th>P&L</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((stock) => (
                  <tr key={stock.id}>
                    <td>
                      <div className="stock-info-enhanced">
                        <div className="stock-logo-box">{stock.logo}</div>
                        <div>
                          <div className="stock-symbol">{stock.symbol}</div>
                          <div className="stock-name">{stock.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="font-num">{stock.qty}</td>
                    <td className="font-num">₹{stock.avg}</td>
                    <td className="font-num">
                        <div>₹{stock.ltp}</div>
                         <div className={`price-change ${stock.pnlPercent >= 0 ? "pos" : "neg"}`}>
                           {stock.pnlPercent >= 0 ? "+" : ""}{0.4}%
                         </div>
                    </td>
                    <td className="font-num strong">₹{(stock.qty * stock.ltp).toLocaleString()}</td>
                    <td>
                      <div className={`pnl-cell ${stock.pnl >= 0 ? "pos" : "neg"}`}>
                        <div className="pnl-val">{formatCurrency(stock.pnl)}</div>
                        <div className="pnl-pct">{stock.pnlPercent}%</div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>

      </div>
    </div>
  );
};

export default Portfolio;
