
import { WebSocketServer } from "ws";
import admin from "../../Middleware/admin.js";
import { getYahooIndiaHistory } from "../stocks/yahooIndiaHistory.service.js";
import { getYahooIndiaQuote } from "../stocks/yahooIndiaQuote.service.js";
import { MultiStockYahoo } from "../stocks/multiStockIndia.js";
import { getDb } from "../../db/mongo.js";
import { db } from "../../db/sql.js";
import { getNSETopGainers, getNSETopLosers } from "../stocks/multiCurrentMovers.js";
import { upstoxFeedService } from "./upstoxFeed.service.js";
import Redis from "ioredis";

// We'll need these from holdings.js, so we should export them there or duplicate/refactor
// For speed, let's assume we can refactor holdings.js to export its logic

let holdingsService = null;

export function setHoldingsService(service) {
  holdingsService = service;
}

export  class WebSocketManager {
  constructor(server) {
    this.wss = new WebSocketServer({ noServer: true });
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
      { symbol: "^NSEI",                   label: "NIFTY 50" },
      { symbol: "^BSESN",                  label: "SENSEX" },
      { symbol: "^NSEBANK",                label: "BANKNIFTY" },
      { symbol: "NIFTY_FIN_SERVICE.NS",    label: "FINNIFTY" },
      { symbol: "NIFTY_MIDCAP_100.NS",     label: "MIDCPNIFTY" },
    ];

    try {
      this.redisSub = new Redis(process.env.REDIS_URL);
      this.redisSub.subscribe("ORDER_EXECUTED");
      this.redisSub.on("message", (channel, message) => {
        if (channel === "ORDER_EXECUTED") {
          try {
            const data = JSON.parse(message);
            const { userId, symbol, stockName, category, isStoploss, side, quantity, price, orderId, tradeId, orderType } = data;
            const stoplossTriggered = isStoploss === true || (category && String(category).toUpperCase() === "STOPLOSS");

            this.clients.forEach((client, ws) => {
              if (String(client.sqlUserId) === String(userId) || String(client.userId) === String(userId)) {
                if (ws.readyState === ws.OPEN) {
                  ws.send(JSON.stringify({
                    type: "ORDER_EXECUTED",
                    symbol,
                    stockName: stockName || data.name || symbol,
                    category: category || "REGULAR",
                    isStoploss: !!stoplossTriggered,
                    side,
                    quantity,
                    price,
                    orderId,
                    tradeId,
                    orderType: orderType || "Market",
                    status: "EXECUTED"
                  }));
                }
              }
            });
          } catch (err) {}
        }
      });
    } catch (err) {
      console.error("WS Redis sub error:", err);
    }

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
        interval = this.startStockLive(ws, params.symbol, params.interval);
        break;
      case "EXPLORE_LIVE":
        this.startExploreLive(ws);
        break;
      case "FOLLOWED_LIVE":
        interval = this.startFollowedLive(ws, client);
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

