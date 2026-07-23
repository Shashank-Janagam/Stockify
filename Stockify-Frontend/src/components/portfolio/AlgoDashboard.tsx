import { useEffect, useState, useCallback, useRef } from "react";
import "../../Styles/AlgoDashboard.css";

type AlgoConfig = {
  rsi_buy_threshold?: number;
  rsi_sell_threshold?: number;
  stop_loss_pct?: number;
  take_profit_pct?: number;
  trailing_stop_pct?: number;
  min_signal_score?: number;
  bias?: string;
  buy_fraction?: number;
  sell_fraction?: number;
  cooldown_sec?: number;
  pause_ai?: boolean;
  dynamic_rsi?: boolean;
  rsi_window?: number;
  rsi_sell_offset?: number;
};

type AlgoSummary = {
  totalTrades: number;
  buyCount: number;
  sellCount: number;
  totalVolume: number;
  lastActive: string | null;
  mode: "LIVE" | "SIMULATION";
};

type AlgoTransaction = {
  timestamp: string;
  symbol: string;
  action: "BUY" | "SELL";
  quantity: number;
  price: number;
  total_value: number;
  type: string;
  datetime_real?: string;
};

const HOST = import.meta.env.VITE_HOST_ADDRESS || "";

const fmtInr = (n: number | null | undefined, decimals = 2) =>
  n == null
    ? "—"
    : `₹${n.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}`;

