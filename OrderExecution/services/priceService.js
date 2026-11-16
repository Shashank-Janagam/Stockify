import YahooFinance from "yahoo-finance2";
import redis from "../cache/redisClient.js";

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

function normalizeYahooTime(t) {
  if (typeof t === "string") {
    const d = new Date(t);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof t === "number" && t > 0 && t < 1e12) {
    return new Date(t * 1000).toISOString();
  }
  if (typeof t === "number" && t >= 1e12) {
    return new Date(t).toISOString();
  }
  return new Date().toISOString();
}

/**
 * Resolves the latest market price for a given stock symbol.
 * Checks Upstox Redis snapshot cache first, falling back to Yahoo Finance.
 */
export async function getCurrentPrice(symbol) {
  const cleanSymbol = symbol.replace(/\.(NS|BO)$/i, "").toUpperCase().trim();
  const finalSymbol = `${cleanSymbol}.NS`;

  // 1. Check Redis tick snapshot cache
  try {
    const snapshotRaw = await redis.hget("ticks:latest", cleanSymbol);
    if (snapshotRaw) {
      const snap = JSON.parse(snapshotRaw);
      const ltp = Number(snap.ltp || snap.price);
      if (ltp && ltp > 0) {
        return {
          symbol: finalSymbol,
          cleanSymbol,
          pricePerShare: ltp,
          name: snap.name || cleanSymbol,
          exchange: "NSE",
          tickSize: 0.05,
          createdAt: snap.timestamp || new Date().toISOString(),
          source: "UPSTOX_REDIS",
        };
      }
    }
  } catch (err) {
    console.warn(`[PriceService] Redis snapshot lookup failed for ${cleanSymbol}:`, err.message);
  }

  // 2. Fallback to Yahoo Finance
  const quote = await yahoo.quote(finalSymbol);
  const createdAt = normalizeYahooTime(quote.regularMarketTime);

  return {
    symbol: finalSymbol,
    cleanSymbol,
    pricePerShare: quote.regularMarketPrice,
    name: quote.shortName || quote.longName || cleanSymbol,
    exchange: quote.exchange || "NSE",
    tickSize: quote.dayHigh && quote.dayLow ? quote.dayHigh - quote.dayLow : 0.05,
    createdAt,
    source: "YAHOO_FALLBACK",
  };
}
