
import { WebSocketServer } from "ws";
import admin from "../../Middleware/admin.js";
import { getYahooIndiaHistory } from "../stocks/yahooIndiaHistory.service.js";
import { getYahooIndiaQuote } from "../stocks/yahooIndiaQuote.service.js";
import { MultiStockYahoo } from "../stocks/multiStockIndia.js";
import { getDb } from "../../db/mongo.js";
import { db } from "../../db/sql.js";
import { getNSETopGainers, getNSETopLosers } from "../stocks/multiCurrentMovers.js";
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
    if (params.token && !client.userId) {
      try {
        const decoded = await admin.auth().verifyIdToken(params.token);
        client.userId = decoded.uid;
        client.token = params.token;
        
        // Resolve SQL userId
        const userRes = await db.query(`SELECT id FROM users WHERE uid=$1`, [decoded.uid]);
        if (userRes.rows.length > 0) {
            client.sqlUserId = userRes.rows[0].id;
        }
      } catch (err) {
        console.error("WS Auth Error:", err);
        ws.send(JSON.stringify({ type: "ERROR", message: "Unauthorized" }));
        return;
      }
    }

    const subKey = `${topic}:${JSON.stringify(params.symbol || "")}`;
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
    }

    if (interval) {
      client.subscriptions.set(subKey, interval);
    }
  }

  unsubscribe(ws, topic, params) {
    const client = this.clients.get(ws);
    if (!client) return;

    const subKey = `${topic}:${JSON.stringify(params.symbol || "")}`;
    if (client.subscriptions.has(subKey)) {
      if (topic === "EXPLORE_LIVE") {
        this.exploreSubscribers.delete(ws);
        if (this.exploreSubscribers.size === 0 && this.exploreInterval) {
          clearInterval(this.exploreInterval);
          this.exploreInterval = null;
        }
      } else {
        clearInterval(client.subscriptions.get(subKey));
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
        } else {
            clearInterval(interval);
        }
      });

      if (this.exploreSubscribers.size === 0 && this.exploreInterval) {
        clearInterval(this.exploreInterval);
        this.exploreInterval = null;
      }
    }
    this.clients.delete(ws);
  }

  // --- Topic Implementations ---

  startStockLive(ws, symbol) {
    const sendUpdate = async () => {
      try {
        const candlesRaw = await getYahooIndiaHistory(symbol, 1);
        const candles = candlesRaw.map(d => ({ x: d.x, c: d.c }));
        const quote = await getYahooIndiaQuote(symbol);

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
    return setInterval(sendUpdate, 1500);
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

        const [mostTraded, movers, losers] = await Promise.all([
          MultiStockYahoo(mostTradedList),
          MultiStockYahoo(moversList),
          MultiStockYahoo(losersList)
        ]);

        this.lastExploreData = { mostTraded, movers, losers };
        const payload = JSON.stringify({
          type: "EXPLORE_UPDATE",
          data: this.lastExploreData
        });

        this.exploreSubscribers.forEach(subscriber => {
          if (subscriber.readyState === subscriber.OPEN) {
            subscriber.send(payload);
          }
        });
      } catch (err) {
        console.error("WS Explore Shared Update Error:", err);
      }
    };

    sendUpdate();
    this.exploreInterval = setInterval(sendUpdate, 5000); // 5 sec shared polling
  }

  startRecentLive(ws, client) {
    if (!client.userId) return null;

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

        const quotes = await MultiStockYahoo(allSymbols);
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

    sendUpdate();
    return setInterval(sendUpdate, 2500);
  }

  startHoldingsLive(ws, client) {
    if (!client.sqlUserId || !holdingsService) return null;

    const sendUpdate = async () => {
      try {
        const holdings = await holdingsService.fetchHoldings(client.sqlUserId);
        const payload = await holdingsService.computeHoldingsPayload(holdings);

        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: "HOLDINGS_UPDATE",
            data: payload
          }));
        }
      } catch (err) {
        console.error("WS Holdings Update Error:", err);
      }
    };

    sendUpdate();
    return setInterval(sendUpdate, 4000);
  }

  startPositionsLive(ws, client) {
    if (!client.sqlUserId || !holdingsService) return null;

    const sendUpdate = async () => {
      try {
        const lots = await holdingsService.fetchDetailedPositions(client.sqlUserId);
        const payload = await holdingsService.computePositionsPayload(lots);

        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: "POSITIONS_UPDATE",
            data: payload
          }));
        }
      } catch (err) {
        console.error("WS Positions Update Error:", err);
      }
    };

    sendUpdate();
    return setInterval(sendUpdate, 4000);
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
