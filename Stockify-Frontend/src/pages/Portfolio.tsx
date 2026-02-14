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



type Summary = {
  currentInvested: number;
  currentValue: number;
  currentReturnsPercent: number;
  totalInvested: number;
  totalValue: number;
  totalReturnsPercent: number;
  realizedPnL?: number;
  monthlyRealizedPnL?: number;
};



const Portfolio = () => {
  const { user } = useContext(AuthContext);
  const [token, setToken] = useState<string | null>(null);
  
  // Data States
  const [summary, setSummary] = useState<Summary | null>(null);
  const [chartData, setChartData] = useState<{ date: string; value: number }[]>([]);
  
  // UI States
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("1M");

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
     2. FETCH DATA (SUMMARY & CHART)
  ========================= */
  useEffect(() => {
    if (!token) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        // 1. Fetch Portfolio Summary
        const result = await fetch(`${HOST}/api/portfolio/summary`, {
          credentials: "include"
        });
        const data = await result.json();
        
        if (data.summary) {
             setSummary(data.summary);
        }
        if (data.chartData) {
            setChartData(data.chartData);
        }

        console.log("Portfolio data:", data);

      } catch (err) {
        console.error("Portfolio fetch error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [token, HOST]);

  const getFilteredData = () => {
      const d = new Date(); 
      let cutoff = new Date(0); // ALL

      switch(timeRange) {
          case "1W": cutoff = new Date(d.setDate(d.getDate() - 7)); break;
          case "1M": cutoff = new Date(d.setMonth(d.getMonth() - 1)); break;
          case "6M": cutoff = new Date(d.setMonth(d.getMonth() - 6)); break;
          case "1Y": cutoff = new Date(d.setFullYear(d.getFullYear() - 1)); break;
      }
      
      const filtered = chartData.filter(item => new Date(item.date) >= cutoff);
      return filtered.length > 0 ? filtered : chartData.slice(-1); 
  };
  
  const filteredPD = getFilteredData();

  // Chart Data: Real Data
  const performanceData = {
    labels: filteredPD.map(d => new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })),
    datasets: [
      {
        label: "Realized PnL",
        data: filteredPD.map(d => d.value),
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
            const val = context.parsed.y;
            return ` PnL: ${val >= 0 ? '+' : ''}₹${val.toLocaleString()}`;
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

 
   const formatValue = (val: number) => {
    return `₹${val.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
  };


  if (loading && !summary) {
      return <div className="portfolio-page fade-in" style={{padding: 40, textAlign:'center'}}>Loading Portfolio...</div>;
  }

  return (
    <div className="portfolio-page fade-in">
      <header className="portfolio-header">
        <div className="header-left">
           <h1>My Portfolio</h1>
           <p className="subtitle">Track your performance</p>
        </div>
      </header>
      
      <section className="portfolio-summary-grid">
         {/* 1. Current Invested */}
        <div className="summary-card">
          <div className="card-info">
             <h3>Current Invested</h3>
             <div className="card-value">{formatValue(summary?.currentInvested || 0)}</div>
          </div>
        </div>

        {/* 2. Current Value */}
        <div className="summary-card main-card"> 
          <div className="card-info">
             <h3>Current Value</h3>
             <div className="card-value-large">{formatValue(summary?.currentValue || 0)}</div>
             <div className={`trend-indicator ${(summary?.currentReturnsPercent || 0) >= 0 ? "positive" : "negative"}`}>
                <i className={`fas fa-arrow-${(summary?.currentReturnsPercent || 0) >= 0 ? "up" : "down"}`}></i>
                {Math.abs(summary?.currentReturnsPercent || 0)}% Return
             </div>
          </div>
        </div>

         {/* 3. Total Invested */}
        <div className="summary-card">
          <div className="card-info">
             <h3>Total Invested</h3>
             <div className="card-value">{formatValue(summary?.totalInvested || 0)}</div>
          </div>
        </div>

         {/* 4. Total Value */}
        <div className="summary-card">
          <div className="card-info">
             <h3>Total Value</h3>
             <div className="card-value">{formatValue(summary?.totalValue || 0)}</div>
             <div className={`trend-indicator ${(summary?.totalReturnsPercent || 0) >= 0 ? "positive" : "negative"}`}>
                <i className={`fas fa-arrow-${(summary?.totalReturnsPercent || 0) >= 0 ? "up" : "down"}`}></i>
                {Math.abs(summary?.totalReturnsPercent || 0)}% Return
             </div>
          </div>
        </div>
      </section>

      <div className="portfolio-content-layout">
        <div className="portfolio-main">
             <div className="card-container chart-section">
                <div className="section-header-row">
                <h2 className="section-title">Realized Performance</h2>
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
        </div>
      </div>
    </div>
  );
};

export default Portfolio;
