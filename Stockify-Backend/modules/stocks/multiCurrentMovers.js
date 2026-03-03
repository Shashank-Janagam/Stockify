import axios from "axios";
import https from "https";

const BASE = "https://www.nseindia.com";

const agent = new https.Agent({
  keepAlive: true
});

const client = axios.create({
  httpsAgent: agent,
  timeout: 15000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.nseindia.com/",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
    "Connection": "keep-alive"
  }
});

let cookies = "";

/* -------------------------
   ALWAYS REFRESH COOKIE
------------------------- */
async function refreshSession() {
  const res = await client.get(BASE);
  const setCookies = res.headers["set-cookie"];

  cookies = setCookies
    ?.map(c => c.split(";")[0])
    .join("; ");

  client.defaults.headers.Cookie = cookies;
}

/* -------------------------
   FETCH NSE SAFELY
------------------------- */
let lastSessionTime = 0;

async function ensureSession() {
  const now = Date.now();
  if (!cookies || now - lastSessionTime > 5 * 60 * 1000) {
    await refreshSession();
    lastSessionTime = now;
  }
}

async function fetchNSE(url) {
  await ensureSession();
  const res = await client.get(url);
  return res.data;
}


/* -------------------------
   NSE MOVERS WITH FALLBACK
------------------------- */
let cachedGainers = ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS", "ITC.NS", "SBIN.NS", "BHARTIARTL.NS", "KOTAKBANK.NS", "LT.NS"];
let cachedLosers = ["TATAMOTORS.NS", "WIPRO.NS", "AXISBANK.NS", "HINDALCO.NS", "ADANIENT.NS", "ONGC.NS", "JSWSTEEL.NS", "MARUTI.NS", "BAJFINANCE.NS", "TITAN.NS"];

export async function getNSETopGainers(limit = 10) {
  try {
    const json = await fetchNSE(`${BASE}/api/live-analysis-variations?index=gainers`);
    const symbols = json?.allSec?.data?.slice(0, limit).map(s => `${s.symbol}.NS`);
    
    if (symbols && symbols.length > 0) {
      cachedGainers = symbols;
      return symbols;
    }
    throw new Error("No data found in NSE response");
  } catch (err) {
    // console.warn("⚠️ NSE Gainers Fetch Failed, using fallback. Error:", err.message);
    return cachedGainers.slice(0, limit);
  }
}

export async function getNSETopLosers(limit = 10) {
  try {
    // Note: The correct NSE parameter is 'losers', not 'loosers'
    const json = await fetchNSE(`${BASE}/api/live-analysis-variations?index=losers`);
    const symbols = json?.allSec?.data?.slice(0, limit).map(s => `${s.symbol}.NS`);
    
    if (symbols && symbols.length > 0) {
      cachedLosers = symbols;
      return symbols;
    }
    throw new Error("No data found in NSE response");
  } catch (err) {
    // console.warn("⚠️ NSE Losers Fetch Failed, using fallback. Error:", err.message);
    return cachedLosers.slice(0, limit);
  }
}



