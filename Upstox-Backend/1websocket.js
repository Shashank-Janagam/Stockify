import fs from "fs";
import path from "path";
import axios from "axios";
import { WebSocketServer, WebSocket } from "ws";
import protobuf from "protobufjs";
import dotenv from "dotenv";
import express from "express";
import http from "http";
import mongoose from "mongoose";
import { Token } from "./TokenModel.js";

dotenv.config();

let ACCESS_TOKEN = null;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI missing in .env file");
  process.exit(1);
}

let FeedResponseProto = null;
const stockMap = new Map();
const instrumentKeys = [];

// Cache of latest live ticks by instrument_key
const latestTicks = new Map();

// Reference to active Upstox API WebSocket (set once connected)
let upstoxWs = null;

/**
 * Loads stock subscriptions dynamically from subscriptions.json
 */
function loadSubscriptions(filePath = "subscriptions.json") {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  
  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ Subscriptions file not found at: ${resolvedPath}`);
    process.exit(1);
  }

  try {
    const rawData = fs.readFileSync(resolvedPath, "utf-8");
    const json = JSON.parse(rawData);
    
    let items = [];
    if (Array.isArray(json)) {
      items = json;
    } else if (json && Array.isArray(json.instruments)) {
      items = json.instruments;
    } else if (json && Array.isArray(json.stocks)) {
      items = json.stocks;
    }

    instrumentKeys.length = 0;
    stockMap.clear();

    items.forEach((item) => {
      if (typeof item === "string") {
        instrumentKeys.push(item);
        stockMap.set(item, { symbol: item, name: item, instrument_key: item });
      } else if (typeof item === "object" && item !== null) {
        const key = item.instrument_key || item.instrumentKey || item.key;
        const symbol = item.symbol || item.stockName || key;
        const name = item.name || symbol;
        if (key) {
          instrumentKeys.push(key);
          stockMap.set(key, { symbol, name, instrument_key: key });
        }
      }
    });

    console.log(`📋 [websocket.js] Loaded ${instrumentKeys.length} stock subscriptions from ${filePath}`);
  } catch (error) {
    console.error(`❌ Failed to read or parse ${filePath}:`, error.message);
    process.exit(1);
  }
}

// Helper to resolve instrumentKey by symbol name or ISIN key
function resolveInstrumentKey(query) {
  if (!query) return null;
  const qUpper = query.trim().toUpperCase();

  // 1. Exact match in stockMap
  if (stockMap.has(query)) return query;
  if (stockMap.has(qUpper)) return qUpper;

  // 2. Search by symbol or name
  for (const [key, stockInfo] of stockMap.entries()) {
    if (stockInfo.symbol && stockInfo.symbol.toUpperCase() === qUpper) return key;
    if (stockInfo.name && stockInfo.name.toUpperCase() === qUpper) return key;
  }

  // 3. Partial match
  for (const key of stockMap.keys()) {
    if (key.toUpperCase().includes(qUpper)) return key;
  }

  return null;
}

// Setup Express & WebSocket Server on Port 4141
const app = express();
const PORT = process.env.PORT_4141 || 4141;
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  next();
});

/**
 * WebSocket Server on Port 4141:
 * Accepts incoming connections from client.js or external backend services.
 * 
 * Supports:
 * - Connecting via URL path: ws://localhost:4141/RELIANCE,TCS,HDFCBANK
 * - Sending JSON subscription message:
 *   { "action": "subscribe", "symbols": ["RELIANCE", "TCS", "HDFCBANK", "INFY"] }
 */
wss.on("connection", (ws, req) => {
  ws.subscribedKeys = new Set();

  const urlPath = req.url ? req.url.trim().replace(/^\/+/, "") : "";
  if (urlPath) {
    const parts = urlPath.split(",");
    parts.forEach((p) => {
      const resolved = resolveInstrumentKey(p.trim());
      if (resolved) {
        ws.subscribedKeys.add(resolved);
      }
    });

    if (ws.subscribedKeys.size > 0) {
      console.log(`🔌 [WS 4141] Client connected via URL for ${ws.subscribedKeys.size} stocks: ${urlPath}`);
      ws.subscribedKeys.forEach((key) => {
        if (latestTicks.has(key)) {
          ws.send(JSON.stringify(latestTicks.get(key)));
        }
      });
    }
  }

  if (ws.subscribedKeys.size === 0) {
    console.log(`🔌 [WS 4141] Client connected (Send {"action": "subscribe", "symbols": ["RELIANCE", "TCS"]} to request symbols)`);
  }

  // Handle client incoming subscription/unsubscription messages
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());
      const rawList = data.symbols || data.instruments || (data.symbol ? [data.symbol] : null) || (data.instrumentKey ? [data.instrumentKey] : null);

      if (Array.isArray(rawList) && rawList.length > 0) {
        if (data.action === "subscribe" || !data.action) {
          if (data.reset !== false) {
            ws.subscribedKeys.clear();
          }

          const addedSymbols = [];
          rawList.forEach((item) => {
            const key = resolveInstrumentKey(item);
            if (key) {
              ws.subscribedKeys.add(key);
              addedSymbols.push(stockMap.get(key)?.symbol || item);
            }
          });

          console.log(`🎯 [WS 4141] Client subscribed to ${addedSymbols.length} stock(s): ${addedSymbols.join(", ")}`);

          // Forward subscription to Upstox API feed for newly demanded keys
          const newKeys = addedSymbols
            .map(sym => { for (const [k,v] of stockMap.entries()) if (v.symbol === sym) return k; return null; })
            .filter(Boolean);
          if (newKeys.length > 0 && upstoxWs && upstoxWs.readyState === WebSocket.OPEN) {
            upstoxWs.send(Buffer.from(JSON.stringify({
              guid: `dyn_sub_${Date.now()}`,
              method: "sub",
              data: { mode: "full", instrumentKeys: newKeys }
            })));
          }

          // Send current cached ticks immediately
          ws.subscribedKeys.forEach((key) => {
            if (latestTicks.has(key)) {
              ws.send(JSON.stringify(latestTicks.get(key)));
            }
          });

        } else if (data.action === "unsubscribe") {
          const removedSymbols = [];
          const releaseKeys = [];
          rawList.forEach((item) => {
            const key = resolveInstrumentKey(item);
            if (key && ws.subscribedKeys.has(key)) {
              ws.subscribedKeys.delete(key);
              releaseKeys.push(key);
              removedSymbols.push(stockMap.get(key)?.symbol || item);
            }
          });

          if (removedSymbols.length > 0) {
            console.log(`📴 [WS 4141] Client unsubscribed from: ${removedSymbols.join(", ")}`);
          }

          // Check if any key is no longer watched by ANY connected client
          const stillWatched = new Set();
          wss.clients.forEach(c => { if (c !== ws) c.subscribedKeys?.forEach(k => stillWatched.add(k)); });
          const toUnsub = releaseKeys.filter(k => !stillWatched.has(k));

          if (toUnsub.length > 0) {
            // Remove from latestTicks cache
            toUnsub.forEach(k => latestTicks.delete(k));
            // Forward unsubscription to Upstox API feed
            if (upstoxWs && upstoxWs.readyState === WebSocket.OPEN) {
              upstoxWs.send(Buffer.from(JSON.stringify({
                guid: `dyn_unsub_${Date.now()}`,
                method: "unsub",
                data: { mode: "ltpc", instrumentKeys: toUnsub }
              })));
              console.log(`📴 [Upstox API] Unsubscribed: ${toUnsub.join(", ")}`);
            }
          }
        }
      }
    } catch (err) {}
  });

  ws.on("close", () => {
    console.log(`🔌 [WS 4141] Client disconnected. Releasing ${ws.subscribedKeys.size} tracked stocks...`);
    
    // Check if any key is no longer watched by ANY connected client
    const stillWatched = new Set();
    wss.clients.forEach(c => { if (c !== ws) c.subscribedKeys?.forEach(k => stillWatched.add(k)); });
    
    const toUnsub = [...ws.subscribedKeys].filter(k => !stillWatched.has(k));
    
    if (toUnsub.length > 0) {
      toUnsub.forEach(k => latestTicks.delete(k));
      if (upstoxWs && upstoxWs.readyState === WebSocket.OPEN) {
        upstoxWs.send(Buffer.from(JSON.stringify({
          guid: `dyn_unsub_cleanup_${Date.now()}`,
          method: "unsub",
          data: { mode: "ltpc", instrumentKeys: toUnsub }
        })));
        console.log(`🧹 [Upstox API] Cleaned up zombie subscriptions: ${toUnsub.length} stocks`);
      }
    }
  });
});

/**
 * HTTP GET Endpoint: http://localhost:4141/:symbol
 * Returns latest JSON snapshot of requested stock
 */


// Load Protobuf Schema
async function initProtobuf() {
  const root = await protobuf.load("sudo.proto");
  FeedResponseProto = root.lookupType("com.upstox.marketdatafeeder.rpc.proto.FeedResponse");
}

async function getMarketFeedUrl() {
  try {
    const response = await axios.get(
      "https://api.upstox.com/v3/feed/market-data-feed/authorize",
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          Accept: "application/json"
        },
        timeout: 10000
      }
    );
    return response.data.data.authorizedRedirectUri;
  } catch (error) {
    console.error("❌ Authorization Error:", error.response?.data || error.message);
    throw error;
  }
}

async function startUpstoxFeed() {
  try {
    const jsonFile = process.env.SUBSCRIPTIONS_FILE || process.argv[2] || "subscriptions.json";
    loadSubscriptions(jsonFile);

    await initProtobuf();
    const wsUrl = await getMarketFeedUrl();
    console.log("🔑 Got Authorized Upstox Feed URL");

    upstoxWs = new WebSocket(wsUrl);

    upstoxWs.on("open", () => {
      console.log("⚡ Connected to Upstox Market Data Feed!");

      // Only subscribe to stocks currently demanded by active WebSocket clients
      const activeKeys = new Set();
      wss.clients.forEach(c => c.subscribedKeys?.forEach(k => activeKeys.add(k)));
      const keysToSub = Array.from(activeKeys);

      const CHUNK_SIZE = 500;
      for (let i = 0; i < keysToSub.length; i += CHUNK_SIZE) {
        const batchKeys = keysToSub.slice(i, i + CHUNK_SIZE);
        const subscribePayload = {
          guid: `req_sub_${Math.floor(i / CHUNK_SIZE) + 1}`,
          method: "sub",
          data: {
            mode: "full",
            instrumentKeys: batchKeys
          }
        };

        upstoxWs.send(Buffer.from(JSON.stringify(subscribePayload)));
        console.log(`📡 Subscribed Upstox Feed batch ${Math.floor(i / CHUNK_SIZE) + 1} (${batchKeys.length} active stocks)`);
      }
    });

    upstoxWs.on("message", (data) => {
      try {
        const decodedMessage = FeedResponseProto.decode(data);
        const parsedData = FeedResponseProto.toObject(decodedMessage, {
          longs: String,
          enums: String,
          bytes: String
        });

        if (parsedData.feeds && Object.keys(parsedData.feeds).length > 0) {
          for (const [instrumentKey, feedData] of Object.entries(parsedData.feeds)) {
            const stockInfo = stockMap.get(instrumentKey) || { symbol: instrumentKey, name: instrumentKey };

            const marketFF = feedData.ff?.marketFF || feedData.fullFeed?.marketFF || feedData.marketFF;
            const ltpData = marketFF?.ltpc || feedData.ltpc;
            const ohlc = marketFF?.marketOHLC?.ohlc?.find(o => o.interval === "1d");
            const eFeed = marketFF?.eFeedDetails;

            if (!global._eFeedLogged && eFeed) {
              console.log("\n=== eFeedDetails ===", JSON.stringify(eFeed));
              global._eFeedLogged = true;
            }
            if (!global._eFeedMissingLogged && !eFeed) {
              console.log("\n⚠️ eFeedDetails is MISSING from this tick");
              global._eFeedMissingLogged = true;
            }

            const ltp = ltpData?.ltp;
            const cp = ltpData?.cp;

            if (ltp) {
              // Parse bid levels from bidAskQuote
              const bidAskQuote = marketFF?.marketLevel?.bidAskQuote || [];
              const bids = [];
              const asks = [];

              if (Array.isArray(bidAskQuote)) {
                bidAskQuote.forEach(quote => {
                  if (quote.bq !== undefined && quote.bp !== undefined && quote.bp > 0) {
                    bids.push({
                      price: parseFloat(quote.bp),
                      qty: parseInt(quote.bq, 10),
                      orders: parseInt(quote.bno || 0, 10)
                    });
                  }
                  if (quote.aq !== undefined && quote.ap !== undefined && quote.ap > 0) {
                    asks.push({
                      price: parseFloat(quote.ap),
                      qty: parseInt(quote.aq, 10),
                      orders: parseInt(quote.ano || 0, 10)
                    });
                  }
                });
              }

              // If Upstox doesn't send ask levels, derive best ask from:
              // 1. eFeedDetails.tsq (total sell quantity) for OBI
              // 2. Spread: bestAsk = bestBid + 0.05 (NSE tick for large caps)
              const totalBidQty = eFeed?.tbq || bids.reduce((s, b) => s + b.qty, 0);
              const totalAskQty = eFeed?.tsq || asks.reduce((s, a) => s + a.qty, 0);

              if (asks.length === 0 && bids.length > 0) {
                // Synthesize best ask from best bid + 1 tick (₹0.05 for >₹100 stocks)
                const tick = ltp >= 100 ? 0.05 : 0.01;
                const askQtyEstimate = totalAskQty > 0 ? Math.round(totalAskQty / 5) : bids[0].qty;
                asks.push({
                  price: parseFloat((bids[0].price + tick).toFixed(2)),
                  qty: askQtyEstimate,
                  orders: 1
                });
              }

              const tickPayload = {
                type: "LIVE_TICK",
                symbol: stockInfo.symbol,
                name: stockInfo.name,
                instrument_key: instrumentKey,
                ltp: ltp,
                prev_close: cp || null,
                open: ohlc?.open || null,
                high: ohlc?.high || null,
                low: ohlc?.low || null,
                close: ohlc?.close || null,
                bids: bids,
                asks: asks,
                total_bid_qty: totalBidQty,   // from eFeedDetails.tbq — accurate for OBI
                total_ask_qty: totalAskQty,   // from eFeedDetails.tsq — accurate for OBI
                atp: eFeed?.atp || null,       // avg trade price
                volume: eFeed?.vtt || null,    // volume traded today
                timestamp: new Date().toISOString()
              };

              latestTicks.set(instrumentKey, tickPayload);

              const topBid = bids.length > 0 ? `${bids[0].qty}@₹${bids[0].price}` : 'N/A';
              const topAsk = asks.length > 0 ? `${asks[0].qty}@₹${asks[0].price}` : 'N/A';
              console.log(`🟢 ${stockInfo.symbol}: ₹${ltp} | Bid: ${topBid} | Ask: ${topAsk} | Time: ${new Date().toLocaleTimeString()}`);

              // Broadcast to connected clients subscribed to this stock
              wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                  if (client.subscribedKeys && client.subscribedKeys.has(instrumentKey)) {
                    client.send(JSON.stringify(tickPayload));
                  }
                }
              });
            }
          }
        }
      } catch (err) {
        // Ignore non-proto frames (e.g. handshake/control messages)
      }
    });

    upstoxWs.on("error", (err) => {
      console.error("❌ Upstox WS Error:", err.message);
    });

    upstoxWs.on("close", (code, reason) => {
      console.log(`🔌 Upstox WS Disconnected (Code: ${code}, Reason: ${reason || "None"}). Retrying in 5s...`);
      setTimeout(startUpstoxFeed, 5000);
    });

  } catch (error) {
    console.error("❌ Failed to start Upstox WebSocket stream:", error.message);
  }
}

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log("📦 Connected to MongoDB");
    const tokenDoc = await Token.findOne({ name: "upstox_access" });
    if (!tokenDoc || !tokenDoc.access_token) {
      console.error("❌ Upstox access token missing in MongoDB. Please run login.js first.");
      process.exit(1);
    }
    ACCESS_TOKEN = tokenDoc.access_token;

    server.listen(PORT, () => {
      console.log(`🚀 Live Stock WebSocket & JSON Server listening on port ${PORT}`);
      console.log(`👉 WebSocket Out Connection: ws://localhost:${PORT}`);
      // console.log(`👉 HTTP GET snapshot at: http://localhost:${PORT}/RELIANCE`);
      startUpstoxFeed();
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });
