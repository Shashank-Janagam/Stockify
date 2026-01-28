import YahooFinance from "yahoo-finance2";
const yahoo = new YahooFinance();

/* =========================
   🔁 Ensure IST (No Double Shift)
========================= */
function ensureIST(date) {
  // IST timezone offset = -330 minutes
  if (date.getTimezoneOffset() === -330) {
    return date; // already IST
  }
  return new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
}

/* =========================
   📈 Yahoo India History
========================= */
export async function getYahooIndiaHistory(symbol, days) {
  const nowSec = Math.floor(Date.now() / 1000);

  let interval;
  let period1;

  /* =========================
     FETCH STRATEGY
  ========================= */
  if (days <= 1) {
    interval = "1m";
    period1 = nowSec - 60 * 60 * 24 * 5; // buffer for holidays
  } else if (days <= 7) {
    interval = "5m";
    period1 = nowSec - 60 * 60 * 24 * 7;
  } else if (days <= 30) {
    interval = "15m";
    period1 = nowSec - 60 * 60 * 24 * 30;
  } else if (days <= 90) {
    interval = "1d";
    period1 = nowSec - 60 * 60 * 24 * 90;
  } else if (days <= 180) {
    interval = "1d";
    period1 = nowSec - 60 * 60 * 24 * 180;
  } else if (days <= 365) {
    interval = "1d";
    period1 = nowSec - 60 * 60 * 24 * 365;
  } else if (days <= 1095) {
    interval = "5d";
    period1 = nowSec - 60 * 60 * 24 * 1095;
  } else if (days <= 1825) {
    interval = "5d";
    period1 = nowSec - 60 * 60 * 24 * 1825;
  } else {
    interval = "5d";
    period1 = 0;
  }

  /* =========================
     FETCH DATA
  ========================= */
  const result = await yahoo.chart(symbol, {
    period1,
    period2: nowSec,
    interval,
    includePrePost: false
  });

  const raw = (result.quotes || [])
    .filter(q => q.close != null)
    .map(q => ({
      ...q,
      istDate: ensureIST(q.date)
    }));

  if (!raw.length) return [];

  /* =========================
     ✅ FIX FOR 1D (INTRADAY)
  ========================= */
  let filtered = raw;

  if (days <= 1) {
    // latest trading day in IST
    const last = raw[raw.length - 1].istDate;
    const y = last.getFullYear();
    const m = last.getMonth();
    const d = last.getDate();

    filtered = raw.filter(q => {
      const dt = q.istDate;

      if (
        dt.getFullYear() !== y ||
        dt.getMonth() !== m ||
        dt.getDate() !== d
      ) {
        return false;
      }

      // NSE hours: 09:15–15:30 IST
      const minutes = dt.getHours() * 60 + dt.getMinutes();
      return minutes >= 555 && minutes <= 930;
    });
  }

  /* =========================
     FINAL OUTPUT (IST)
  ========================= */
  return filtered.map(q => ({
    x: q.istDate.getTime(), // 🔥 ALWAYS IST
    o: q.open,
    h: q.high,
    l: q.low,
    c: q.close
  }));
}
