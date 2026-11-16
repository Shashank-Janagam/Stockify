import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import zlib from "zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NSE_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";

/**
 * Downloads latest instruments from Upstox CDN, filters Equities and Indices,
 * normalizes symbol names, and updates both Upstox-Backend and Stockify-Backend subscriptions.json files.
 */
export async function downloadAndSaveSubscriptions() {
  console.log("📥 Downloading latest NSE instruments from Upstox CDN...");
  console.log(`🔗 URL: ${NSE_URL}`);

  const res = await fetch(NSE_URL);
  if (!res.ok) {
    throw new Error(`Failed to download Upstox instruments (${res.status}): ${res.statusText}`);
  }

  const buffer = await res.arrayBuffer();
  console.log(`📦 Downloaded ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB compressed archive. Decompressing...`);

  const unzipped = zlib.gunzipSync(Buffer.from(buffer)).toString("utf-8");
  const data = JSON.parse(unzipped);

  console.log(`📊 Processing ${data.length} total market instruments...`);

  // Filter for Equities and Indices only
  const filtered = data.filter((d) =>
    d.instrument_type === "EQUITY" ||
    d.instrument_type === "EQ" ||
    d.instrument_type === "INDEX"
  );

  const seenSymbols = new Set();
  const subscriptions = [];

  // Special index symbol overrides for standard Indian market trackers
  const indexOverrides = {
    "NIFTY 50": "^NSEI",
    "NIFTY BANK": "^NSEBANK",
    "NIFTY MIDCAP 100": "NIFTY_MIDCAP_100",
    "NIFTY FIN SERVICE": "NIFTY_FIN_SERVICE",
    "NIFTY NEXT 50": "NIFTY_NEXT_50",
    "NIFTY 100": "NIFTY_100",
    "NIFTY 500": "NIFTY_500",
    "NIFTY AUTO": "NIFTY_AUTO",
    "NIFTY IT": "NIFTY_IT",
    "NIFTY PHARMA": "NIFTY_PHARMA",
    "NIFTY METAL": "NIFTY_METAL",
    "NIFTY FMCG": "NIFTY_FMCG",
  };

  for (const d of filtered) {
    let symbol = (d.trading_symbol || d.name || "").trim().toUpperCase();
    const nameUpper = (d.name || "").trim().toUpperCase();

    // Check index overrides
    if (indexOverrides[nameUpper]) {
      symbol = indexOverrides[nameUpper];
    } else if (indexOverrides[symbol]) {
      symbol = indexOverrides[symbol];
    }

    if (!symbol || !d.instrument_key) continue;

    const entryKey = `${symbol}|${d.instrument_key}`;
    if (seenSymbols.has(entryKey)) continue;
    seenSymbols.add(entryKey);

    subscriptions.push({
      symbol: symbol,
      name: d.name || symbol,
      instrument_key: d.instrument_key,
    });
  }

  // Always append BSE Sensex index
  subscriptions.push({
    symbol: "^BSESN",
    name: "SENSEX",
    instrument_key: "BSE_INDEX|SENSEX",
  });

  console.log(`✨ Extracted ${subscriptions.length} active equities and market indices.`);

  const content = JSON.stringify(subscriptions, null, 2);

  // Write to Upstox-Backend and Stockify-Backend (both root and data/) to keep everything in sync
  const targetPaths = [
    path.resolve(__dirname, "subscriptions.json"),
    path.resolve(__dirname, "../Stockify-Backend/subscriptions.json"),
    path.resolve(__dirname, "../Stockify-Backend/data/subscriptions.json"),
  ];

  for (const filePath of targetPaths) {
    try {
      fs.writeFileSync(filePath, content, "utf-8");
      console.log(`✅ Saved ${subscriptions.length} instruments to: ${filePath}`);
    } catch (err) {
      console.warn(`⚠️ Could not write to ${filePath}:`, err.message);
    }
  }

  return subscriptions;
}

// Execute immediately if run from command line
if (process.argv[1] && process.argv[1].includes("update_subscriptions")) {
  downloadAndSaveSubscriptions()
    .then((subs) => {
      console.log(`\n🎉 Success! subscriptions.json updated with ${subs.length} latest instruments.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("\n❌ Failed to update subscriptions:", err.message);
      process.exit(1);
    });
}