  startStockLive(ws, symbol, customInterval = null) {
    upstoxFeedService.subscribe([symbol]);

    // ── Cached state ──────────────────────────────────────────────────────────
    let cachedYahooQuote = null;
    let cachedCandles    = null;
    let lastYahooFetch   = 0;
    let lastCandleFetch  = 0;
    let heavyReady       = false;
    const YAHOO_TTL_MS   = 120_000; // 2 minutes
    const CANDLE_TTL_MS  = 60_000;  // 1 minute — candles don't change per-tick

    // ── Heavy fetch: Yahoo quote + candles (rate-limited, NOT per-tick) ───────
    const fetchHeavy = async () => {
      const now = Date.now();
      const promises = [];

      if (!cachedYahooQuote || now - lastYahooFetch > YAHOO_TTL_MS) {
        promises.push(
          getYahooIndiaQuote(symbol)
            .then((q) => { cachedYahooQuote = q; lastYahooFetch = Date.now(); })
            .catch(() => {})
        );
      }

      if (!cachedCandles || now - lastCandleFetch > CANDLE_TTL_MS) {
        promises.push(
          getYahooIndiaHistory(symbol, 1, customInterval)
            .then((c) => { cachedCandles = c.map(d => ({ x: d.x, o: d.o, h: d.h, l: d.l, c: d.c })); lastCandleFetch = Date.now(); })
            .catch(() => {})
        );
      }

      if (promises.length > 0) await Promise.all(promises);
      heavyReady = true;
    };

    // ── TICK_PRICE: price-only, tiny payload, fires on every Upstox tick ────────
    // Does NOT send candles — avoids serializing hundreds of candles per second.
    const sendTickUpdate = () => {
      if (ws.readyState !== 1) return; // 1 = WebSocket.OPEN
      try {
        const upstoxTick = upstoxFeedService.getTick(symbol);
        if (!upstoxTick || upstoxTick.price == null) return;
        ws.send(JSON.stringify({
          type: "TICK_PRICE",
          symbol,
          data: {
            price:      upstoxTick.price,
            change:     upstoxTick.change,
            percent:    upstoxTick.percent,
            high:       upstoxTick.high,
            low:        upstoxTick.low,
            open:       upstoxTick.open,
            prev_close: upstoxTick.prev_close,
          },
        }));
      } catch (err) {
        console.error("WS TICK_PRICE Error:", err);
      }
    };

    // ── STOCK_UPDATE: full candles + merged quote — fires on connect + 60s ─────
    const sendFullUpdate = async () => {
      await fetchHeavy();
      if (ws.readyState !== 1) return;
      try {
        const upstoxTick = upstoxFeedService.getTick(symbol);
        const quote = upstoxTick ? {
          ...(cachedYahooQuote || {}),
          symbol: symbol.startsWith("^") ? symbol : (symbol.endsWith(".NS") ? symbol : `${symbol}.NS`),
          shortName: upstoxTick.name || cachedYahooQuote?.shortName,
          longName:  upstoxTick.name || cachedYahooQuote?.longName,
          regularMarketPrice:         upstoxTick.price      ?? cachedYahooQuote?.regularMarketPrice,
          regularMarketChange:        upstoxTick.change     ?? cachedYahooQuote?.regularMarketChange,
          regularMarketChangePercent: upstoxTick.percent    ?? cachedYahooQuote?.regularMarketChangePercent,
          regularMarketPreviousClose: upstoxTick.prev_close ?? cachedYahooQuote?.regularMarketPreviousClose,
          regularMarketOpen:          upstoxTick.open       ?? cachedYahooQuote?.regularMarketOpen,
          regularMarketDayHigh:       upstoxTick.high       ?? cachedYahooQuote?.regularMarketDayHigh,
          regularMarketDayLow:        upstoxTick.low        ?? cachedYahooQuote?.regularMarketDayLow,
          marketState: "REGULAR",
        } : cachedYahooQuote;
        ws.send(JSON.stringify({
          type: "STOCK_UPDATE",
          symbol,
          data: { candles: cachedCandles || [], quote },
        }));
      } catch (err) {
        console.error("WS STOCK_UPDATE Error:", err);
      }
    };

    // Initial full load
    sendFullUpdate();

    // Candle/quote refresh every 60 s (not per tick)
    const refreshInterval = setInterval(sendFullUpdate, 60_000);

    // ── Event-driven: on every live tick just push the price — no remote fetch ─
    const cleanSym = symbol.replace(/\.NS$/, "").toUpperCase();
    const removeListener = upstoxFeedService.onTick((tick) => {
      if (tick.symbol === cleanSym) sendTickUpdate();
    });

    // Fallback polling if Upstox is offline
    let fallbackInterval = null;
    if (!upstoxFeedService.isConnected) {
      fallbackInterval = setInterval(sendFullUpdate, 1500);
    }

    return () => {
      removeListener();
      clearInterval(refreshInterval);
      if (fallbackInterval) clearInterval(fallbackInterval);
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

    this.exploreInterval = setInterval(sendUpdate, 1000);
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

    const sendUpdate = async () => {
      try {
        if (this.indicesSubscribers.size === 0) {
          if (this.indicesInterval) { clearInterval(this.indicesInterval); this.indicesInterval = null; }
          return;
        }
        
        const missing = [];
        let mapped = [];
        
        this.INDICES.forEach(idx => {
          const tick = upstoxFeedService.getTick(idx.symbol);
          if (tick) {
            mapped.push({
              symbol: idx.symbol,
              label: idx.label,
              price: tick.price,
              change: tick.change,
              percent: tick.percent,
            });
          } else {
            missing.push(idx);
          }
        });
        
        if (missing.length > 0) {
            const missingSymbols = missing.map(i => i.symbol);
            const yahooQuotes = await MultiStockYahoo(missingSymbols);
            
            missing.forEach(idx => {
                const yQuote = yahooQuotes.find(q => q.symbol === idx.symbol || q.symbol === idx.symbol + ".NS");
                if (yQuote) {
                    mapped.push({
                        symbol: idx.symbol,
                        label: idx.label,
                        price: yQuote.price,
                        change: yQuote.change,
                        percent: yQuote.percent,
                    });
                } else {
                    mapped.push({
                        symbol: idx.symbol,
                        label: idx.label,
                        price: null,
                        change: 0,
                        percent: 0,
                    });
                }
            });
        }
        
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

  startFollowedLive(ws, client) {
    if (!client.userId) return null;

    // Track which symbols this client has subscribed to Upstox
    client.recentUpstoxSymbols = new Set();
    let timerId = null;

    const sendUpdate = async () => {
      try {
        const dbMongo = getDb();
        const users = dbMongo.collection("users");
        const user = await users.findOne({ _id: client.userId }, { projection: { followedStocks: 1 } });
        const followedStocks = user?.followedStocks || [];

        let investedSymbols = [];
        if (client.sqlUserId) {
          const { rows: investedRows } = await db.query(
            `SELECT symbol FROM positions p JOIN stocks s ON p.stock_id = s.id WHERE p.user_id = $1 AND p.status = 'OPEN' GROUP BY s.symbol HAVING SUM(p.remaining_quantity) > 0`,
            [client.sqlUserId]
          );
          investedSymbols = investedRows.map(r => r.symbol);
        }

        const followedSymbols = followedStocks.map(r => r.symbol);
        const allSymbols = [...new Set([...followedSymbols, ...investedSymbols])];

        if (allSymbols.length === 0) {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: "FOLLOWED_UPDATE", data: { followedData: [], invested: [] } }));
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

        const followedQuotes = quotes.filter(q => followedSymbols.includes(q.symbol));
        const investedQuotes = quotes.filter(q => investedSymbols.includes(q.symbol));

        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: "FOLLOWED_UPDATE",
            data: { followedData: followedQuotes, invested: investedQuotes }
          }));
        }
      } catch (err) {
        console.error("WS Followed Update Error:", err);
      }
    };

    timerId = setInterval(sendUpdate, 1000);
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

    timerId = setInterval(sendUpdate, 1500);
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

    timerId = setInterval(sendUpdate, 1500);
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
