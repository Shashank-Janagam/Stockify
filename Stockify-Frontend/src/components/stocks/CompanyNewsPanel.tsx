import { useState, useEffect } from "react";
import "../../Styles/NewsPage.css";

interface Announcement {
  _id: string;
  bse_id: string;
  symbol: string;
  company_name: string;
  headline: string;
  category: string;
  sentiment: string;
  summary: string;
  pdf_url: string | null;
  announced_at: string;
}

interface CompanyNewsPanelProps {
  symbol: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  result: "Result",
  dividend: "Dividend",
  board_meeting: "Board Meeting",
  buyback: "Buyback",
  agm: "AGM",
  corporate_action: "Corporate Action",
  other: "Update",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/* ── Skeleton ── */
function PanelSkeleton() {
  return (
    <div className="company-news-panel">
      <div className="panel-header">
        <div className="panel-title">📰 News & Announcements</div>
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="company-news-sk-item">
          <div className="news-sk-chips">
            <div className="news-sk news-sk-chip" />
            <div className="news-sk news-sk-chip" style={{ width: 55 }} />
          </div>
          <div className="news-sk news-sk-headline" />
          <div className="news-sk news-sk-summary" />
          <div className="news-sk news-sk-footer" />
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════
   COMPANY NEWS PANEL
   Embedded in stock detail page
══════════════════════════════════════════ */
export default function CompanyNewsPanel({ symbol }: CompanyNewsPanelProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const HOST = import.meta.env.VITE_HOST_ADDRESS || "";
  const PYTHON_HOST = import.meta.env.VITE_PYTHON_API_URL || "http://localhost:5001";

  useEffect(() => {
    if (!symbol) return;

    setLoading(true);
    setError(null);

    fetch(`${PYTHON_HOST}/api/news/stock/${encodeURIComponent(symbol)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setAnnouncements(data.data || []);
      })
      .catch((err) => {
        console.error("CompanyNewsPanel fetch error:", err);
        setError("Could not load news");
      })
      .finally(() => setLoading(false));
  }, [symbol, HOST]);

  if (loading) return <PanelSkeleton />;
  if (error) return null; // Silent fail on stock page
  if (announcements.length === 0) return null; // Don't show section if no news

  return (
    <div className="company-news-panel" id="company-news-panel">
      <div className="panel-header">
        <h3 className="panel-title">
          <span>📰</span> News & Announcements
        </h3>
        <span className="panel-count">{announcements.length} recent</span>
      </div>

      {announcements.map((ann) => (
        <div key={ann._id || ann.bse_id} className="company-news-mini-card">
          <div className="mini-top">
            <span className={`category-badge ${ann.category}`}>
              {CATEGORY_LABELS[ann.category] || ann.category}
            </span>
            <span className={`sentiment-chip ${ann.sentiment}`}>
              {ann.sentiment.charAt(0).toUpperCase() + ann.sentiment.slice(1)}
            </span>
          </div>

          <div className="mini-headline">{ann.headline}</div>

          {ann.summary && ann.summary !== ann.headline && (
            <div className="mini-summary">{ann.summary}</div>
          )}

          <div className="mini-footer">
            <span>{formatDate(ann.announced_at)}</span>
            {ann.pdf_url && (
              <>
                <span>·</span>
                <a
                  href={ann.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card-action"
                  onClick={(e) => e.stopPropagation()}
                >
                  View PDF
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
