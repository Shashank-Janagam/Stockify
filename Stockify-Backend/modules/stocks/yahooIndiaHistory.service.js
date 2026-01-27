import YahooFinance from "yahoo-finance2";
const yahoo = new YahooFinance();

export async function getYahooIndiaHistory(symbol, days) {
  const nowSec = Math.floor(Date.now() / 1000);

  let interval;
  let period1;

  /* =========================
     FETCH STRATEGY
  ========================= */
  if (days <= 1) {
    interval = "1m";
    period1 = nowSec - 60 * 60 * 24 * 5; // wider buffer for holidays
  } else if (days <= 7) {
    interval = "5m";
    period1 = nowSec - 60 * 60 * 24 * 7;
  } else if (days <= 30) {
    interval = "15m";
    period1 = nowSec - 60 * 60 * 24 * 30;
  } else {
    interval = "1d";
    period1 = nowSec - 60 * 60 * 24 * days;
  }

  const result = await yahoo.chart(symbol, {
    period1,
    period2: nowSec,
    interval,
    includePrePost: false
  });

  const raw = (result.quotes || []).filter(q => q.close != null);
  if (!raw.length) return [];

  /* =========================
     ✅ FIX FOR 1D
  ========================= */
  let filtered = raw;

  if (days <= 1) {
    // 1️⃣ find latest trading date (yyyy-mm-dd)
    const lastCandle = raw[raw.length - 1].date;
    const y = lastCandle.getFullYear();
    const m = lastCandle.getMonth();
    const d = lastCandle.getDate();

    // 2️⃣ keep ONLY candles from that day + NSE hours
    filtered = raw.filter(q => {
      const dt = q.date;

      if (
        dt.getFullYear() !== y ||
        dt.getMonth() !== m ||
        dt.getDate() !== d
      ) {
        return false;
      }

      const mins = dt.getHours() * 60 + dt.getMinutes();
      return mins >= 555 && mins <= 930; // 09:15–15:30 IST
    });
  }

  /* =========================
     FINAL OUTPUT
  ========================= */
  return filtered.map(q => ({
    x: q.date.getTime(),
    o: q.open,
    h: q.high,
    l: q.low,
    c: q.close
  }));
}
