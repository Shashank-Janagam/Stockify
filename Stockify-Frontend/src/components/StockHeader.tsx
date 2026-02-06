

type StockHeaderProps = {
  companyName?: string;
  symbol: string;
  price: number | null;
  change: number;
  percent: number;
  timeframe: string;
};
export default function StockHeader({

  companyName,
  symbol,
  price,
  change,
  percent,
  timeframe
}: StockHeaderProps) {
  const isNegative = change < 0;
  // console.log("company name:",companyName)
  console.log(price);
  const images = import.meta.glob(
  "../assets/*.{png,jpg,jpeg,svg,webp}",
  { eager: true }
);

const getImageSrc = (symbol: string): string => {
  const name = symbol.replace(".NS", "");

  const match = Object.keys(images).find(path =>
    path.includes(`/${name}.`)
  );

  return match
    ? (images[match] as any).default
    : (images["../assets/StockiftLogo.png"] as any).default;
};

  return (
    <div className="stock-header">
      <img
        src={new URL(`${getImageSrc(symbol)}`, import.meta.url).href}

        alt={companyName}
        className="stock-logo"
        loading="lazy"
        onError={(e) => {
          e.currentTarget.src = "/assets/default-logo.png";
        }}
      />
      {/* ===== LEFT SIDE ===== */}
      <div className="stock-left">
        


        <div className="stock-info">
          <h1 className="company-name">
            {companyName}
          </h1>

          <div className="price-row">
            <span className="price">
              ₹{price?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "--"}
            </span>

            <span
              className={`change ${
                isNegative ? "negative" : "positive"
              }`}
            >
              {change > 0 ? "+" : ""}
              {change.toFixed(2)} ({percent.toFixed(2)}%)
            </span>

            <span className="timeframe">
              {timeframe}
            </span>
          </div>
        </div>
      </div>

      {/* ===== RIGHT SIDE ACTIONS ===== */}
      
    </div>
  );
}
