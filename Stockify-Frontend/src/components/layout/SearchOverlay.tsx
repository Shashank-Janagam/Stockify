import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../Styles/SearchOverlay.css";
import { useContext } from "react";
import { AuthContext } from "../../auth/AuthProvider";

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

interface StockResult {
  name: string;
  symbol: string;
  exchange?: string;
  category?: string;
  instrument_key?: string;
  popularity?: number;
  matchType?: string;
}

type Stock = {
  symbol: string;
  name: string;
};

const categories = ["All", "Stocks", "ETF", "MTF", "Mutual Funds", "Indices", "F&O"];

const FAMOUS_PRESETS: Record<string, StockResult[]> = {
  All: [
    { symbol: "^NSEI", name: "NIFTY 50", category: "Indices" },
    { symbol: "^BSESN", name: "SENSEX", category: "Indices" },
    { symbol: "RELIANCE", name: "Reliance Industries Ltd", category: "Stocks" },
    { symbol: "TCS", name: "Tata Consultancy Services Ltd", category: "Stocks" },
    { symbol: "HDFCBANK", name: "HDFC Bank Ltd", category: "Stocks" },
    { symbol: "NIFTYBEES", name: "Nippon India ETF Nifty 50 BeES", category: "ETF" },
    { symbol: "GOLDBEES", name: "Nippon India ETF Gold BeES", category: "ETF" },
    { symbol: "TATAMOTORS", name: "Tata Motors Passenger Vehicles Ltd", category: "Stocks" },
  ],
  Stocks: [
    { symbol: "RELIANCE", name: "Reliance Industries Ltd", category: "Stocks" },
    { symbol: "TCS", name: "Tata Consultancy Services Ltd", category: "Stocks" },
    { symbol: "HDFCBANK", name: "HDFC Bank Ltd", category: "Stocks" },
    { symbol: "INFY", name: "Infosys Ltd", category: "Stocks" },
    { symbol: "ICICIBANK", name: "ICICI Bank Ltd", category: "Stocks" },
    { symbol: "TATAMOTORS", name: "Tata Motors Passenger Vehicles Ltd", category: "Stocks" },
    { symbol: "ITC", name: "ITC Ltd", category: "Stocks" },
    { symbol: "SBIN", name: "State Bank of India", category: "Stocks" },
    { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd", category: "Stocks" },
    { symbol: "MARUTI", name: "Maruti Suzuki India Ltd", category: "Stocks" },
    { symbol: "TITAN", name: "Titan Company Ltd", category: "Stocks" },
    { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd", category: "Stocks" },
  ],
  ETF: [
    { symbol: "NIFTYBEES", name: "Nippon India ETF Nifty 50 BeES", category: "ETF" },
    { symbol: "BANKBEES", name: "Nippon India ETF Bank BeES", category: "ETF" },
    { symbol: "GOLDBEES", name: "Nippon India ETF Gold BeES", category: "ETF" },
    { symbol: "SILVERBEES", name: "Nippon India ETF Silver BeES", category: "ETF" },
    { symbol: "ITBEES", name: "Nippon India ETF Nifty IT", category: "ETF" },
    { symbol: "JUNIORBEES", name: "Nippon India ETF Nifty Next 50", category: "ETF" },
    { symbol: "CPSEETF", name: "CPSE ETF Index Fund", category: "ETF" },
    { symbol: "AUTOBEES", name: "Nippon India ETF Nifty Auto", category: "ETF" },
    { symbol: "MON100", name: "Motilal Oswal Nasdaq 100 ETF", category: "ETF" },
    { symbol: "LIQUIDBEES", name: "Nippon India ETF Liquid BeES", category: "ETF" },
  ],
  MTF: [
    { symbol: "RELIANCE", name: "Reliance Industries Ltd (4x Margin)", category: "MTF" },
    { symbol: "TATAMOTORS", name: "Tata Motors Ltd (4x Margin)", category: "MTF" },
    { symbol: "HDFCBANK", name: "HDFC Bank Ltd (4x Margin)", category: "MTF" },
    { symbol: "ICICIBANK", name: "ICICI Bank Ltd (4x Margin)", category: "MTF" },
    { symbol: "INFY", name: "Infosys Ltd (4x Margin)", category: "MTF" },
    { symbol: "SBIN", name: "State Bank of India (4x Margin)", category: "MTF" },
    { symbol: "ADANIENT", name: "Adani Enterprises Ltd (3.5x Margin)", category: "MTF" },
    { symbol: "JSWSTEEL", name: "JSW Steel Ltd (4x Margin)", category: "MTF" },
    { symbol: "TATASTEEL", name: "Tata Steel Ltd (4x Margin)", category: "MTF" },
    { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd (4x Margin)", category: "MTF" },
  ],
  "Mutual Funds": [
    { symbol: "NIFTYBEES", name: "Nippon India Mutual Fund - Nifty 50 Scheme", category: "Mutual Funds" },
    { symbol: "SETFNIF50", name: "SBI Mutual Fund - Nifty 50 Scheme", category: "Mutual Funds" },
    { symbol: "BANKBEES", name: "Nippon India Mutual Fund - Bank Scheme", category: "Mutual Funds" },
    { symbol: "SMALLIETF", name: "ICICI Prudential Mutual Fund - Smallcap Scheme", category: "Mutual Funds" },
    { symbol: "NIFTYAXIS", name: "Axis Mutual Fund - Nifty Scheme", category: "Mutual Funds" },
    { symbol: "GOLDBEES", name: "Nippon India Mutual Fund - Gold Scheme", category: "Mutual Funds" },
    { symbol: "PHARMABEES", name: "Nippon India Mutual Fund - Pharma Healthcare Scheme", category: "Mutual Funds" },
    { symbol: "GOLDAXIS", name: "Axis Mutual Fund - Gold Scheme", category: "Mutual Funds" },
    { symbol: "BANKNIFTY1", name: "Kotak Mahindra Mutual Fund - Banking Scheme", category: "Mutual Funds" },
    { symbol: "CPSEETF", name: "CPSE Central Public Sector Index Scheme", category: "Mutual Funds" },
  ],
  Indices: [
    { symbol: "^NSEI", name: "NIFTY 50 Index (NSE Benchmark)", category: "Indices" },
    { symbol: "^BSESN", name: "SENSEX Index (BSE 30 Benchmark)", category: "Indices" },
    { symbol: "^NSEBANK", name: "NIFTY BANK Index", category: "Indices" },
    { symbol: "^CNXIT", name: "NIFTY IT Sector Index", category: "Indices" },
    { symbol: "^CNXFIN", name: "NIFTY Financial Services Index", category: "Indices" },
    { symbol: "^CRSMID", name: "NIFTY Midcap 100 Index", category: "Indices" },
  ],
  "F&O": [
    { symbol: "NIFTY", name: "NIFTY Futures & Options (Weekly/Monthly)", category: "F&O" },
    { symbol: "BANKNIFTY", name: "BANKNIFTY Futures & Options", category: "F&O" },
    { symbol: "FINNIFTY", name: "FINNIFTY Futures & Options", category: "F&O" },
    { symbol: "RELIANCE", name: "RELIANCE F&O Active Contracts", category: "F&O" },
    { symbol: "HDFCBANK", name: "HDFCBANK F&O Active Contracts", category: "F&O" },
    { symbol: "TATAMOTORS", name: "TATAMOTORS F&O Active Contracts", category: "F&O" },
  ],
};

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getStockRoute(symbol: string, name: string) {
  const symbol1 = symbol.trim().toUpperCase();
  const slug = slugify(name);

  // If already formatted or index
  if (symbol1.endsWith(".NS") || symbol1.endsWith(".BO") || symbol1.startsWith("^")) {
    return `/stocks/${symbol1}/${slug}`;
  }

  // Default all Indian NSE stocks to .NS route
  return `/stocks/${symbol1}.NS/${slug}`;
}

import StockLogo from "../common/StockLogo";

interface RecentStock {
  symbol: string;
  name: string;
}

/**
 * Highlights matching query text within a string
 */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query || query.trim().length === 0) return <span>{text}</span>;
  
  const cleanQ = query.trim().toLowerCase();
  const lowerText = text.toLowerCase();
  const idx = lowerText.indexOf(cleanQ);

  if (idx === -1) {
    return <span>{text}</span>;
  }

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + cleanQ.length);
  const after = text.slice(idx + cleanQ.length);

  return (
    <span>
      {before}
      <span className="search-highlight">{match}</span>
      {after}
    </span>
  );
}

