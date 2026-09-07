import YahooFinance from "yahoo-finance2";
const yahoo = new YahooFinance({
  suppressNotices: ["yahooSurvey"]
});

/**
 * Returns the minimum interval supported by Yahoo Finance for a given timeframe in days.
 * - <= 7d (1d, 5d, 7d): 1m
 * - <= 60d (1mo, 2mo): 2m
 * - <= 1825d (6mo, 1y, 2y, 3y, 4y, 5y): 1h
 * - > 1825d: 1d
 */
export function getMinimumSupportedInterval(days) {
  const d = typeof days === "number" ? days : (days === "ALL" ? 9999 : Number(days) || 1);
  if (d <= 7) return "1m";
  if (d <= 60) return "2m";
  if (d <= 1825) return "1h";
  return "1d";
}

/** 
 * Resolves the interval to use:
 * - 6m, 1y, 2y, 3y, 4y, 5y: '1h'
 * - Others: minimum possible supported interval (1m for <=7d, 2m for <=60d, 1d for >5y)
 */
export function resolveYahooInterval(days, customInterval = null) {
  const d = typeof days === "number" ? days : (days === "ALL" ? 9999 : Number(days) || 1);

  if (customInterval) {
    const norm = String(customInterval).toLowerCase().trim();
    if (norm === "1m") {
      return d <= 7 ? "1m" : (d <= 60 ? "2m" : (d <= 1825 ? "1h" : "1d"));
    }
    if (["2m", "5m", "15m", "30m"].includes(norm)) {
      return d <= 60 ? norm : (d <= 1825 ? "1h" : "1d");
    }
    if (["60m", "1h"].includes(norm)) {
      return d <= 1825 ? "1h" : "1d";
    }
    return norm;
  }

  if (d <= 7) return "1m";
  if (d <= 60) return "2m";
  if (d <= 1825) return "1h"; // 6m, 1y, 2y, 3y, 4y, 5y use 1hr
  return "1d";
}

export async function getYahooIndiaHistory(symbol, days, customInterval = null) {
  if (!symbol) return [];

  // Normalize symbol for Yahoo Finance
  let targetSymbol = symbol.trim();
  if (!targetSymbol.startsWith("^") && !targetSymbol.endsWith(".NS") && !targetSymbol.endsWith(".BO")) {
    targetSymbol = `${targetSymbol}.NS`;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const numDays = typeof days === "number" ? days : (days === "ALL" ? 9999 : Number(days) || 1);
  const interval = resolveYahooInterval(numDays, customInterval);

  let period1;
  if (numDays <= 1) {
    period1 = nowSec - 60 * 60 * 24 * (interval === "5m" ? 7 : 5);
  } else if (numDays <= 7) {
    period1 = nowSec - 60 * 60 * 24 * 7;
  } else if (numDays <= 30) {
    period1 = nowSec - 60 * 60 * 24 * 30;
  } else if (numDays <= 90) {
    period1 = nowSec - 60 * 60 * 24 * 90;
  } else if (numDays <= 180) {
    period1 = nowSec - 60 * 60 * 24 * 180;
  } else if (numDays <= 365) {
    period1 = nowSec - 60 * 60 * 24 * 365;
  } else {
    period1 = 0;
  }

  let result = null;
  try {
    result = await yahoo.chart(targetSymbol, {
      period1,
      period2: nowSec,
      interval,
      includePrePost: false
    });
  } catch (err) {
    // If NSE (.NS) failed, attempt BSE (.BO) fallback
    if (targetSymbol.endsWith(".NS")) {
      const bseSymbol = targetSymbol.replace(/\.NS$/, ".BO");
      try {
        result = await yahoo.chart(bseSymbol, {
          period1,
          period2: nowSec,
          interval,
          includePrePost: false
        });
      } catch (_) {}
    }

    if (!result) {
      console.warn(`[YahooFinance] History not available for ${symbol} (${err.message})`);
      return [];
    }
  }

  const raw = (result?.quotes || []).filter(q => q && q.close != null);
  if (!raw.length) return [];

  let filtered = raw;

  /* =========================
     ✅ INTRADAY FILTER (UTC)
  ========================= */
  if (numDays <= 1 && ["1m", "2m", "5m", "15m", "30m"].includes(interval)) {
    const last = raw[raw.length - 1].date;
    const y = last.getUTCFullYear();
    const m = last.getUTCMonth();
    const d = last.getUTCDate();

    filtered = raw.filter(q => {
      const dt = q.date;
      if (!dt) return false;

      if (
        dt.getUTCFullYear() !== y ||
        dt.getUTCMonth() !== m ||
        dt.getUTCDate() !== d
      ) return false;

      // NSE hours in UTC: 03:45–10:00
      const mins = dt.getUTCHours() * 60 + dt.getUTCMinutes();
      return mins >= 225 && mins <= 600;
    });
  }

  /* =========================
     FINAL OUTPUT (UTC TIMESTAMP)
  ========================= */
  return filtered.map(q => ({
    x: q.date.getTime(), // 🔥 ABSOLUTE TIME (NO TZ SHIFT)
    o: q.open ?? q.close,
    h: q.high ?? q.close,
    l: q.low ?? q.close,
    c: q.close
  }));
}
