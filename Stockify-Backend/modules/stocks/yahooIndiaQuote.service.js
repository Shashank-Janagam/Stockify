import YahooFinance from "yahoo-finance2";

const yahoo = new YahooFinance({
  suppressNotices: ["yahooSurvey"]
});

export async function getYahooIndiaQuote(symbol) {
  if (!symbol) return null;

  let finalSymbol = (symbol.endsWith(".NS") || symbol.endsWith(".BO") || symbol.startsWith("^"))
    ? symbol
    : `${symbol}.NS`;

  try {
    const quote = await yahoo.quote(finalSymbol);
    return quote;
  } catch (err) {
    // If NSE failed, attempt BSE fallback
    if (!symbol.startsWith("^") && !symbol.endsWith(".BO")) {
      const bseSymbol = symbol.replace(/\.NS$/, "") + ".BO";
      try {
        const quote = await yahoo.quote(bseSymbol);
        return quote;
      } catch (_) {}
    }
    console.warn(`[YahooQuote] Quote not available for ${symbol} (${err.message})`);
    return null;
  }
}
