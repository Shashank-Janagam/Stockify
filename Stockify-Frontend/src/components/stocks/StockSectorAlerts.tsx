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
    <div className="stock-sector-alerts-container" style={{ margin: "24px 0" }}>
      <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#1f2937", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span>⚠️</span> Sector Impact Insights
      </h3>
      
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {alerts.map((alert) => {
          const isPositive = alert.affected_sector?.impact === "Positive";
          const borderClr = isPositive ? "#10b981" : "#ef4444";
          const bgClr = isPositive ? "#ecfdf5" : "#fef2f2";
          
          return (
            <div
              key={alert.release_id}
              style={{
                borderLeft: `4px solid ${borderClr}`,
                backgroundColor: bgClr,
                padding: "16px",
                borderRadius: "8px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.02)"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                <div>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      color: isPositive ? "#047857" : "#b91c1c",
                      backgroundColor: isPositive ? "#d1fae5" : "#fee2e2",
                      padding: "2px 8px",
                      borderRadius: "4px"
                    }}
                  >
                    {alert.affected_sector?.sector} • {alert.affected_sector?.impact}
                  </span>
                  <span style={{ fontSize: "11px", color: "#6b7280", marginLeft: "12px" }}>
                    {alert.importance} Importance
                  </span>
                </div>
                <span style={{ fontSize: "11px", color: "#6b7280" }}>
                  {new Date(alert.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>

              <h4 style={{ fontSize: "14px", fontWeight: 600, color: "#1f2937", margin: "4px 0 8px 0" }}>
                {alert.title}
              </h4>
              
              <div style={{ fontSize: "13px", color: "#374151", lineHeight: "1.5" }}>
                <strong>Impact Detail:</strong> {alert.affected_sector?.one_liner}
              </div>

              <div style={{ fontSize: "12px", color: "#4b5563", marginTop: "10px", paddingTop: "10px", borderTop: "1px solid rgba(0,0,0,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span><strong>Release Summary:</strong> {alert.one_liner}</span>
                {alert.source_url && (
                  <a
                    href={alert.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      color: isPositive ? "#047857" : "#b91c1c",
                      textDecoration: "none",
                      fontWeight: 600,
                      flexShrink: 0,
                      marginLeft: "16px"
                    }}
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
