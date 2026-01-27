type StockHeaderProps = {
  companyName?: string;
  symbol: string;
  price: number | null;
  change: number;
  percent: number;
  timeframe: string;
};
import google from "../assets/google.png"
export default function StockHeader({

  companyName,
  // symbol,
  price,
  change,
  percent,
  timeframe
}: StockHeaderProps) {
  const isNegative = change < 0;
  // console.log("company name:",companyName)
  console.log(price);
  return (
    <div className="stock-header">
      <img
        src={google}
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
              ₹{price?.toFixed(2) ?? "--"}
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
