import { useState, useEffect, useContext } from "react";
import "../Styles/Portfolio.css";
import { AuthContext } from "../auth/AuthProvider";
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

type Holding = {
  symbol: string;
  name: string;
  quantity: number;
  currentPrice: number;
  datetime: string;
  dayChangePercent: number;
  invested: number;
  current: number;
  pnl: number;
  pnlPercent: number;
};

type Summary = {
  investedValue: number;
  currentValue: number;
  totalReturns: number;
  totalReturnsPercent: number;
  dayReturns?: number;
  dayReturnsPercent?: number;
};

type Balance = {
  cash: number;
  blocked: number;
};

type Order = {
  id: string;
  symbol: string;
  name: string; // Enhanced API returns this
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  status: string;
  created_at: string;
  total_price?: number; // Calculated on frontend or from API?
};

const Portfolio = () => {
  const { user } = useContext(AuthContext);
  const [token, setToken] = useState<string | null>(null);
  
  // Data States
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [chartData, setChartData] = useState<{ date: string; value: number }[]>([]);
  
  // UI States
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("1M");
  const [activeTab, setActiveTab] = useState<"HOLDINGS" | "HISTORY">("HOLDINGS");

  const HOST = import.meta.env.VITE_HOST_ADDRESS;

  /* =========================
     1. AUTH TOKEN
  ========================= */
  useEffect(() => {
    if (!user || typeof user.getIdToken !== "function") return;
    
    let mounted = true;
    user.getIdToken().then(jwt => {
        if(mounted) setToken(jwt);
    }).catch(err => console.error(err));

    return () => { mounted = false; }
  }, [user]);

  /* =========================
     2. FETCH DATA (HOLDINGS & BALANCE)
  ========================= */
  useEffect(() => {
    if (!token) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        // 1. Fetch Holdings & Summary
        const resHoldings = await fetch(`${HOST}/api/portfolio/summary`, {
          credentials: "include"
        });
        const dataHoldings = await resHoldings.json();
        
        if (dataHoldings.holdings) {
             setHoldings(dataHoldings.holdings);
             setSummary(dataHoldings.summary);
        }
        if (dataHoldings.chartData) {
            setChartData(dataHoldings.chartData);
        }

        // 2. Fetch Balance
        const resBalance = await fetch(`${HOST}/api/getBalance/getBalance`, {
             credentials: "include"
        });
        const dataBalance = await resBalance.json();
        setBalance(dataBalance);

      } catch (err) {
        console.error("Portfolio fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token, HOST]);

  /* =========================
     3. FETCH ORDERS (HISTORY) - On Tab Change
  ========================= */
  useEffect(() => {
    if (!token || activeTab !== "HISTORY") return;
    if (orders.length > 0) return; // Cache simple check

    const fetchOrders = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${HOST}/api/portfolio/history`, {
           credentials: "include"
        });
        const data = await res.json();
        setOrders(data);
      } catch (err) {
        console.error("Orders fetch error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, [token, activeTab, HOST, orders.length]);


  // Chart Data: Real Data
  const performanceData = {
    labels: chartData.map(d => new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })),
    datasets: [
      {
        label: "Invested Value",
        data: chartData.map(d => d.value),
        fill: true,
        backgroundColor: (context: any) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 400);
          gradient.addColorStop(0, "rgba(16, 185, 129, 0.2)");
          gradient.addColorStop(1, "rgba(16, 185, 129, 0)");
          return gradient;
        },
        borderColor: "#10b981",
        tension: 0.2, // Sharper lines for real data
        pointRadius: chartData.length > 1 ? 2 : 4,
        pointHoverRadius: 6,
      },
    ],
  };

  const performanceOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
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
        grid: { display: false },
        ticks: { color: "#9ca3af", font: { size: 12 } },
      },
      y: { display: false },
    },
    interaction: {
      mode: "nearest" as const,
      axis: "x" as const,
      intersect: false,
    },
  };

  const formatCurrency = (val: number) => {
    return val >= 0 ? `+₹${val.toLocaleString("en-IN", { minimumFractionDigits: 2 })}` : `-₹${Math.abs(val).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  };
   const formatValue = (val: number) => {
    return `₹${val.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  };
   const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute:"2-digit",
      timeZone: "Asia/Kolkata"
    });
  };


  if (loading && !summary && activeTab === "HOLDINGS") {
      return <div className="portfolio-page fade-in" style={{padding: 40, textAlign:'center'}}>Loading Portfolio...</div>;
  }

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
          <div className="card-value-lg">{formatValue(summary?.currentValue || 0)}</div>
          <div className="card-meta">
            <span className="meta-label">Total Returns</span>
            <span className={`meta-value ${summary?.totalReturns && summary.totalReturns >= 0 ? "pnl-green" : "pnl-red"}`}>
              {formatCurrency(summary?.totalReturns || 0)} ({summary?.totalReturnsPercent || 0}%)
            </span>
          </div>
           <div className="card-meta">
            <span className="meta-label">1D Returns</span>
            <span className={`meta-value ${summary?.dayReturns && summary.dayReturns >= 0 ? "pnl-green" : "pnl-red"}`}>
              {formatCurrency(summary?.dayReturns || 0)} ({summary?.dayReturnsPercent || 0}%)
            </span>
          </div>
        </div>

        {/* Invested Value */}
        <div className="summary-card">
          <div className="card-icon-wrapper blue-bg">
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>
          </div>
          <div className="card-label">Invested Value</div>
          <div className="card-value">{formatValue(summary?.investedValue || 0)}</div>
        </div>
        
         {/* Cash Balance */}
        <div className="summary-card">
           <div className="card-icon-wrapper purple-bg">
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
          </div>
          <div className="card-label">Free Cash</div>
          <div className="card-value">{formatValue(balance?.cash || 0)}</div>
           <div className="mini-link">Add Funds &rarr;</div>
        </div>
      </section>

      {/* CONTENT LAYOUT */}
      <div className="portfolio-content-layout">
        
        {/* FULL WIDTH COLUMN */}
        <div className="portfolio-main">
          
           {/* TABS */}
           <div className="portfolio-tabs" style={{marginBottom: 20, display:'flex', gap: 10, borderBottom:'1px solid #e5e7eb'}}>
             <button 
               className={`tab-btn ${activeTab === "HOLDINGS" ? "active" : ""}`}
               style={{
                   padding: "10px 20px", 
                   borderBottom: activeTab === "HOLDINGS" ? "2px solid #10b981" : "none",
                   fontWeight: activeTab === "HOLDINGS" ? 600 : 400,
                   background:'none', borderTop:'none', borderLeft:'none', borderRight:'none', cursor:'pointer'
               }}
               onClick={() => setActiveTab("HOLDINGS")}
             >
               Holdings
             </button>
             <button 
               className={`tab-btn ${activeTab === "HISTORY" ? "active" : ""}`}
               style={{
                   padding: "10px 20px", 
                   borderBottom: activeTab === "HISTORY" ? "2px solid #10b981" : "none",
                   fontWeight: activeTab === "HISTORY" ? 600 : 400,
                   background:'none', borderTop:'none', borderLeft:'none', borderRight:'none', cursor:'pointer'
               }}
               onClick={() => setActiveTab("HISTORY")}
             >
               History / Trades
             </button>
           </div>

          {/* HOLDINGS TAB */}
          {activeTab === "HOLDINGS" && (
            <>
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
                        {holdings.map((stock, i) => (
                        <tr key={i}>
                            <td>
                            <div className="stock-info-enhanced">
                                <div className="stock-logo-box">{stock.symbol.charAt(0)}</div>
                                <div>
                                <div className="stock-symbol">{stock.symbol}</div>
                                <div className="stock-name">{stock.name}</div>
                                </div>
                            </div>
                            </td>
                            <td className="font-num">{stock.quantity}</td>
                            <td className="font-num">₹{(stock.invested / stock.quantity).toLocaleString("en-IN", {maximumFractionDigits:2})}</td>
                            <td className="font-num">
                                <div>₹{stock.currentPrice}</div>
                                <div className={`price-change ${stock.dayChangePercent >= 0 ? "pos" : "neg"}`}>
                                {stock.dayChangePercent >= 0 ? "+" : ""}{stock.dayChangePercent}%
                                </div>
                            </td>
                            <td className="font-num strong">{formatValue(stock.current)}</td>
                            <td>
                            <div className={`pnl-cell ${stock.pnl >= 0 ? "pos" : "neg"}`}>
                                <div className="pnl-val">{formatCurrency(stock.pnl)}</div>
                                <div className="pnl-pct">{stock.pnlPercent}%</div>
                            </div>
                            </td>
                        </tr>
                        ))}
                        {holdings.length === 0 && (
                            <tr><td colSpan={6} style={{textAlign:'center', padding: 20}}>No holdings found</td></tr>
                        )}
                    </tbody>
                    </table>
                </div>
            </>
          )}

          {/* HISTORY TAB */}
          {activeTab === "HISTORY" && (
             <div className="card-container holdings-section">
                <div className="section-header-row">
                  <h2 className="section-title">Trade History</h2>
                </div>
                 <table className="holdings-table-enhanced">
                  <thead>
                    <tr>
                      <th style={{textAlign:'left'}}>Date</th>
                      <th style={{textAlign:'left'}}>Instrument</th>
                      <th style={{textAlign:'center'}}>Type</th>
                      <th style={{textAlign:'right'}}>Qty.</th>
                      <th style={{textAlign:'right'}}>Price</th>
                      <th style={{textAlign:'right'}}>Total</th>
                      <th style={{textAlign:'center'}}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order, i) => (
                      <tr key={i}>
                        <td className="font-num" style={{textAlign:'left', fontSize: 13}}>{formatDate(order.created_at)}</td>
                        <td style={{textAlign:'left'}}>
                           <div className="stock-symbol">{order.symbol}</div>
                           <div className="stock-name" style={{fontSize:11}}>{order.name}</div>
                        </td>
                        <td style={{textAlign:'center'}}>
                          <span style={{
                              padding: "4px 8px", 
                              borderRadius: 4, 
                              fontSize: 12, 
                              fontWeight: 600,
                              backgroundColor: order.side === "BUY" ? "#d1fae5" : "#fee2e2",
                              color: order.side === "BUY" ? "#047857" : "#b91c1c"
                          }}>
                            {order.side}
                          </span>
                        </td>
                        <td className="font-num" style={{textAlign:'right'}}>{order.quantity}</td>
                        <td className="font-num" style={{textAlign:'right'}}>₹{order.price}</td>
                        <td className="font-num" style={{textAlign:'right'}}>₹{((order.total_price) || (order.quantity * order.price)).toLocaleString("en-IN")}</td>
                        <td style={{textAlign:'center'}}>
                          <span style={{fontSize: 12, color: order.status === "EXECUTED" ? "#10b981" : "#f59e0b"}}>
                             {order.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {orders.length === 0 && (
                       <tr><td colSpan={7} style={{textAlign:'center', padding: 20}}>No history found</td></tr>
                    )}
                  </tbody>
                </table>
             </div>
          )}

        </div>

      </div>
    </div>
  );
};

export default Portfolio;