const SearchOverlay = ({ isOpen, onClose }: SearchOverlayProps) => {
  const navigate = useNavigate();
  const [recent, setRecent] = useState<RecentStock[]>([]);
  const HOST = import.meta.env.VITE_HOST_ADDRESS || "";

  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [results, setResults] = useState<StockResult[]>([]);
  const [didYouMean, setDidYouMean] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const { user } = useContext(AuthContext);

  useEffect(() => {
    if (!user || typeof user.getIdToken !== "function") {
      return;
    }

    let isMounted = true;

    const fetchToken = async () => {
      try {
        const jwt = await user.getIdToken(true); // force refresh
        if (isMounted) {
          setToken(jwt);
        }
      } catch (err) {
        console.error("Failed to fetch token", err);
      }
    };

    fetchToken();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const updateSearch = (stock: Stock) => {
    // ✅ 1. increase popularity
    fetch(`${HOST}/api/searchUpdates/hit`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ symbol: stock.symbol, name: stock.name }),
    }).catch(() => {}); // ignore failure safely

    // ✅ 2. navigate
    navigate(getStockRoute(stock.symbol, stock.name));
    handleClose();
  };

  useEffect(() => {
    if (!token) return;

    const fetchRecent = async () => {
      try {
        const res = await fetch(`${HOST}/api/searchUpdates/recent`, {
          credentials: "include",
        });

        const data = await res.json();
        setRecent(data || []);
      } catch (err) {
        console.error("Failed to fetch recent stocks", err);
      }
    };

    fetchRecent();
  }, [token]);

  /* ---------------- OPEN / RESET ---------------- */
  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      setQuery("");
      setResults([]);
      setDidYouMean(null);
      setActiveIndex(0);
      setLoading(false);
    }
  }, [isOpen]);

  /* ---------------- ESC CLOSE ---------------- */
  useEffect(() => {
    if (!isOpen) return;

    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };

    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [isOpen]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 250);
  };

  /* ---------------- BACKEND SEARCH ---------------- */
  useEffect(() => {
    const cleanQ = query.trim();
    if (!cleanQ || cleanQ.length < 1) {
      setResults([]);
      setDidYouMean(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const categoryParam = selectedCategory !== "All" ? `&category=${encodeURIComponent(selectedCategory)}` : "";
        const res = await fetch(
          `${HOST}/api/search/search?q=${encodeURIComponent(cleanQ)}${categoryParam}`,
          { signal: controller.signal }
        );
        const data = await res.json();

        // Handle both object response { results, didYouMean } and fallback array
        if (data && Array.isArray(data.results)) {
          setResults(data.results);
          setDidYouMean(data.didYouMean || null);
        } else if (Array.isArray(data)) {
          setResults(data);
          setDidYouMean(null);
        } else {
          setResults([]);
          setDidYouMean(null);
        }
        setActiveIndex(0);
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("Search error:", err);
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 150); // fast 150ms debounce

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, selectedCategory]);

  /* ---------------- KEYBOARD NAV ---------------- */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (results[activeIndex]) {
        updateSearch(results[activeIndex]);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`search-overlay ${visible ? "open" : ""}`}
      onClick={handleClose}
    >
      <div
        className={`search-modal ${visible ? "open" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* SEARCH INPUT */}
        <div className="search-input-wrapper">
          <div className="search-icon-left">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </div>
          <input
            autoFocus
            placeholder="Search 2,500+ stocks, ETFs, mutual funds (e.g. RELIANCE, TCS, MARUTI)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {query && (
            <button
              className="search-clear-btn"
              onClick={() => {
                setQuery("");
                setResults([]);
                setDidYouMean(null);
                setLoading(false);
              }}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* CATEGORIES */}
        <div className="search-categories">
          {categories.map((c) => (
            <button
              key={c}
              className={`category-chip ${selectedCategory === c ? "active" : ""}`}
              onClick={() => {
                setSelectedCategory(c);
                setActiveIndex(0);
              }}
            >
              {c}
            </button>
          ))}
        </div>

        {/* TYPO CORRECTION NOTIFICATION */}
        {didYouMean && (
          <div className="did-you-mean-banner">
            <span className="did-you-mean-icon">✨</span>
            <span>
              Showing best fuzzy matches for{" "}
              <strong className="did-you-mean-query">{didYouMean}</strong> (auto-corrected from &ldquo;{query}&rdquo;)
            </span>
          </div>
        )}

        {/* LOADING */}
        {loading && query.trim().length > 0 && (
          <div className="search-section search-loading-state">
            <div className="search-spinner"></div>
            <p className="section-title">Searching stocks...</p>
          </div>
        )}

        {/* RESULTS */}
        {query && results.length > 0 && !loading && (
          <div className="search-section">
            <ul className="result-list">
              {results.map((stock, i) => (
                <li
                  key={stock.symbol + i}
                  className={`result-item ${i === activeIndex ? "active" : ""}`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => updateSearch(stock)}
                >
                  <div className="stock-icon-wrapper">
                    <StockLogo symbol={stock.symbol} name={stock.name} />
                  </div>
                  
                  <div className="stock-info-main">
                    <div className="stock-name-row">
                      <span className="stock-name">
                        <HighlightMatch text={stock.name} query={query} />
                      </span>
                      {stock.category && (
                        <span className={`stock-tag-pill tag-${stock.category.toLowerCase().replace(/[^a-z]/g, "")}`}>
                          {stock.category}
                        </span>
                      )}
                    </div>
                    
                    <div className="stock-meta-row">
                      <span className="stock-symbol-text">
                        <HighlightMatch text={stock.symbol} query={query} />
                      </span>
                      <span className="stock-exchange-badge">NSE</span>
                    </div>
                  </div>

                  <span className="trend-arrow">↗</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* NO RESULTS FOUND */}
        {query && results.length === 0 && !loading && (
          <div className="search-empty-state">
            <p className="empty-title">No matching stocks found for &ldquo;{query}&rdquo;</p>
            <p className="empty-subtitle">Try searching with a company name, stock symbol, or ETF name.</p>
          </div>
        )}

        {/* FAMOUS & TRENDING PRESETS WHEN NOT SEARCHING */}
        {!query && (
          <>
            {/* RECENTLY VIEWED (If in 'All' category) */}
            {selectedCategory === "All" && recent.length > 0 && (
              <div className="search-section">
                <p className="section-title">Recently Viewed</p>
                <ul className="result-list">
                  {recent.map((stock) => (
                    <li
                      key={stock.symbol}
                      className="result-item"
                      onClick={() => updateSearch(stock)}
                    >
                      <div className="stock-icon-wrapper">
                        <StockLogo symbol={stock.symbol} name={stock.name} />
                      </div>
                      
                      <div className="stock-info-main">
                        <div className="stock-name">{stock.name}</div>
                        <div className="stock-meta-row">
                          <span className="stock-symbol-text">{stock.symbol}</span>
                          <span className="stock-exchange-badge">NSE</span>
                        </div>
                      </div>

                      <span className="trend-arrow">↗</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* CURATED POPULAR / FAMOUS ITEMS FOR SELECTED CATEGORY */}
            <div className="search-section">
              <p className="section-title">
                {selectedCategory === "Stocks" && "🔥 Famous Bluechips & Growth Stocks"}
                {selectedCategory === "ETF" && "⚡ Top Liquid Indian ETFs"}
                {selectedCategory === "MTF" && "🚀 Popular Margin Trading (MTF) Stocks"}
                {selectedCategory === "Mutual Funds" && "💎 Top Direct Mutual Funds"}
                {selectedCategory === "Indices" && "📊 Major Benchmark Indices"}
                {selectedCategory === "F&O" && "📈 Most Active F&O Derivatives"}
                {selectedCategory === "All" && "🔥 Trending & Market Leaders"}
              </p>
              <ul className="result-list">
                {(FAMOUS_PRESETS[selectedCategory] || FAMOUS_PRESETS["All"]).map((stock, idx) => (
                  <li
                    key={stock.symbol + idx}
                    className="result-item"
                    onClick={() => updateSearch(stock)}
                  >
                    <div className="stock-icon-wrapper">
                      <StockLogo symbol={stock.symbol} name={stock.name} />
                    </div>
                    
                    <div className="stock-info-main">
                      <div className="stock-name-row">
                        <span className="stock-name">{stock.name}</span>
                        {stock.category && (
                          <span className={`stock-tag-pill tag-${stock.category.toLowerCase().replace(/[^a-z]/g, "")}`}>
                            {stock.category}
                          </span>
                        )}
                      </div>
                      
                      <div className="stock-meta-row">
                        <span className="stock-symbol-text">{stock.symbol}</span>
                        <span className="stock-exchange-badge">
                          {stock.symbol.startsWith("^") ? "INDEX" : "NSE"}
                        </span>
                      </div>
                    </div>

                    <span className="trend-arrow">↗</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {/* SEARCH FOOTER HINT */}
        
      </div>
    </div>
  );
};

export default SearchOverlay;
