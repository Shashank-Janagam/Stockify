import { useState, useEffect } from "react";

interface SectorAlert {
  release_id: string;
  title: string;
  date: string;
  importance: "High" | "Medium" | "Low";
  source_url: string | null;
  one_liner: string;
  affected_sector: {
    sector: string;
    impact: "Positive" | "Negative" | "Neutral";
    one_liner: string;
    tickers: string[];
  } | null;
  stored_at: string;
}

interface StockSectorAlertsProps {
  symbol: string;
}

export default function StockSectorAlerts({ symbol }: StockSectorAlertsProps) {
  const [alerts, setAlerts] = useState<SectorAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const HOST = import.meta.env.VITE_HOST_ADDRESS || "";

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);

    fetch(`${HOST}/api/sectorAlerts/stock/${encodeURIComponent(symbol)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch alerts");
        return res.json();
      })
      .then((resData) => {
        if (resData.success) {
          setAlerts(resData.data || []);
        }
      })
      .catch((err) => {
        console.error("Error fetching stock sector alerts:", err);
      })
      .finally(() => setLoading(false));
  }, [symbol, HOST]);

  if (loading || alerts.length === 0) return null;

  return (
    <div className="stock-sector-alerts-container">
      <h3 className="sector-alerts-title">
        <span>⚠️</span> Sector Impact Insights
      </h3>
      
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {alerts.map((alert, index) => {
          const isPositive = alert.affected_sector?.impact === "Positive";
          const impactClass = isPositive ? "positive" : "negative";
          
          return (
            <div
              key={alert.release_id}
              className={`sector-alert-card ${impactClass}`}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="sector-alert-header">
                <div>
                  <span className={`sector-badge ${impactClass}`}>
                    {alert.affected_sector?.sector} • {alert.affected_sector?.impact}
                  </span>
                  <span className="sector-importance">
                    {alert.importance} Importance
                  </span>
                </div>
                <span className="sector-date">
                  {new Date(alert.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>

              <h4 className="sector-alert-title">
                {alert.title}
              </h4>
              
              <div className="sector-alert-detail">
                <strong>Impact Detail:</strong> {alert.affected_sector?.one_liner}
              </div>

              <div className="sector-alert-footer">
                <span><strong>Release Summary:</strong> {alert.one_liner}</span>
                {alert.source_url && (
                  <a
                    href={alert.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`sector-source-link ${impactClass}`}
                  >
                    Source PDF
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: "12px", height: "12px", marginLeft: "4px" }}>
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
