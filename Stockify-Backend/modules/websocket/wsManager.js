
import { WebSocketServer } from "ws";
import admin from "../../Middleware/admin.js";
import { getYahooIndiaHistory } from "../stocks/yahooIndiaHistory.service.js";
import { getYahooIndiaQuote } from "../stocks/yahooIndiaQuote.service.js";
import { MultiStockYahoo } from "../stocks/multiStockIndia.js";
import { getDb } from "../../db/mongo.js";
import { db } from "../../db/sql.js";
import { getNSETopGainers, getNSETopLosers } from "../stocks/multiCurrentMovers.js";
import { upstoxFeedService } from "./upstoxFeed.service.js";
// We'll need these from holdings.js, so we should export them there or duplicate/refactor
// For speed, let's assume we can refactor holdings.js to export its logic

let holdingsService = null;

export function setHoldingsService(service) {
  holdingsService = service;
}

export  class WebSocketManager {
  constructor(server) {
    this.wss = new WebSocketServer({ server, path: "/api" });
    this.clients = new Map();
    this.exploreSubscribers = new Set();
    this.exploreInterval = null;
    this.lastExploreData = null;
    // Tracks currently-subscribed Upstox symbols for the Explore feed
    this.exploreSymbolsActive = new Set();

    // Indices shared broadcast
    this.indicesSubscribers = new Set();
    this.indicesInterval = null;
    this.lastIndicesData = null;
    this.INDICES = [
      { symbol: "^NSEI",             label: "NIFTY 50" },
      { symbol: "^BSESN",            label: "SENSEX" },
      { symbol: "^NSEBANK",          label: "BANKNIFTY" },
      { symbol: "NIFTY_MIDCAP_100.NS", label: "MIDCPNIFTY" },
      { symbol: "NIFTY_FIN_SERVICE.NS", label: "FINNIFTY" },
    ];

    const heartbeat = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    this.wss.on("connection", (ws, req) => {
      console.log("🟢 WS client connected");
      ws.isAlive = true;
      ws.on("pong", () => { ws.isAlive = true; });

      const cookies = this.parseCookies(req.headers.cookie || "");
      this.clients.set(ws, { 
        subscriptions: new Map(), 
        userId: null, 
        token: null,
        authPromise: null,
        cookies 
      });

      ws.on("message", (message) => this.handleMessage(ws, message));
      ws.on("close", () => {
        console.log("🔴 WS client disconnected");
        this.cleanupClient(ws);
      });
    });

    this.wss.on("close", () => {
      clearInterval(heartbeat);
    });
  }

  parseCookies(cookieStr) {
    const cookies = {};
    cookieStr.split(";").forEach((cookie) => {
      const parts = cookie.split("=");
      if (parts.length === 2) {
        cookies[parts[0].trim()] = parts[1].trim();
      }
    });
    return cookies;
  }

  async handleMessage(ws, message) {
    try {
      const data = JSON.parse(message);
      const { type, topic, ...params } = data;

      switch (type) {
        case "SUBSCRIBE":
          await this.subscribe(ws, topic, params);
          break;
        case "UNSUBSCRIBE":
          this.unsubscribe(ws, topic, params);
          break;
        case "PING":
          ws.send(JSON.stringify({ type: "PONG" }));
          break;
      }
    } catch (err) {
      console.error("WS Message Error:", err);
    }
  }

