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

    const queryMap = new Map(); // query -> originalSymbol
    const queries = symbols.map(s => {
      const orig = String(s).trim().toUpperCase();
      let q = orig;
      if (!orig.startsWith("^") && !orig.endsWith(".NS") && !orig.endsWith(".BO")) {
        q = `${orig}.NS`;
      }
      queryMap.set(q, orig);
      queryMap.set(orig, orig);
      return q;
    });

    let rawQuotes = [];
    try {
      const res = await yahooFinance.quote(queries);
      rawQuotes = Array.isArray(res) ? res : (res ? [res] : []);
    } catch (batchErr) {
      // Fallback to individual settled requests if batch fails
      const settled = await Promise.allSettled(
        queries.map(q => yahooFinance.quote(q).catch(() => null))
      );
      rawQuotes = settled
        .filter(r => r.status === "fulfilled" && r.value)
        .map(r => r.value);
    }

    return rawQuotes
      .filter(q => q && q.symbol)
      .map(q => {
        const origSymbol = queryMap.get(q.symbol) || q.symbol.replace(/\.NS$/, "").toUpperCase();
        return {
          symbol: origSymbol,
          symbolNS: q.symbol,
          name: q.shortName || q.longName || origSymbol,
          price: q.regularMarketPrice ?? null,
          change: q.regularMarketChange
            ? Number(q.regularMarketChange.toFixed(2))
            : 0,
          percent: q.regularMarketChangePercent
            ? Number(q.regularMarketChangePercent.toFixed(2))
            : 0,
          marketState: q.marketState,
          volume: q.regularMarketVolume ?? null,
        };
      });
  } catch (err) {
    console.error("Yahoo error in MultiStockYahoo:", err.message);
    return [];
  }
}