export default function AlgoDashboard() {
  const [config, setConfig] = useState<AlgoConfig | null>(null);
  const [summary, setSummary] = useState<AlgoSummary | null>(null);
  const [transactions, setTransactions] = useState<AlgoTransaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterAction, setFilterAction] = useState<"ALL" | "BUY" | "SELL">("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const fetchStatus = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const res = await fetch(`${HOST}/api/algo/status`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setConfig(data.config || {});
          setSummary(data.summary || null);
          setTransactions(data.transactions || []);
        }
      }
    } catch (err) {
      console.error("Failed to fetch algo status:", err);
    } finally {
      setLoading(false);
      if (isManual) setTimeout(() => setIsRefreshing(false), 400);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Poll every 2 seconds for real-time live trading updates
    const interval = setInterval(() => fetchStatus(), 2000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const filteredTx = transactions.filter((tx) => {
    const matchesAction = filterAction === "ALL" || tx.action === filterAction;
    const matchesSearch =
      !searchQuery ||
      tx.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.timestamp.includes(searchQuery);
    return matchesAction && matchesSearch;
  });

  const activeSymbol = transactions[0]?.symbol || "HERITGFOOD";

  return (
    <div className="algo-dash-container">
      {/* ⚡ Top Live Status Banner */}
      <div className="algo-dash-banner">
        <div className="algo-banner-left">
          <div className="algo-live-badge">
            <span className="pulse-dot"></span>
            {summary?.mode || "LIVE"} ALGO TRADER ACTIVE
          </div>
          <div className="algo-ticker-title">
            Tracking Ticker: <span className="algo-ticker-name">{activeSymbol}</span>
          </div>
        </div>

        <div className="algo-banner-right">
          <div className="algo-bias-pill">
            Bias: <span className={`bias-val ${config?.bias?.toLowerCase() || "bullish"}`}>{config?.bias?.toUpperCase() || "BULLISH"}</span>
          </div>
          <button
            className={`algo-refresh-btn ${isRefreshing ? "spin" : ""}`}
            onClick={() => fetchStatus(true)}
            title="Refresh Live Data"
          >
            🔄 Sync Live Feed
          </button>
        </div>
      </div>

      {/* 📊 Key Metrics Summary Cards */}
      <div className="algo-stats-grid">
        <div className="algo-stat-card">
          <div className="algo-stat-label">Total Algo Orders</div>
          <div className="algo-stat-value">{summary?.totalTrades ?? 0}</div>
          <div className="algo-stat-sub">Executed by Streaming Engine</div>
        </div>

        <div className="algo-stat-card green-accent">
          <div className="algo-stat-label">Buy Orders</div>
          <div className="algo-stat-value buy">{summary?.buyCount ?? 0}</div>
          <div className="algo-stat-sub">Total Scalp Long Entries</div>
        </div>

        <div className="algo-stat-card red-accent">
          <div className="algo-stat-label">Sell Orders</div>
          <div className="algo-stat-value sell">{summary?.sellCount ?? 0}</div>
          <div className="algo-stat-sub">Take-Profits & Stop-Losses</div>
        </div>

        <div className="algo-stat-card blue-accent">
          <div className="algo-stat-label">Total Traded Volume</div>
          <div className="algo-stat-value">{fmtInr(summary?.totalVolume ?? 0)}</div>
          <div className="algo-stat-sub">
            Last Executed: {summary?.lastActive ? summary.lastActive : "Just Now"}
          </div>
        </div>
      </div>

      {/* ⚙️ Live Strategy Parameters Panel */}
      <div className="algo-config-section">
        <div className="section-header">
          <h3>⚡ Live Strategy Engine Parameters (`config.json`)</h3>
          <span className="config-auto-reload-badge">Dynamic Auto-Reload On-The-Fly</span>
        </div>

        <div className="config-params-grid">
          <div className="param-item">
            <span className="param-label">RSI Buy / Sell Band</span>
            <span className="param-val highlight">
              {config?.rsi_buy_threshold ?? 51} / {config?.rsi_sell_threshold ?? 55}
            </span>
          </div>

          <div className="param-item">
            <span className="param-label">Stop-Loss (Hard)</span>
            <span className="param-val red">
              {((config?.stop_loss_pct ?? 0.003) * 100).toFixed(2)}%
            </span>
          </div>

          <div className="param-item">
            <span className="param-label">Take-Profit Target</span>
            <span className="param-val green">
              {((config?.take_profit_pct ?? 0.012) * 100).toFixed(2)}%
            </span>
          </div>

          <div className="param-item">
            <span className="param-label">Trailing Stop</span>
            <span className="param-val amber">
              {((config?.trailing_stop_pct ?? 0.005) * 100).toFixed(2)}%
            </span>
          </div>

          <div className="param-item">
            <span className="param-label">Cooldown & Min Score</span>
            <span className="param-val">
              {config?.cooldown_sec ?? 0}s | Score &ge; {config?.min_signal_score ?? 2}
            </span>
          </div>

          <div className="param-item">
            <span className="param-label">Execution Fraction</span>
            <span className="param-val">
              Buy {((config?.buy_fraction ?? 1) * 100).toFixed(0)}% | Sell {((config?.sell_fraction ?? 1) * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* 📜 Live Streaming Transactions Log Table */}
      <div className="algo-tx-section">
        <div className="tx-table-header-row">
          <div className="tx-title-area">
            <h3>📈 Streaming Algo Live Executions</h3>
            <span className="tx-count-tag">{filteredTx.length} trades recorded</span>
          </div>

          <div className="tx-filter-controls">
            <input
              type="text"
              placeholder="Search symbol or signal..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="algo-search-input"
            />

            <div className="action-pill-group">
              <button
                className={`action-pill ${filterAction === "ALL" ? "active" : ""}`}
                onClick={() => setFilterAction("ALL")}
              >
                All
              </button>
              <button
                className={`action-pill buy ${filterAction === "BUY" ? "active" : ""}`}
                onClick={() => setFilterAction("BUY")}
              >
                BUY ({summary?.buyCount ?? 0})
              </button>
              <button
                className={`action-pill sell ${filterAction === "SELL" ? "active" : ""}`}
                onClick={() => setFilterAction("SELL")}
              >
                SELL ({summary?.sellCount ?? 0})
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="algo-loading-state">
            <div className="spinner"></div>
            <p>Connecting to Live Algo Data Feed...</p>
          </div>
        ) : filteredTx.length === 0 ? (
          <div className="algo-empty-state">
            <p>No streaming transactions match your criteria.</p>
          </div>
        ) : (
          <div className="tx-table-wrapper">
            <table className="algo-tx-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Symbol</th>
                  <th>Action</th>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>Total Value</th>
                  <th>Trigger Reason & Signal</th>
                </tr>
              </thead>
              <tbody>
                {filteredTx.map((tx, idx) => (
                  <tr key={idx} className={`tx-row ${tx.action.toLowerCase()}`}>
                    <td className="tx-time">
                      <span className="time-icon">🕒</span> {tx.timestamp}
                    </td>
                    <td className="tx-symbol">{tx.symbol}</td>
                    <td>
                      <span className={`tx-badge ${tx.action.toLowerCase()}`}>
                        {tx.action}
                      </span>
                    </td>
                    <td className="tx-qty">{tx.quantity.toLocaleString("en-IN")}</td>
                    <td className="tx-price">{fmtInr(tx.price, 2)}</td>
                    <td className="tx-total">{fmtInr(tx.total_value, 2)}</td>
                    <td className="tx-type">
                      <span className={`type-tag ${tx.action.toLowerCase()}`}>
                        {tx.type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