  async subscribe(ws, topic, params) {
    const client = this.clients.get(ws);
    if (!client) return;

    // Verify token if needed
    if (params.token) {
      if (client.authPromise) {
        try {
          await client.authPromise;
        } catch (err) {
          // Promise failed, let switch handle or return
        }
      } else if (!client.userId) {
        client.authPromise = (async () => {
          const decoded = await admin.auth().verifyIdToken(params.token);
          client.userId = decoded.uid;
          client.token = params.token;
          
          // Resolve SQL userId
          const userRes = await db.query(`SELECT id FROM users WHERE uid=$1`, [decoded.uid]);
          if (userRes.rows.length > 0) {
              client.sqlUserId = userRes.rows[0].id;
          }
        })();

        try {
          await client.authPromise;
        } catch (err) {
          console.error("WS Auth Error:", err);
          ws.send(JSON.stringify({ type: "ERROR", message: "Unauthorized" }));
          return;
        } finally {
          client.authPromise = null;
        }
      }
    }

    const symbolKey = typeof params?.symbol === 'string' ? params.symbol : "";
    const subKey = `${topic}:${symbolKey}`;
    if (client.subscriptions.has(subKey)) return;

    console.log(`📡 Subscribing to ${topic} ${params.symbol || ""}`);

    let interval;
    switch (topic) {
      case "STOCK_LIVE":
        interval = this.startStockLive(ws, params.symbol);
        break;
      case "EXPLORE_LIVE":
        this.startExploreLive(ws);
        break;
      case "RECENT_LIVE":
        interval = this.startRecentLive(ws, client);
        break;
      case "HOLDINGS_LIVE":
        interval = this.startHoldingsLive(ws, client);
        break;
      case "POSITIONS_LIVE":
        interval = this.startPositionsLive(ws, client);
        break;
      case "REPLAY_LIVE":
        interval = this.startReplayLive(ws, params.symbol, params.speed);
        break;
      case "INDICES_LIVE":
        this.startIndicesLive(ws);
        break;
    }

    if (interval) {
      client.subscriptions.set(subKey, interval);
    }
  }

  unsubscribe(ws, topic, params) {
    const client = this.clients.get(ws);
    if (!client) return;

    const symbolKey = typeof params?.symbol === 'string' ? params.symbol : "";
    const subKey = `${topic}:${symbolKey}`;
    
    console.log(`[WS DEBUG] Attempting to unsubscribe from subKey: ${subKey}`);

    if (client.subscriptions.has(subKey)) {
      if (topic === "EXPLORE_LIVE") {
        console.log(`[WS DEBUG] EXPLORE_LIVE exact match. Deleting from exploreSubscribers...`);
        this.exploreSubscribers.delete(ws);
        console.log(`[WS DEBUG] exploreSubscribers size is now: ${this.exploreSubscribers.size}`);
        
        if (this.exploreSubscribers.size === 0) {
          console.log(`[WS DEBUG] No more explore subscribers. Clearing intervals and unsubscribing from Upstox API.`);
          if (this.exploreInterval) { clearInterval(this.exploreInterval); this.exploreInterval = null; }
          // Unsubscribe all explore symbols from Upstox when nobody is watching
          upstoxFeedService.unsubscribe([...this.exploreSymbolsActive]);
          this.exploreSymbolsActive.clear();
        }
      } else if (topic === "INDICES_LIVE") {
        this.indicesSubscribers.delete(ws);
        if (this.indicesSubscribers.size === 0) {
          if (this.indicesInterval) { clearInterval(this.indicesInterval); this.indicesInterval = null; }
          // Unsubscribe index symbols from Upstox when nobody is watching
          upstoxFeedService.unsubscribe(this.INDICES.map(i => i.symbol));
        }
      } else {
        const handle = client.subscriptions.get(subKey);
        if (typeof handle === "function") handle();
        else clearInterval(handle);
      }
      client.subscriptions.delete(subKey);
      console.log(`🔕 Unsubscribed from ${subKey}`);
    }
  }

  cleanupClient(ws) {
    const client = this.clients.get(ws);
    if (client) {
      client.subscriptions.forEach((interval, subKey) => {
        if (subKey.startsWith("EXPLORE_LIVE")) {
            this.exploreSubscribers.delete(ws);
        } else if (subKey.startsWith("INDICES_LIVE")) {
            this.indicesSubscribers.delete(ws);
        } else {
            if (typeof interval === "function") interval();
            else clearInterval(interval);
        }
      });

      if (this.exploreSubscribers.size === 0) {
        if (this.exploreInterval) { clearInterval(this.exploreInterval); this.exploreInterval = null; }
        upstoxFeedService.unsubscribe([...this.exploreSymbolsActive]);
        this.exploreSymbolsActive.clear();
      }
      if (this.indicesSubscribers.size === 0) {
        if (this.indicesInterval) { clearInterval(this.indicesInterval); this.indicesInterval = null; }
        upstoxFeedService.unsubscribe(this.INDICES.map(i => i.symbol));
      }
    }
    this.clients.delete(ws);
  }

  // --- Topic Implementations ---

