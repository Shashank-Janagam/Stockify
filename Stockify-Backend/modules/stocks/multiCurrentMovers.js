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
   NSE MOVERS
------------------------- */
export async function getNSETopGainers(limit = 10) {
  const json = await fetchNSE(
    `${BASE}/api/live-analysis-variations?index=gainers`
  );

 

  return json?.allSec?.data

    ?.slice(0, limit)
    .map(s => `${s.symbol}.NS`) || [];
}



