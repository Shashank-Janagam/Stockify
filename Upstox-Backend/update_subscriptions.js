import fs from "fs";

const url = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz";

console.log("Downloading NSE instruments from Upstox...");

async function run() {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const zlib = await import("zlib");
  const unzipped = zlib.gunzipSync(buffer).toString();
  const data = JSON.parse(unzipped);

  const equities = data.filter(d => 
    d.instrument_type === "EQUITY" || 
    d.instrument_type === "EQ" || 
    d.instrument_type === "INDEX"
  );
  
  const subscriptions = equities.map(d => {
      let symbol = d.trading_symbol || d.name;
      if (d.name === "Nifty 50") symbol = "^NSEI";
      if (d.name === "Nifty Bank") symbol = "^NSEBANK";
      if (d.name === "NIFTY MIDCAP 100") symbol = "NIFTY_MIDCAP_100";
      if (d.name === "Nifty Fin Service") symbol = "NIFTY_FIN_SERVICE";
      
      return {
          symbol: symbol,
          name: d.name,
          instrument_key: d.instrument_key
      };
  });

  subscriptions.push({
      symbol: "^BSESN",
      name: "SENSEX",
      instrument_key: "BSE_INDEX|SENSEX"
  });

  fs.writeFileSync("subscriptions.json", JSON.stringify(subscriptions, null, 2));
  console.log(`Successfully wrote ${subscriptions.length} instruments to subscriptions.json`);
}

run().catch(console.error);
