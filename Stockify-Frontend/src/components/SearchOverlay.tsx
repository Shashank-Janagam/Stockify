import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../Styles/SearchOverlay.css";
import {useContext} from "react"
import { AuthContext } from "../auth/AuthProvider";
interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

interface StockResult {
  name: string;
  symbol: string;
  exchange?: string;
}
type Stock = {
  symbol: string;
  name: string;
};


const categories = ["All", "Stocks", "F&O", "Mutual Funds", "ETF", "FAQs"];


function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getStockRoute(
  symbol: string,
  name: string
) {
  const symbol1 = symbol.trim().toUpperCase();
  const slug = slugify(name);


  if (symbol1.endsWith(".NS") || symbol1.endsWith(".BO")) {
    return `/indiaSEE/${symbol1}/${slug}`;
  }

  return `/us/${symbol1}/${slug}`;
}

interface RecentStock {
  symbol: string;
  name: string;
}




const SearchOverlay = ({ isOpen, onClose }: SearchOverlayProps) => {
  const navigate = useNavigate();
const [recent, setRecent] = useState<RecentStock[]>([]);
const HOST=import.meta.env.VITE_HOST_ADDRESS

  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockResult[]>([]);
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

const updateSearch=(stock: Stock) => {
                    // ✅ 1. increase popularity
                    fetch( `${HOST}/api/searchUpdates/hit`, {
                      method: "POST",
                      credentials:"include",
                      headers: { "Content-Type": "application/json"
                       },
                      body: JSON.stringify({ symbol: stock.symbol,name:stock.name })
                    }).catch(() => {}); // ignore failure safely

                    // ✅ 2. navigate
                    navigate(getStockRoute(stock.symbol,stock.name));
                    handleClose();
          }

useEffect(() => {
  if (!token) return;

  const fetchRecent = async () => {
    try {
      const res = await fetch(
         `${HOST}/api/searchUpdates/recent`,
        {
          credentials: "include",
        }
      );

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
      setActiveIndex(0);
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
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${HOST}/api/search/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );
        const data = await res.json();
        setResults(data || []);
        setActiveIndex(0);
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error("Search error:", err);
        }
      } finally {
        setLoading(false);
      }
    }, 300); // debounce

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  /* ---------------- KEYBOARD NAV ---------------- */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;

    if (e.key === "ArrowDown") {
      setActiveIndex((i) => (i + 1) % results.length);
    }

    if (e.key === "ArrowUp") {
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    }

    if (e.key === "Enter") {
      updateSearch(results[activeIndex])
      navigate(getStockRoute(results[activeIndex].symbol,results[activeIndex].name));
      handleClose();
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
          <input
            autoFocus
            placeholder="Search stocks, mutual funds, ETFs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* CATEGORIES */}
        <div className="search-categories">
          {categories.map((c) => (
            <button key={c} className="category-chip">
              {c}
            </button>
          ))}
        </div>

        {/* LOADING */}
        {loading && (
          <div className="search-section">
            <p className="section-title">Searching…</p>
          </div>
        )}

        {/* RESULTS */}
        {query && results.length > 0 && (
          <div className="search-section">
            <ul className="result-list">
              {results.map((stock, i) => (
                <li
                  key={stock.symbol}
                  className={`result-item ${i === activeIndex ? "active" : ""}`}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={()=>updateSearch(stock)}
                >

                  <span className="trend">↗</span>
                  <div>
                    <div>{stock.name}</div>
                    <small style={{ color: "#777" }}>
                      {stock.symbol}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

       {/* RECENTLY VIEWED */}
{!query && recent.length > 0 && (
  <div className="search-section">
    <p className="section-title">Recently Viewed</p>
    <ul className="result-list">
      {recent.map((stock) => (
        <li
          key={stock.symbol}
          className="result-item"
          onClick={() => updateSearch(stock)}
        >
          <span className="trend">↗</span>
          <div>
            <div>{stock.name}</div>
            <small style={{ color: "#777" }}>
              {stock.symbol}
            </small>
          </div>
        </li>
      ))}
    </ul>
  </div>
)}

      </div>
    </div>
  );
};

export default SearchOverlay;
