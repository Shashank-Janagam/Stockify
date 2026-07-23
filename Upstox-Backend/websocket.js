import fs from "fs";
import path from "path";
import axios from "axios";
import { WebSocketServer, WebSocket } from "ws";
import protobuf from "protobufjs";
import dotenv from "dotenv";
import express from "express";
import http from "http";

dotenv.config();

const ACCESS_TOKEN = process.env.UPSTOX_ACCESS;

if (!ACCESS_TOKEN) {
  console.error("❌ UPSTOX_ACCESS token missing in .env file");
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
              data: { mode: "ltpc", instrumentKeys: newKeys }
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
app.get("/:symbol", (req, res) => {
  const query = req.params.symbol;
  const instrumentKey = resolveInstrumentKey(query);

  if (!instrumentKey) {
    return res.status(404).json({
      success: false,
      error: `Stock '${query}' not found in subscriptions list.`
    });
  }

  if (latestTicks.has(instrumentKey)) {
    return res.json({
      success: true,
      data: latestTicks.get(instrumentKey)
    });
  } else {
    const stockInfo = stockMap.get(instrumentKey) || {};
    return res.json({
      success: true,
      status: "waiting_for_tick",
      symbol: stockInfo.symbol || query,
      name: stockInfo.name || query,
      instrument_key: instrumentKey,
      message: "Stock subscribed. Waiting for live tick frame from Upstox feed..."
    });
  }
});

// Load Protobuf Schema
async function initProtobuf() {
  const root = await protobuf.load("MarketDataFeed.proto");
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
            mode: "ltpc",
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

            const marketFF = feedData.fullFeed?.marketFF || feedData.fullFeed?.marketFF2;
            const ltpData = marketFF?.ltpc || feedData.ltpc;
            const ohlc = marketFF?.marketOHLC;

            const ltp = ltpData?.ltp;
            const cp = ltpData?.cp;

            if (ltp) {
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
                timestamp: new Date().toISOString(),
                raw_feed: feedData
              };

              latestTicks.set(instrumentKey, tickPayload);

              // Console Log
              console.log(`🟢 ${stockInfo.symbol}: ₹${ltp} | Prev Close: ₹${cp || "N/A"} | Time: ${new Date().toLocaleTimeString()}`);

              // Broadcast live tick to connected WebSocket clients subscribed to this stock
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
        // Ignore non-proto frames
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

server.listen(PORT, () => {
  console.log(`🚀 Live Stock WebSocket & JSON Server listening on port ${PORT}`);
  console.log(`👉 WebSocket Out Connection: ws://localhost:${PORT}`);
  console.log(`👉 HTTP GET snapshot at: http://localhost:${PORT}/RELIANCE`);
  startUpstoxFeed();
});
