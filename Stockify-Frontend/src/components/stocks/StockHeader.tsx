import { BookmarkIcon, PlusIcon } from "lucide-react";

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
  const isNegative = change < 0;
  const images = import.meta.glob(
    "../../assets/*.{png,jpg,jpeg,svg,webp}",
    { eager: true }
  );

  const getImageSrc = (symbol: string): string => {
    const name = symbol.replace(".NS", "");

    const match = Object.keys(images).find((path) =>
      path.includes(`/${name}.`)
    );

    return match
      ? (images[match] as any).default
      : (images["../../assets/imageinv.png"] as any).default;
  };

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
          <img
            src={new URL(`${getImageSrc(symbol)}`, import.meta.url).href}
            alt={companyName}
            className="stock-logo"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.src = "/assets/default-logo.png";
            }}
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
        <button className="follow-btn">
          <PlusIcon size={16} /> Follow
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
