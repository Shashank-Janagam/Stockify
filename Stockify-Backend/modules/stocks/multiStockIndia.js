// modules/stocks/multiStockIndia.js
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});


export async function MultiStockYahoo(symbols = []) {
  try {
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return [];
    }

    // 🔥 Single Yahoo request
    const quotes = await yahooFinance.quote(symbols);
    console.log("Yahoo quotes fetched:", quotes.length);
    // 🔄 Normalize response
    return quotes
      .filter(q => q?.symbol)
      .map(q => ({
        symbol: q.symbol,
        name: q.shortName || q.longName || "N/A",
        price: q.regularMarketPrice ?? null,
        change: q.regularMarketChange
          ? Number(q.regularMarketChange.toFixed(2))
          : 0,
        percent: q.regularMarketChangePercent
          ? Number(q.regularMarketChangePercent.toFixed(2))
          : 0,
        marketState: q.marketState,
        volume: q.regularMarketVolume ?? null,
      }));
  } catch (err) {
    console.error("Yahoo error:", err.message);
    return [];
  }
}

