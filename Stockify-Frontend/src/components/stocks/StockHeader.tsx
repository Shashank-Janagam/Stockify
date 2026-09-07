import { BookmarkIcon, Star } from "lucide-react";
import { useState, useEffect } from "react";
import StockLogo from "../common/StockLogo";

type StockHeaderProps = {
  companyName?: string;
  symbol: string;
  price: number | null;
  change: number;
  percent: number;
  timeframe: string;
  marketState?: string | null;
  quote?: any;
  profile?: any;
};

export default function StockHeader({
  companyName,
  symbol,
  price,
  change,
  percent,
  marketState,
  quote,
  profile
}: StockHeaderProps) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [loadingFollow, setLoadingFollow] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const HOST = import.meta.env.VITE_HOST_ADDRESS || "";

  useEffect(() => {
    if (!symbol) return;
    const encoded = encodeURIComponent(symbol);
    fetch(`${HOST}/api/stocks/${encoded}/follow-status`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.isFollowing === "boolean") {
          setIsFollowing(data.isFollowing);
        } else if (data && typeof data.isFollowed === "boolean") {
          setIsFollowing(data.isFollowed);
        }
      })
      .catch((err) => console.error("Error fetching follow status:", err));
  }, [symbol]);

  const toggleFollow = async () => {
    if (!symbol) return;
    setLoadingFollow(true);
    try {
      const encoded = encodeURIComponent(symbol);
      const res = await fetch(`${HOST}/api/stocks/${encoded}/follow`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: companyName || symbol }),
      });
      const data = await res.json();
      if (data && typeof data.isFollowing === "boolean") {
        setIsFollowing(data.isFollowing);
      } else if (data && typeof data.isFollowed === "boolean") {
        setIsFollowing(data.isFollowed);
      }
    } catch (err) {
      console.error("Error toggling follow:", err);
    } finally {
      setLoadingFollow(false);
    }
  };

  const isNegative = change < 0;

  const formatMarketCap = (mc: number) => {
    if (!mc) return "--";
    const cr = mc / 10000000;
    return `₹${cr.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;
  };

  const formattedSymbol = symbol.replace(".NS", "");
  const exchange = quote?.fullExchangeName || (symbol.endsWith(".BO") ? "BSE" : "NSE");

  return (
    <div className="stock-header">
      <div className="stock-header-top">
        <div className="stock-header-title-area">
          <StockLogo
            symbol={symbol}
            name={companyName}
            domain={profile?.website}
            className="stock-logo"
            fallbackToAvatar={false}
          />
          <div className="stock-title-info">
            <div className="stock-name-row">
              <h1 className="company-name">{companyName}</h1>
              <button className="bookmark-btn">
                <BookmarkIcon size={16} />
              </button>
            </div>
            <div className="stock-symbol-row">
              <span className="symbol-text">{formattedSymbol}</span>
              <span className="dot-separator">•</span>
              <span className="exchange-text">
                <span className="exchange-icon">⬘</span> {exchange}
              </span>
            </div>
          </div>
        </div>
        <button 
          className="follow-btn" 
          onClick={toggleFollow}
          disabled={loadingFollow}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{ 
            backgroundColor: isFollowing ? 'rgba(251, 191, 36, 0.1)' : 'transparent', 
            color: isFollowing ? '#fbbf24' : '#9ca3af',
            borderColor: isFollowing ? 'rgba(251, 191, 36, 0.3)' : '#374151',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            justifyContent: 'center',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: 'hidden'
          }}
        >
          <Star 
            size={18} 
            fill={isFollowing ? '#fbbf24' : 'none'} 
            stroke={isFollowing ? '#fbbf24' : 'currentColor'}
            style={{ minWidth: '18px' }}
          />
          {isHovered && (
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'black', whiteSpace: 'nowrap' }}>
              {isFollowing ? 'Unfollow' : 'Follow'}
            </span>
          )}
        </button>
      </div>

      <div className="stock-header-bottom">
        <div className="stock-price-area">
          <div className="price-row">
            <span className="price">
              ₹{price?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "--"}
            </span>
            <span className={`change ${isNegative ? "negative" : "positive"}`}>
              {isNegative ? "▼ " : "▲ "}
              {Math.abs(change).toFixed(2)} ({Math.abs(percent).toFixed(2)}%)
            </span>
          </div>
          <div className="timestamp-row">
            <span className="timestamp">
              {new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "numeric", hour12: true })} IST
            </span>
            <span className="dot-separator">•</span>
            <span className="market-state">Market {marketState === "REGULAR" ? "Open" : "Closed"}</span>
          </div>
        </div>

        <div className="stock-stats-area">
          <div className="stat-item">
            <span className="stat-label">Sector</span>
            <span className="stat-value">{profile?.sector || "--"}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Industry</span>
            <span className="stat-value">{profile?.industry || "--"}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Market Cap</span>
            <span className="stat-value">{formatMarketCap(quote?.marketCap)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
