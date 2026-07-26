import { WebSocket } from "ws";
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

class UpstoxFeedService {
  constructor(feedUrl = process.env.UPSTOX_WS_URL || "ws://localhost:4141") {
    this.feedUrl = feedUrl;
    this.ws = null;
    this.isConnected = false;
    this.latestTicks = new Map();   // symbol → tick payload
    this.listeners = new Set();
    // Ref-counted: symbol → number of active subscribers
    this.symbolRefCounts = new Map();
    this.reconnectTimer = null;
    this.offlinePricesFetched = new Set();
    this.pollInterval = setInterval(() => this.fallbackPolling(), 5000);
  }

  isMarketLive() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const ist = new Date(utc + (3600000 * 5.5));
    const day = ist.getDay(); 
    if (day === 0 || day === 6) return false;
    
    const timeInMinutes = ist.getHours() * 60 + ist.getMinutes();
    const startMinutes = 9 * 60 + 15; 
    const endMinutes = 15 * 60 + 30; 
    
    return timeInMinutes >= startMinutes && timeInMinutes <= endMinutes;
  }

  async fallbackPolling() {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const activeSymbols = [...this.symbolRefCounts.keys()].filter(s => this.symbolRefCounts.get(s) > 0);
      if (activeSymbols.length === 0) return;

      const marketLive = this.isMarketLive();

      if (!marketLive) {
        const symbolsToFetch = activeSymbols.filter(s => !this.offlinePricesFetched.has(s));
        if (symbolsToFetch.length > 0) {
          // Add them first to prevent overlapping fetches in the next interval
          symbolsToFetch.forEach(s => this.offlinePricesFetched.add(s));
          console.log(`🌙 [UpstoxFeedService] Market offline. Fetching Yahoo closing prices for: ${symbolsToFetch.join(', ')}`);
          await this.fetchYahooPrices(symbolsToFetch);
        }
      } else {
        // Market is live
        this.offlinePricesFetched.clear();
        if (!this.isConnected) {
          await this.fetchYahooPrices(activeSymbols);
        }
      }
    } finally {
      this.isPolling = false;
    }
  }

  async fetchYahooPrices(symbols) {
    try {
      const queries = symbols.map(s => {
        if (s.startsWith('^')) return s;
        return s.endsWith('.NS') || s.endsWith('.BO') ? s : `${s}.NS`;
      });
      const quotes = await yahooFinance.quote(queries);
      const results = Array.isArray(quotes) ? quotes : [quotes];

      results.forEach(quote => {
        if (!quote || !quote.symbol) return;
        const cleanSymbol = quote.symbol.replace(/\.NS$/, "").toUpperCase();
        
        const tickData = {
          symbol: cleanSymbol,
          symbolNS: `${cleanSymbol}.NS`,
          name: quote.shortName || cleanSymbol,
          instrument_key: "",
          price: quote.regularMarketPrice ?? null,
          ltp: quote.regularMarketPrice ?? null,
          prev_close: quote.regularMarketPreviousClose ?? null,
          open: quote.regularMarketOpen ?? null,
          high: quote.regularMarketDayHigh ?? null,
          low: quote.regularMarketDayLow ?? null,
          close: quote.regularMarketPrice ?? null,
          change: quote.regularMarketChange ?? 0,
          percent: quote.regularMarketChangePercent ?? 0,
          timestamp: new Date().toISOString()
        };

        this.latestTicks.set(cleanSymbol, tickData);
        this.latestTicks.set(`${cleanSymbol}.NS`, tickData);

        this.listeners.forEach((callback) => {
          try { callback(tickData); } catch (e) {}
        });
      });
    } catch (err) {
      console.error("❌ [YahooPolling] Error fetching prices:", err.message);
    }
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    try {
      console.log(`🔌 [UpstoxFeedService] Connecting to Upstox WS at ${this.feedUrl}...`);
      this.ws = new WebSocket(this.feedUrl);

      this.ws.on("open", () => {
        console.log("⚡ [UpstoxFeedService] Connected to Upstox WS server!");
        this.isConnected = true;

        // Re-subscribe all symbols that still have active ref counts
        const activeSymbols = [...this.symbolRefCounts.keys()].filter(s => this.symbolRefCounts.get(s) > 0);
        if (activeSymbols.length > 0) {
          this._sendSubscription(activeSymbols);
        }
      });

      this.ws.on("message", (data) => {
        try {
          const parsed = JSON.parse(data.toString());

          if (parsed.type === "LIVE_TICK" || (parsed.symbol && parsed.ltp)) {
            const rawSymbol = parsed.symbol || "";
            const cleanSymbol = rawSymbol.replace(/\.NS$/, "").toUpperCase();

            const tickData = {
              symbol: cleanSymbol,
              symbolNS: `${cleanSymbol}.NS`,
              name: parsed.name || cleanSymbol,
              instrument_key: parsed.instrument_key || "",
              price: parsed.ltp ?? null,
              ltp: parsed.ltp ?? null,
              prev_close: parsed.prev_close ?? null,
              open: parsed.open ?? null,
              high: parsed.high ?? null,
              low: parsed.low ?? null,
              close: parsed.close ?? null,
              change: parsed.ltp && parsed.prev_close
                ? Number((parsed.ltp - parsed.prev_close).toFixed(2))
                : 0,
              percent: parsed.ltp && parsed.prev_close && parsed.prev_close !== 0
                ? Number((((parsed.ltp - parsed.prev_close) / parsed.prev_close) * 100).toFixed(2))
                : 0,
              timestamp: parsed.timestamp || new Date().toISOString()
            };

            // Cache by clean symbol and .NS variant
            this.latestTicks.set(cleanSymbol, tickData);
            this.latestTicks.set(`${cleanSymbol}.NS`, tickData);

            // Notify all registered tick listeners
            this.listeners.forEach((callback) => {
              try { callback(tickData); } catch (e) {
                console.error("[UpstoxFeedService] Listener error:", e.message);
              }
            });
          }
        } catch (_) {
          // Ignore non-JSON / heartbeat frames
        }
      });

      this.ws.on("error", (err) => {
        if (this.lastLoggedError !== err.message) {
          console.error("❌ [UpstoxFeedService] WS Error:", err.message);
          this.lastLoggedError = err.message;
        }
      });

      this.ws.on("close", () => {
        this.isConnected = false;
        if (!this.reconnectTimer) {
          console.log("🔌 [UpstoxFeedService] WS Disconnected. Retrying in 10s...");
        }
        this._scheduleReconnect();
      });
    } catch (err) {
      console.error("❌ [UpstoxFeedService] Failed to connect:", err.message);
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 10000); // 10 seconds to reduce spam
  }

  /**
   * Increment ref count for each symbol.
   * Sends subscription to Upstox WS only for newly demanded symbols (ref 0→1).
   */
  subscribe(symbols = []) {
    if (!Array.isArray(symbols) || symbols.length === 0) return;

    const newlyNeeded = [];
    symbols.forEach((sym) => {
      if (!sym) return;
      const clean = sym.replace(/\.NS$/, "").toUpperCase();
      const prev = this.symbolRefCounts.get(clean) || 0;
      this.symbolRefCounts.set(clean, prev + 1);
      if (prev === 0) newlyNeeded.push(clean);
    });

    if (newlyNeeded.length > 0) {
      console.log(`📡 [UpstoxFeedService] Subscribing to: ${newlyNeeded.join(", ")}`);
      this._sendSubscription(newlyNeeded);
    }
  }

  /**
   * Decrement ref count for each symbol.
   * Sends unsubscription to Upstox WS when ref count drops to 0.
   */
  unsubscribe(symbols = []) {
    if (!Array.isArray(symbols) || symbols.length === 0) return;

    const toRelease = [];
    symbols.forEach((sym) => {
      if (!sym) return;
      const clean = sym.replace(/\.NS$/, "").toUpperCase();
      const prev = this.symbolRefCounts.get(clean) || 0;
      if (prev <= 1) {
        this.symbolRefCounts.delete(clean);
        this.latestTicks.delete(clean);
        this.latestTicks.delete(`${clean}.NS`);
        toRelease.push(clean);
      } else {
        this.symbolRefCounts.set(clean, prev - 1);
      }
    });

    if (toRelease.length > 0) {
      console.log(`📴 [UpstoxFeedService] Unsubscribing from: ${toRelease.join(", ")}`);
      this._sendUnsubscription(toRelease);
    }
  }

  _sendSubscription(symbols = []) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify({
        action: "subscribe",
        symbols,
        reset: false
      }));
    } catch (err) {
      console.error("❌ [UpstoxFeedService] Subscribe send error:", err.message);
    }
  }

  _sendUnsubscription(symbols = []) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify({
        action: "unsubscribe",
        symbols
      }));
    } catch (err) {
      console.error("❌ [UpstoxFeedService] Unsubscribe send error:", err.message);
    }
  }

  getTick(symbol) {
    if (!symbol) return null;
    const clean = symbol.replace(/\.NS$/, "").toUpperCase();
    return this.latestTicks.get(clean) || this.latestTicks.get(`${clean}.NS`) || null;
  }

  getTicks(symbols = []) {
    return symbols.map((s) => this.getTick(s)).filter(Boolean);
  }

  onTick(callback) {
    if (typeof callback === "function") {
      this.listeners.add(callback);
    }
    return () => this.listeners.delete(callback);
  }
}

export const upstoxFeedService = new UpstoxFeedService();