  startStockLive(ws, symbol) {
    upstoxFeedService.subscribe([symbol]);

    // Cache the full Yahoo quote (fundamentals) — refresh every 1 minute
    let cachedYahooQuote = null;
    let lastYahooFetch = 0;
    const YAHOO_TTL_MS = 1 * 1000*120; // 1 minute

    const fetchYahooQuote = async () => {
      const now = Date.now();
      if (!cachedYahooQuote || now - lastYahooFetch > YAHOO_TTL_MS) {
        try {
          cachedYahooQuote = await getYahooIndiaQuote(symbol);
          lastYahooFetch = now;
        } catch (err) {
          // Keep stale cache on error
          console.error("WS Yahoo quote fetch error:", err.message);
        }
      }
      return cachedYahooQuote;
    };

    const sendUpdate = async () => {
      try {
        const [candlesRaw, yahooQuote] = await Promise.all([
          getYahooIndiaHistory(symbol, 1),
          fetchYahooQuote()
        ]);
        const candles = candlesRaw.map(d => ({ x: d.x, c: d.c }));

        const upstoxTick = upstoxFeedService.getTick(symbol);
        let quote;

        if (upstoxTick) {
          // Merge: start with full Yahoo quote for fundamentals,
          // then overlay live Upstox price fields so fundamentals are never missing
          quote = {
            ...(yahooQuote || {}),
            symbol: symbol.endsWith(".NS") ? symbol : `${symbol}.NS`,
            shortName: upstoxTick.name || yahooQuote?.shortName,
            longName: upstoxTick.name || yahooQuote?.longName,
            regularMarketPrice: upstoxTick.price || yahooQuote?.regularMarketPrice,
            regularMarketChange: upstoxTick.change || yahooQuote?.regularMarketChange,
            regularMarketChangePercent: upstoxTick.percent || yahooQuote?.regularMarketChangePercent,
            regularMarketPreviousClose: upstoxTick.prev_close || yahooQuote?.regularMarketPreviousClose,
            regularMarketOpen: upstoxTick.open || yahooQuote?.regularMarketOpen,
            regularMarketDayHigh: upstoxTick.high || yahooQuote?.regularMarketDayHigh,
            regularMarketDayLow: upstoxTick.low || yahooQuote?.regularMarketDayLow,
            marketState: "REGULAR"
          };
        } else {
          // Upstox not available — use Yahoo quote directly
          quote = yahooQuote;
        }

        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: "STOCK_UPDATE",
            symbol,
            data: { candles, quote }
          }));
        }
      } catch (err) {
        console.error("WS Stock Update Error:", err);
      }
    };

    sendUpdate();

    // Event-driven: push to frontend on every Upstox tick for this symbol
    const cleanSym = symbol.replace(/\.NS$/, "").toUpperCase();
    const removeListener = upstoxFeedService.onTick((tick) => {
      if (tick.symbol === cleanSym && ws.readyState === ws.OPEN) {
        sendUpdate();
      }
    });

    // Fallback polling if Upstox is offline
    let fallbackInterval = null;
    if (!upstoxFeedService.isConnected) {
      fallbackInterval = setInterval(sendUpdate, 1500);
    }

    return () => {
      removeListener();
      if (fallbackInterval) clearInterval(fallbackInterval);
      // Release the Upstox subscription when this client leaves
      upstoxFeedService.unsubscribe([symbol]);
    };
  }

  async startExploreLive(ws) {
    const client = this.clients.get(ws);
    if (!client) return;

    this.exploreSubscribers.add(ws);
    client.subscriptions.set("EXPLORE_LIVE:", true); // Mark as subscribed

    // Send cached data immediately if available
    if (this.lastExploreData) {
        ws.send(JSON.stringify({
            type: "EXPLORE_UPDATE",
            data: this.lastExploreData
        }));
    }

    if (this.exploreInterval) return;

    const mostTradedList = ["HDFCBANK.NS", "TCS.NS", "INFY.NS", "ITC.NS"];

    const sendUpdate = async () => {
      try {
        if (this.exploreSubscribers.size === 0) {
          clearInterval(this.exploreInterval);
          this.exploreInterval = null;
          return;
        }

        const moversList = await getNSETopGainers();
        const losersList = await getNSETopLosers();

        // If the last client unsubscribed while we were waiting for the API, abort immediately!
        if (this.exploreSubscribers.size === 0) return;

        // Diff subscribe: subscribe only newly-needed symbols, unsubscribe stale ones
        const neededNow = new Set([...mostTradedList, ...moversList, ...losersList]
          .map(s => s.replace(/\.NS$/, "").toUpperCase()));
        const toAdd = [...neededNow].filter(s => !this.exploreSymbolsActive.has(s));
        const toRemove = [...this.exploreSymbolsActive].filter(s => !neededNow.has(s));
        if (toAdd.length > 0) upstoxFeedService.subscribe(toAdd);
        if (toRemove.length > 0) upstoxFeedService.unsubscribe(toRemove);
        this.exploreSymbolsActive = neededNow;

        const fetchListWithUpstox = (symList) => {
          return symList.map(sym => {
            const clean = sym.replace(/\.NS$/, "").toUpperCase();
            const tick = upstoxFeedService.getTick(clean);
            const formattedSymbol = (sym.endsWith(".NS") || sym.endsWith(".BO") || sym.startsWith("^"))
              ? sym
              : `${sym}.NS`;
            return {
              symbol: formattedSymbol,
              name: tick?.name || clean,
              price: tick?.price ?? null,
              change: tick?.change ?? 0,
              percent: tick?.percent ?? 0,
              marketState: "REGULAR",
              volume: null
            };
          });
        };

        const mostTraded = fetchListWithUpstox(mostTradedList);
        const movers = fetchListWithUpstox(moversList);
        const losers = fetchListWithUpstox(losersList);

        this.lastExploreData = { mostTraded, movers, losers };
        const payload = JSON.stringify({ type: "EXPLORE_UPDATE", data: this.lastExploreData });
        this.exploreSubscribers.forEach(sub => {
          if (sub.readyState === sub.OPEN) sub.send(payload);
        });
      } catch (err) {
        console.error("WS Explore Shared Update Error:", err);
      }
    };

    this.exploreInterval = setInterval(sendUpdate, 2000);
    sendUpdate();
  }

  async startIndicesLive(ws) {
    const client = this.clients.get(ws);
    if (!client) return;

    this.indicesSubscribers.add(ws);
    client.subscriptions.set("INDICES_LIVE:", true);

    // Send cached data immediately
    if (this.lastIndicesData) {
      ws.send(JSON.stringify({ type: "INDICES_UPDATE", data: this.lastIndicesData }));
    }

    if (this.indicesInterval) return;

    // Subscribe once to all index symbols — released when last subscriber leaves
    upstoxFeedService.subscribe(this.INDICES.map(i => i.symbol));

    const sendUpdate = () => {
      try {
        if (this.indicesSubscribers.size === 0) {
          if (this.indicesInterval) { clearInterval(this.indicesInterval); this.indicesInterval = null; }
          return;
        }
        const mapped = this.INDICES.map(idx => {
          const tick = upstoxFeedService.getTick(idx.symbol);
          return {
            symbol: idx.symbol,
            label: idx.label,
            price: tick?.price ?? null,
            change: tick?.change ?? 0,
            percent: tick?.percent ?? 0,
          };
        });
        this.lastIndicesData = mapped;
        const payload = JSON.stringify({ type: "INDICES_UPDATE", data: mapped });
        this.indicesSubscribers.forEach(sub => {
          if (sub.readyState === sub.OPEN) sub.send(payload);
        });
      } catch (err) {
        console.error("WS Indices Update Error:", err);
      }
    };

    this.indicesInterval = setInterval(sendUpdate, 1000);
    sendUpdate();
  }

  startRecentLive(ws, client) {
    if (!client.userId) return null;

    // Track which symbols this client has subscribed to Upstox
    client.recentUpstoxSymbols = new Set();
    let timerId = null;

    const sendUpdate = async () => {
      try {
        const dbMongo = getDb();
        const users = dbMongo.collection("users");
        const user = await users.findOne({ _id: client.userId }, { projection: { recentlyViewed: 1 } });
        const recentlyViewed = user?.recentlyViewed || [];

        let investedSymbols = [];
        if (client.sqlUserId) {
          const { rows: investedRows } = await db.query(
            `SELECT symbol FROM positions p JOIN stocks s ON p.stock_id = s.id WHERE p.user_id = $1 AND p.status = 'OPEN' GROUP BY s.symbol HAVING SUM(p.remaining_quantity) > 0`,
            [client.sqlUserId]
          );
          investedSymbols = investedRows.map(r => r.symbol);
        }

        const recentSymbols = recentlyViewed.map(r => r.symbol);
        const allSymbols = [...new Set([...recentSymbols, ...investedSymbols])];

        if (allSymbols.length === 0) {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: "RECENT_UPDATE", data: { recentlyViewed: [], invested: [] } }));
          }
          return;
        }

        // Diff: subscribe new symbols only, unsubscribe stale ones
        const neededNow = new Set(allSymbols.map(s => s.replace(/\.NS$/, "").toUpperCase()));
        const toAdd = [...neededNow].filter(s => !client.recentUpstoxSymbols.has(s));
        const toRemove = [...client.recentUpstoxSymbols].filter(s => !neededNow.has(s));
        if (toAdd.length > 0) upstoxFeedService.subscribe(toAdd);
        if (toRemove.length > 0) upstoxFeedService.unsubscribe(toRemove);
        client.recentUpstoxSymbols = neededNow;

        const quotes = await (async () => {
          const upstoxQuotes = [];
          const missing = [];
          allSymbols.forEach(sym => {
            const tick = upstoxFeedService.getTick(sym);
            if (tick) {
              upstoxQuotes.push({
                symbol: sym,
                name: tick.name,
                price: tick.price,
                change: tick.change,
                percent: tick.percent,
                marketState: "REGULAR"
              });
            } else {
              missing.push(sym);
            }
          });
          if (missing.length > 0) {
            const yahooQuotes = await MultiStockYahoo(missing);
            return [...upstoxQuotes, ...yahooQuotes];
          }
          return upstoxQuotes;
        })();

        const recentQuotes = quotes.filter(q => recentSymbols.includes(q.symbol));
        const investedQuotes = quotes.filter(q => investedSymbols.includes(q.symbol));

        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: "RECENT_UPDATE",
            data: { recentlyViewed: recentQuotes, invested: investedQuotes }
          }));
        }
      } catch (err) {
        console.error("WS Recent Update Error:", err);
      }
    };

    timerId = setInterval(sendUpdate, 2500);
    sendUpdate();

    // Cleanup function: release Upstox subscriptions when this client disconnects
    return () => {
      clearInterval(timerId);
      if (client.recentUpstoxSymbols?.size > 0) {
        upstoxFeedService.unsubscribe([...client.recentUpstoxSymbols]);
        client.recentUpstoxSymbols.clear();
      }
    };
  }

  startHoldingsLive(ws, client) {
    if (!holdingsService) return null;

    let timerId = null;

    const sendUpdate = async () => {
      try {
        if (!client.sqlUserId) return;
        const holdings = await holdingsService.fetchHoldings(client.sqlUserId);
        const payload = await holdingsService.computeHoldingsPayload(holdings, client.sqlUserId);

        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: "HOLDINGS_UPDATE",
            data: payload
          }));
        }

        if (payload.isMarketClosed) {
          if (timerId) {
            clearInterval(timerId);
            const subKey = `HOLDINGS_LIVE:${JSON.stringify("")}`;
            client.subscriptions.delete(subKey);
          }
        }
      } catch (err) {
        console.error("WS Holdings Update Error:", err);
      }
    };

    timerId = setInterval(sendUpdate, 4000);
    sendUpdate();
    return timerId;
  }

  startPositionsLive(ws, client) {
    if (!holdingsService) return null;

    let timerId = null;

    const sendUpdate = async () => {
      try {
        if (!client.sqlUserId) return;
        const lots = await holdingsService.fetchDetailedPositions(client.sqlUserId);
        const payload = await holdingsService.computePositionsPayload(lots, client.sqlUserId);

        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: "POSITIONS_UPDATE",
            data: payload
          }));
        }

        if (payload.isMarketClosed) {
          if (timerId) {
            clearInterval(timerId);
            const subKey = `POSITIONS_LIVE:${JSON.stringify("")}`;
            client.subscriptions.delete(subKey);
          }
        }
      } catch (err) {
        console.error("WS Positions Update Error:", err);
      }
    };

    timerId = setInterval(sendUpdate, 4000);
    sendUpdate();
    return timerId;
  }

  startReplayLive(ws, symbol, speed = 1000) {
    let index = 0;
    let candles = [];

    const init = async () => {
      candles = await getYahooIndiaHistory(symbol, 1);
    };

    const interval = setInterval(() => {
        if (!candles.length) return;
        if (index >= candles.length) {
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ type: "REPLAY_END", symbol }));
            }
            clearInterval(interval);
            return;
        }

        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
                type: "REPLAY_UPDATE",
                symbol,
                data: { candle: candles[index] }
            }));
        }
        index++;
    }, speed);

    init();
    return interval;
  }
}
