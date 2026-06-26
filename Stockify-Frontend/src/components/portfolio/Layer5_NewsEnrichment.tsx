import React, { useState, useEffect } from "react";

// News server runs on port 5001 — endpoint: GET /api/news/stock/:symbol
const NEWS_HOST = "http://localhost:5001";

interface NewsItem {
  headline: string;
  summary?: string;
  sentiment?: string;
  announced_at?: string;
  date?: string;
  source?: string;
  company_name?: string;
  category?: string;
  symbol?: string;
}

interface Holding {
  symbol: string;
  name: string;
}

interface Props {
  holdings: Holding[];
  loading?: boolean;
}

// Normalise sentiment string from LLM (could be "POSITIVE", "positive", "Positive", etc.)
function normSentiment(s?: string): "POSITIVE" | "NEUTRAL" | "NEGATIVE" {
  if (!s) return "NEUTRAL";
  const upper = s.toUpperCase();
  if (upper.includes("POS")) return "POSITIVE";
  if (upper.includes("NEG")) return "NEGATIVE";
  return "NEUTRAL";
}

function sentClass(s: string) {
  return s === "POSITIVE" ? "pc-sent-pos" : s === "NEGATIVE" ? "pc-sent-neg" : "pc-sent-neu";
}
function sentIcon(s: string) {
  return s === "POSITIVE" ? "📈" : s === "NEGATIVE" ? "📉" : "➖";
}
function fmtDate(d?: string) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return d; }
}

const Layer5_NewsEnrichment: React.FC<Props> = ({ holdings, loading }) => {
  // Clean symbols (strip .NS / .BO)
  const symbols = holdings
    .map(h => h.symbol.replace(".NS", "").replace(".BO", ""))
    .filter(Boolean)
    .slice(0, 8);

  const [activeSymbol, setActiveSymbol] = useState<string>("");
  const [newsCache,    setNewsCache]    = useState<Record<string, NewsItem[]>>({});
  const [fetching,     setFetching]     = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // Init active symbol
  useEffect(() => {
    if (symbols.length > 0 && !activeSymbol) setActiveSymbol(symbols[0]);
  }, [symbols.length]);

  // Fetch news when active symbol changes
  useEffect(() => {
    if (!activeSymbol || newsCache[activeSymbol] !== undefined) return;

    setFetching(true);
    setError(null);

    // The news server expects the full NSE symbol e.g. "HDFCBANK.NS"
    const fullSym = activeSymbol.endsWith(".NS") ? activeSymbol : `${activeSymbol}.NS`;

    fetch(`${NEWS_HOST}/api/news/stock/${fullSym}`)
      .then(r => {
        if (!r.ok) throw new Error(`News server returned ${r.status}`);
        return r.json();
      })
      .then((data: { data: NewsItem[] }) => {
        const items = data?.data ?? [];
        setNewsCache(prev => ({ ...prev, [activeSymbol]: items }));
      })
      .catch(err => {
        console.error("News fetch error:", err);
        setError("Could not reach news server. Make sure it's running on port 5001.");
        setNewsCache(prev => ({ ...prev, [activeSymbol]: [] }));
      })
      .finally(() => setFetching(false));
  }, [activeSymbol]);

  const currentNews = newsCache[activeSymbol] ?? [];

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {[0,1,2,3].map(i => (
            <div key={i} className="pc-skeleton" style={{ width: 70, height: 30, borderRadius: 20 }} />
          ))}
        </div>
        {[0,1,2].map(i => (
          <div key={i} className="pc-skeleton" style={{ height: 90, borderRadius: 10 }} />
        ))}
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: "var(--pc-text-2)" }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
        <p style={{ fontWeight: 600 }}>No holdings found</p>
        <p style={{ fontSize: 12, marginTop: 4 }}>Add delivery positions to see BSE/NSE news here.</p>
      </div>
    );
  }

  return (
    <>
      {/* ── Symbol Tabs ── */}
      <div className="pc-news-symbol-tabs">
        {symbols.map(sym => (
          <button
            key={sym}
            className={`pc-news-sym-tab${activeSymbol === sym ? " active" : ""}`}
            onClick={() => setActiveSymbol(sym)}
          >{sym}</button>
        ))}
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div style={{
          padding: "12px 16px", borderRadius: 10, marginBottom: 16,
          background: "var(--pc-red-dim)", border: "1px solid rgba(240,68,68,0.2)",
          color: "var(--pc-red)", fontSize: 13,
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── News List ── */}
      {fetching ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[0,1,2].map(i => (
            <div key={i} className="pc-skeleton" style={{ height: 90, borderRadius: 10 }} />
          ))}
        </div>
      ) : currentNews.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--pc-text-2)" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📰</div>
          <p style={{ fontWeight: 600 }}>No recent BSE announcements for {activeSymbol}</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>
            The news pipeline fetches every 10 minutes. Check back shortly or ensure the news server is running.
          </p>
        </div>
      ) : (
        <div className="pc-news-list">
          {currentNews.slice(0, 5).map((item, i) => {
            const sentiment = normSentiment(item.sentiment);
            return (
              <div className="pc-news-item" key={i}>
                <div>
                  <div className="pc-news-headline">
                    {sentIcon(sentiment)} {item.headline || "(No headline)"}
                  </div>
                  {item.summary && (
                    <div className="pc-news-summary">{item.summary}</div>
                  )}
                  <div className="pc-news-meta">
                    <span className="pc-news-date">{fmtDate(item.announced_at || item.date)}</span>
                    {item.source && <span className="pc-news-source">{item.source}</span>}
                    {item.category && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: "1px 6px",
                        borderRadius: 4, background: "rgba(255,255,255,0.04)",
                        color: "var(--pc-text-2)", textTransform: "uppercase"
                      }}>{item.category}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <span className={`pc-sentiment ${sentClass(sentiment)}`}>{sentiment}</span>
                  <span style={{ fontSize: 9, color: "var(--pc-text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Groq AI
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{
        marginTop: 14, display: "flex", alignItems: "center", gap: 8,
        fontSize: 11, color: "var(--pc-text-3)",
        borderTop: "1px solid var(--pc-border)", paddingTop: 12,
      }}>
        ⚡ BSE/NSE ingestion pipeline · Groq Llama-3 sentiment · News server on :5001 · 10-min refresh
      </div>
    </>
  );
};

export default Layer5_NewsEnrichment;
