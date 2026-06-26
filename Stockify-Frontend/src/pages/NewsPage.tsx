import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import "../Styles/NewsPage.css";

/* ── Types ── */
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
  scrip_code?: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

interface Digest {
  generated_at: string;
  total_announcements: number;
  summary: string;
  top_movers: {
    symbol: string;
    company_name: string;
    announcement_count: number;
    dominant_sentiment: string;
    top_headline: string;
  }[];
  category_breakdown: Record<string, number>;
}

/* ── Constants ── */
const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "result", label: "Result" },
  { key: "dividend", label: "Dividend" },
  { key: "board_meeting", label: "Board Meeting" },
  { key: "buyback", label: "Buyback" },
  { key: "agm", label: "AGM" },
  { key: "corporate_action", label: "Corporate Action" },
  { key: "other", label: "Other" },
];

const SENTIMENTS = [
  { key: "all", label: "All" },
  { key: "bullish", label: "▲ Bullish" },
  { key: "bearish", label: "▼ Bearish" },
  { key: "neutral", label: "— Neutral" },
];

const CATEGORY_LABELS: Record<string, string> = {
  result: "Result",
  dividend: "Dividend",
  board_meeting: "Board Meeting",
  buyback: "Buyback",
  agm: "AGM",
  corporate_action: "Corp. Action",
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
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function slugify(n: string) {
  return n.toLowerCase().trim().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/* ── Skeleton Loaders ── */
function DigestSkeleton() {
  return (
    <div className="digest-card" style={{ minHeight: 200 }}>
      <div className="digest-header">
        <div className="digest-icon">🤖</div>
        <div>
          <div className="news-sk" style={{ width: 160, height: 18, borderRadius: 8, background: "rgba(255,255,255,0.08)" }} />
          <div className="news-sk" style={{ width: 100, height: 12, borderRadius: 6, marginTop: 6, background: "rgba(255,255,255,0.05)" }} />
        </div>
      </div>
      <div className="news-sk" style={{ width: "90%", height: 14, borderRadius: 6, marginBottom: 8, background: "rgba(255,255,255,0.06)" }} />
      <div className="news-sk" style={{ width: "75%", height: 14, borderRadius: 6, marginBottom: 8, background: "rgba(255,255,255,0.06)" }} />
      <div className="news-sk" style={{ width: "60%", height: 14, borderRadius: 6, background: "rgba(255,255,255,0.06)" }} />
    </div>
  );
}

function NewsSkeleton() {
  return (
    <div className="news-card-list">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="news-skeleton-card">
          <div className="news-sk-chips">
            <div className="news-sk news-sk-chip" />
            <div className="news-sk news-sk-chip" style={{ width: 55 }} />
          </div>
          <div className="news-sk news-sk-headline" />
          <div className="news-sk news-sk-summary" />
          <div className="news-sk news-sk-summary-short" />
          <div className="news-sk news-sk-footer" />
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════
   MAIN NEWS PAGE
══════════════════════════════════════════ */
export default function NewsPage() {
  const HOST = import.meta.env.VITE_HOST_ADDRESS || "";
  const PYTHON_HOST = import.meta.env.VITE_PYTHON_API_URL || "http://localhost:5001";

  // State
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [digest, setDigest] = useState<Digest | null>(null);
  const [digestLoading, setDigestLoading] = useState(true);

  // Debounce search input to avoid spamming the backend API
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1); // Reset page to 1 on new search
    }, 400);

    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch news
  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "15",
      });
      if (categoryFilter !== "all") params.set("category", categoryFilter);
      if (sentimentFilter !== "all") params.set("sentiment", sentimentFilter);
      if (debouncedSearch.trim() !== "") params.set("search", debouncedSearch.trim());

      const res = await fetch(`${PYTHON_HOST}/api/news?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAnnouncements(data.data || []);
      setPagination(data.pagination || null);
    } catch (err) {
      console.error("News fetch error:", err);
      setAnnouncements([]);
    } finally {
      setLoading(false);
    }
  }, [HOST, page, categoryFilter, sentimentFilter, debouncedSearch]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  // Fetch digest
  useEffect(() => {
    setDigestLoading(true);
    fetch(`${PYTHON_HOST}/api/news/digest`)
      .then((res) => res.json())
      .then((data) => setDigest(data))
      .catch((err) => console.error("Digest fetch error:", err))
      .finally(() => setDigestLoading(false));
  }, [HOST]);

  // Filter change resets page
  const handleCategoryChange = (cat: string) => {
    setCategoryFilter(cat);
    setPage(1);
  };

  const handleSentimentChange = (sent: string) => {
    setSentimentFilter(sent);
    setPage(1);
  };

  return (
    <div className="news-page">
      {/* ── Page Header ── */}
      <div className="news-page-header reveal reveal-d1">
        <h1 className="news-page-title">Market News & Announcements</h1>
        <p className="news-page-subtitle">
          <span className="live-indicator" />
          BSE corporate filings · AI enriched · Updated every 10 minutes
        </p>
      </div>

      {/* ══════════════════════════════════════════
          AI DAILY DIGEST
      ══════════════════════════════════════════ */}
      {digestLoading ? (
        <DigestSkeleton />
      ) : digest && digest.total_announcements > 0 ? (
        <div className="digest-card reveal reveal-d1">
          <div className="digest-header">
            <div className="digest-icon">🤖</div>
            <div>
              <div className="digest-title">AI Daily Digest</div>
              <div className="digest-subtitle">
                Generated{" "}
                {digest.generated_at
                  ? formatFullDate(digest.generated_at)
                  : "today"}
              </div>
            </div>
          </div>

          <div className="digest-body">
            <p className="digest-summary">{digest.summary}</p>

            {digest.top_movers.length > 0 && (
              <div className="digest-movers">
                {digest.top_movers.map((mover, i) => (
                  <div key={i} className="digest-mover-chip">
                    <span>{mover.company_name?.split(" ")[0] || mover.symbol?.replace(".NS", "")}</span>
                    <span className={`mover-sentiment ${mover.dominant_sentiment}`}>
                      {mover.dominant_sentiment === "bullish"
                        ? "▲"
                        : mover.dominant_sentiment === "bearish"
                        ? "▼"
                        : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="digest-stats">
              <div className="digest-stat">
                <span className="digest-stat-label">Announcements</span>
                <span className="digest-stat-value">
                  {digest.total_announcements}
                </span>
              </div>
              {Object.entries(digest.category_breakdown || {})
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .slice(0, 3)
                .map(([cat, count]) => (
                  <div key={cat} className="digest-stat">
                    <span className="digest-stat-label">
                      {CATEGORY_LABELS[cat] || cat}
                    </span>
                    <span className="digest-stat-value">{count as number}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Search Bar ── */}
      <div className="news-search-container reveal reveal-d1">
        <div className="news-search-box">
          <svg
            className="search-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search news by company name or symbol..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="clear-search-btn"
              onClick={() => setSearchQuery("")}
              title="Clear search"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          FILTER BAR
      ══════════════════════════════════════════ */}
      <div className="news-filter-bar reveal reveal-d2">
        <div className="news-filter-group">
          <span className="news-filter-label">Category</span>
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              className={`filter-chip ${categoryFilter === c.key ? "active" : ""}`}
              onClick={() => handleCategoryChange(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="filter-divider" />

        <div className="news-filter-group">
          <span className="news-filter-label">Sentiment</span>
          {SENTIMENTS.map((s) => (
            <button
              key={s.key}
              className={`filter-chip ${sentimentFilter === s.key ? "active" : ""}`}
              onClick={() => handleSentimentChange(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          NEWS CARDS
      ══════════════════════════════════════════ */}
      {loading ? (
        <NewsSkeleton />
      ) : announcements.length === 0 ? (
        <div className="news-empty">
          <span className="news-empty-icon">📰</span>
          <div className="news-empty-title">No announcements found</div>
          <div className="news-empty-sub">
            {categoryFilter !== "all" || sentimentFilter !== "all" || searchQuery.trim() !== ""
              ? "Try adjusting your filters or search query"
              : "The scheduler will poll BSE for new announcements soon"}
          </div>
        </div>
      ) : (
        <div className="news-card-list reveal reveal-d3">
          {announcements.map((ann) => (
            <div key={ann._id || ann.bse_id} className="news-card" id={`news-card-${ann.bse_id}`}>
              <div className="news-card-top">
                <span className={`category-badge ${ann.category}`}>
                  {CATEGORY_LABELS[ann.category] || ann.category}
                </span>
                <span className={`sentiment-chip ${ann.sentiment}`}>
                  {ann.sentiment.charAt(0).toUpperCase() +
                    ann.sentiment.slice(1)}
                </span>
                <div className="news-card-company">
                  <span className="company-symbol">
                    {ann.symbol?.replace(".NS", "") || ann.scrip_code}
                  </span>
                  <span>{ann.company_name?.split(" ").slice(0, 3).join(" ")}</span>
                </div>
              </div>

              <div className="news-card-headline">{ann.headline}</div>

              {ann.summary && ann.summary !== ann.headline && (
                <div className="news-card-summary">{ann.summary}</div>
              )}

              <div className="news-card-footer">
                <span className="card-date">
                  {formatDate(ann.announced_at)}
                </span>

                {ann.pdf_url && (
                  <>
                    <span>·</span>
                    <a
                      href={ann.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="card-action"
                    >
                      View PDF
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  </>
                )}

                {ann.symbol && (
                  <>
                    <span>·</span>
                    <Link
                      to={`/stocks/${ann.symbol.toUpperCase().trim()}/${slugify(ann.company_name || ann.symbol)}`}
                      className="card-action view-stock-action"
                    >
                      View Stock
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="7" y1="17" x2="17" y2="7" />
                        <polyline points="7 7 17 7 17 17" />
                      </svg>
                    </Link>
                  </>
                )}

                <span>·</span>
                <span className="card-date">{ann.company_name}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════════════════════════════════
          PAGINATION
      ══════════════════════════════════════════ */}
      {pagination && pagination.totalPages > 1 && (
        <div className="news-pagination">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Previous
          </button>
          <span className="page-info">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            disabled={!pagination.hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
