import YahooFinance from "yahoo-finance2";
const yahoo = new YahooFinance();

export async function getYahooIndiaHistory(symbol, days, customInterval = null) {
  const nowSec = Math.floor(Date.now() / 1000);

  let interval;
  let period1;

  if (days <= 1) {
    interval = customInterval || "1m";
    period1 = nowSec - 60 * 60 * 24 * (customInterval === "5m" ? 7 : 5);
  } else if (days <= 7) {
    interval = customInterval || "5m";
    period1 = nowSec - 60 * 60 * 24 * 7;
  } else if (days <= 30) {
    interval = customInterval || "15m";
    period1 = nowSec - 60 * 60 * 24 * 30;
  } else if (days <= 90) {
    interval = customInterval || "1d";
    period1 = nowSec - 60 * 60 * 24 * 90;
  } else if (days <= 180) {
    interval = customInterval || "1d";
    period1 = nowSec - 60 * 60 * 24 * 180;
  } else if (days <= 365) {
    interval = customInterval || "1d";
    period1 = nowSec - 60 * 60 * 24 * 365;
  } else {
    interval = customInterval || "5d";
    period1 = 0;
  }

  const result = await yahoo.chart(symbol, {
    period1,
    period2: nowSec,
    interval,
    includePrePost: false
  });

  const raw = (result.quotes || []).filter(q => q.close != null);
  if (!raw.length) return [];

  let filtered = raw;

  /* =========================
     ✅ INTRADAY FILTER (UTC)
  ========================= */
  if (days <= 1) {
    const last = raw[raw.length - 1].date;
    const y = last.getUTCFullYear();
    const m = last.getUTCMonth();
    const d = last.getUTCDate();

    filtered = raw.filter(q => {
      const dt = q.date;

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
    o: q.open,
    h: q.high,
    l: q.low,
    c: q.close
  }));
}
