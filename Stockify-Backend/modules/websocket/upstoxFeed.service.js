import { WebSocket } from "ws";

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
        console.error("❌ [UpstoxFeedService] WS Error:", err.message);
      });

      this.ws.on("close", () => {
        this.isConnected = false;
        console.log("🔌 [UpstoxFeedService] WS Disconnected. Retrying in 3s...");
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
    }, 3000);
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
