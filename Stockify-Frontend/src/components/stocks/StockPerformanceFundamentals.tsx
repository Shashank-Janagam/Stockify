interface Props {
  quote: any; // Yahoo quote object
}

export default function StockPerformanceFundamentals({ quote }: Props) {
    
  if (!quote) return null;

  const currentPrice = quote.regularMarketPrice;

  const getPosition = (value: number, min: number, max: number) => {
    if (!min || !max || min === max) return "0%";
    return `${((value - min) / (max - min)) * 100}%`;
  };

  return (
    <div className="stock-info-panel">
      {/* ================= PERFORMANCE ================= */}
      <h3 className="section-title">Performance</h3>

      {/* TODAY RANGE */}
      <RangeBar
        leftLabel="Today’s Low"
        leftValue={quote.regularMarketDayLow}
        rightLabel="Today’s High"
        rightValue={quote.regularMarketDayHigh}
        marker={getPosition(
          currentPrice,
          quote.regularMarketDayLow,
          quote.regularMarketDayHigh
        )}
      />

      {/* 52 WEEK RANGE */}
      <RangeBar
        leftLabel="52W Low"
        leftValue={quote.fiftyTwoWeekLow}
        rightLabel="52W High"
        rightValue={quote.fiftyTwoWeekHigh}
        marker={getPosition(
          currentPrice,
          quote.fiftyTwoWeekLow,
          quote.fiftyTwoWeekHigh
        )}
      />

      <div className="kv-grid">
        <KV label="Open" value={`₹${quote.regularMarketOpen}`} />
        <KV label="Prev. Close" value={`₹${quote.regularMarketPreviousClose}`} />
        <KV label="Volume" value={quote.regularMarketVolume?.toLocaleString("en-IN")} />
        <KV label="Market State" value={quote.marketState} />
        
      </div>

      {/* ================= FUNDAMENTALS ================= */}
      <h3 className="section-title">Fundamentals</h3>

      <div className="fundamentals-grid">
        <KV label="Market Cap" value={`₹${(quote.marketCap / 1e7).toFixed(0)} Cr`} />

        <KV label="P/E (TTM)" value={quote.trailingPE ?? "-"} />
        <KV label="EPS (TTM)" value={quote.epsTrailingTwelveMonths ?? "-"} />

        <KV label="P/B Ratio" value={quote.priceToBook ?? "-"} />
        <KV label="Dividend Yield" value={`${quote.dividendYield ?? 0}%`} />

        <KV label="Book Value" value={quote.bookValue ?? "-"} />
      </div>
    </div>
  );
}

/* ================= SMALL COMPONENTS ================= */

function RangeBar({
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
  marker
}: any) {
  return (
    <div className="range-block">
      <div className="range-labels">
        <span>{leftLabel}<br /><b>₹{leftValue}</b></span>
        <span>{rightLabel}<br /><b>₹{rightValue}</b></span>
      </div>
      <div className="range-bar">
        <span className="marker" style={{ left: marker }} />
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: any }) {
  return (
    <div className="kv">
      <span className="kv-label">{label}</span>
      <span className="kv-value">{value}</span>
    </div>
  );
}
