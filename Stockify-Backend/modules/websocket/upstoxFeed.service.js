/**
 * upstoxFeed.service.js  (Redis pub/sub edition)
 *
 * Drop-in replacement for the old WebSocket-based feed service.
 * Now consumes tick data from the upstox-feed microservice via Redis pub/sub
 * instead of connecting directly to the Upstox Market Data WebSocket.
 *
 * PUBLIC API IS UNCHANGED — wsManager.js needs zero modifications:
 *   upstoxFeedService.subscribe(symbols)
 *   upstoxFeedService.unsubscribe(symbols)
 *   upstoxFeedService.getTick(symbol)
 *   upstoxFeedService.getTicks(symbols)
 *   upstoxFeedService.onTick(callback) → returns unsubscribe fn
 *   upstoxFeedService.isConnected       (boolean)
 *   upstoxFeedService.isMarketLive()
 *
 * Redis contract with upstox-feed service:
 *   PUBLISH  upstox:control  { action, serviceId, symbols }
 *   SUBSCRIBE ticks:<instrument_key>  → LIVE_TICK JSON
 *   GET      ticks:latest (hash)      → snapshot cache
 *
 * Symbol resolution:
 *   - wsManager passes display symbols like "RELIANCE", "^NSEI", "TCS.NS"
 *   - We publish those directly to the feed service (it resolves via subscriptions.json)
 *   - We also subscribe to ticks:* channels after getting the instrument_key from /api/resolve
 */

import Redis from "ioredis";
import YahooFinance from "yahoo-finance2";
import axios from "axios";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const REDIS_URL       = process.env.REDIS_URL;
const FEED_API_URL    = process.env.FEED_API_URL || "http://localhost:4141";
const CONTROL_CHANNEL = "upstox:control";
const SERVICE_ID      = "stockify-backend";
const HEARTBEAT_TTL   = 15_000; // ms

class UpstoxFeedService {
  constructor() {
    // Public state
    this.isConnected = false;

    // Internal state
    this._pub         = null;   // Redis publisher
    this._sub         = null;   // Redis subscriber
    this._ready       = false;

    // symbol (clean, no .NS) → tick payload
    this.latestTicks  = new Map();

    // Ref-counted: clean symbol → number of active wsManager subscribers
    this.symbolRefCounts = new Map();

    // clean symbol → instrument_key (resolved via REST)
    this._symbolToKey = new Map();
    // instrument_key → clean symbol (reverse)
    this._keyToSymbol = new Map();

    // Set of currently subscribed Redis channels
    this._subscribedChannels = new Set();

    // Tick listeners registered by wsManager
    this.listeners    = new Set();

    // Yahoo fallback
    this.offlinePricesFetched = new Set();
    this.isPolling    = false;
    this.pollInterval = setInterval(() => this.fallbackPolling(), 5000);

    this._init();
  }

  // ── Connection lifecycle ──────────────────────────────────────────────────

  connect() {
    if (!this._ready) {
      return this._init();
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  async _init() {
    if (!REDIS_URL) {
      console.error("❌ [UpstoxFeedService] REDIS_URL not set — ticks will use Yahoo fallback only");
      return;
    }

    try {
      this._pub = new Redis(REDIS_URL);
      this._sub = new Redis(REDIS_URL);

      this._pub.on("error", (e) => console.error("❌ [UpstoxFeed/pub]", e.message));
      this._sub.on("error", (e) => console.error("❌ [UpstoxFeed/sub]", e.message));

      this._sub.psubscribe("ticks:*", (err) => {
        if (err) console.error("❌ [UpstoxFeed/sub] psubscribe error:", err.message);
        else console.log("📡 [UpstoxFeedService] Pattern subscribed to ticks:*");
      });

      this._sub.on("pmessage", (pattern, channel, message) => {
        this._handleTick(message);
      });

      this._sub.on("message", (channel, message) => {
        if (!channel.startsWith("ticks:")) return;
        this._handleTick(message);
      });

      this._ready = true;
      this.isConnected = true;
      console.log("✅ [UpstoxFeedService] Connected to Redis — using upstox-feed service");

      // Start heartbeat
      setInterval(() => this._heartbeat(), HEARTBEAT_TTL);
      this._heartbeat();

      // Re-subscribe any symbols that were queued before Redis was ready
      const pending = [...this.symbolRefCounts.keys()];
      if (pending.length > 0) {
        await this._redisSubscribe(pending);
      }
    } catch (err) {
      console.error("❌ [UpstoxFeedService] Redis init failed:", err.message);
    }
  }

  // ── Tick handler ──────────────────────────────────────────────────────────

  _handleTick(message) {
    try {
      const parsed = JSON.parse(message);
      const rawSymbol = parsed.symbol || "";
      const cleanSymbol = rawSymbol.replace(/\.NS$/, "").toUpperCase();

      const tickData = {
        symbol:       cleanSymbol,
        symbolNS:     `${cleanSymbol}.NS`,
        name:         parsed.name || cleanSymbol,
        instrument_key: parsed.instrument_key || "",
        price:        parsed.ltp ?? null,
        ltp:          parsed.ltp ?? null,
        prev_close:   parsed.prev_close ?? null,
        open:         parsed.open ?? null,
        high:         parsed.high ?? null,
        low:          parsed.low ?? null,
        close:        parsed.close ?? null,
        change:       parsed.ltp && parsed.prev_close
                        ? Number((parsed.ltp - parsed.prev_close).toFixed(2))
                        : 0,
        percent:      parsed.ltp && parsed.prev_close && parsed.prev_close !== 0
                        ? Number((((parsed.ltp - parsed.prev_close) / parsed.prev_close) * 100).toFixed(2))
                        : 0,
        timestamp:    parsed.timestamp || new Date().toISOString(),
      };

      this.latestTicks.set(cleanSymbol, tickData);
      this.latestTicks.set(`${cleanSymbol}.NS`, tickData);

      this.listeners.forEach((cb) => { try { cb(tickData); } catch {} });
    } catch {}
  }

  // ── subscribe / unsubscribe (called by wsManager) ─────────────────────────

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
      console.log(`📡 [UpstoxFeedService] Subscribing via Redis: ${newlyNeeded.join(", ")}`);
      this._redisSubscribe(newlyNeeded).catch(() => {});
    }
  }

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
      console.log(`📴 [UpstoxFeedService] Unsubscribing via Redis: ${toRelease.join(", ")}`);
      this._redisUnsubscribe(toRelease).catch(() => {});
    }
  }

  // ── Redis pub/sub helpers ─────────────────────────────────────────────────

  /**
   * Tell the feed service to subscribe these symbols for us,
   * then subscribe to their Redis tick channels.
   */
  async _redisSubscribe(cleanSymbols) {
    if (!this._ready) return;

    // 1. Tell the feed service we want these
    await this._control({ action: "subscribe", serviceId: SERVICE_ID, symbols: cleanSymbols });

    // 2. Resolve instrument keys, subscribe to Redis channels, and immediately fetch latest snapshot
    for (const sym of cleanSymbols) {
      const key = await this._resolveKey(sym);
      if (key) {
        const channel = `ticks:${key}`;
        if (!this._subscribedChannels.has(channel)) {
          await this._sub.subscribe(channel);
          this._subscribedChannels.add(channel);
        }
        // Immediately fetch snapshot from Redis cache so UI doesn't wait for next live tick
        this._fetchSnapshot(key).catch(() => {});
      }
    }
  }

  /**
   * Fetches the latest cached snapshot for an instrument key from the feed service
   * and dispatches it as an immediate tick.
   */
  async _fetchSnapshot(instrumentKey) {
    try {
      const { data } = await axios.get(
        `${FEED_API_URL}/api/snapshot/${encodeURIComponent(instrumentKey)}`,
        { timeout: 3000 }
      );
      if (data && data.ltp) {
        this._handleTick(JSON.stringify(data));
      }
    } catch {}
  }

  /**
   * Tell the feed service to unsubscribe these symbols.
   * We keep the Redis channel subscribed if the channel resolves to an
   * instrument key still referenced by other symbols (edge case — safe to leave).
   */
  async _redisUnsubscribe(cleanSymbols) {
    if (!this._ready) return;
    await this._control({ action: "unsubscribe", serviceId: SERVICE_ID, symbols: cleanSymbols });

    // Unsubscribe from Redis tick channels for fully-released keys
    for (const sym of cleanSymbols) {
      const key = this._symbolToKey.get(sym);
      if (key) {
        const channel = `ticks:${key}`;
        if (this._subscribedChannels.has(channel)) {
          await this._sub.unsubscribe(channel);
          this._subscribedChannels.delete(channel);
        }
        this._symbolToKey.delete(sym);
        this._keyToSymbol.delete(key);
      }
    }
  }

  async _control(msg) {
    if (!this._pub) return;
    await this._pub.publish(CONTROL_CHANNEL, JSON.stringify(msg));
  }

  async _heartbeat() {
    await this._control({ action: "heartbeat", serviceId: SERVICE_ID });
  }

  /**
   * Resolve a clean symbol (e.g. "RELIANCE") to its instrument_key
   * by calling the feed service REST API.
   * Result is cached in _symbolToKey.
   */
  async _resolveKey(cleanSymbol) {
    if (this._symbolToKey.has(cleanSymbol)) return this._symbolToKey.get(cleanSymbol);

    try {
      const { data } = await axios.get(
        `${FEED_API_URL}/api/resolve/${encodeURIComponent(cleanSymbol)}`,
        { timeout: 3000 }
      );
      if (data.found && data.instrument_key) {
        this._symbolToKey.set(cleanSymbol, data.instrument_key);
        this._keyToSymbol.set(data.instrument_key, cleanSymbol);
        return data.instrument_key;
      }
    } catch {}

    return null;
  }

  // ── Tick accessors ────────────────────────────────────────────────────────

  getTick(symbol) {
    if (!symbol) return null;
    const clean = symbol.replace(/\.NS$/, "").toUpperCase();
    return this.latestTicks.get(clean) || this.latestTicks.get(`${clean}.NS`) || null;
  }

  getTicks(symbols = []) {
    return symbols.map((s) => this.getTick(s)).filter(Boolean);
  }

  onTick(callback) {
    if (typeof callback === "function") this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // ── Market hours helper (unchanged) ───────────────────────────────────────

  isMarketLive() {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const ist = new Date(utc + 3600000 * 5.5);
    const day = ist.getDay();
    if (day === 0 || day === 6) return false;
    const mins = ist.getHours() * 60 + ist.getMinutes();
    return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
  }

  // ── Yahoo fallback (unchanged — used when market is offline or Redis unavailable) ──

  async fallbackPolling() {
    if (this.isPolling) return;
    this.isPolling = true;
    try {
      const activeSymbols = [...this.symbolRefCounts.keys()].filter(
        (s) => this.symbolRefCounts.get(s) > 0
      );
      if (activeSymbols.length === 0) return;

      const marketLive = this.isMarketLive();
      if (!marketLive) {
        const toFetch = activeSymbols.filter((s) => !this.offlinePricesFetched.has(s));
        if (toFetch.length > 0) {
          toFetch.forEach((s) => this.offlinePricesFetched.add(s));
          console.log(`🌙 [UpstoxFeedService] Market offline. Fetching Yahoo for: ${toFetch.join(", ")}`);
          await this.fetchYahooPrices(toFetch);
        }
      } else {
        this.offlinePricesFetched.clear();
        // Only poll Yahoo if Redis/feed is not delivering ticks
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
      const queries = symbols.map((s) => {
        if (s.startsWith("^")) return s;
        return s.endsWith(".NS") || s.endsWith(".BO") ? s : `${s}.NS`;
      });

      let results = [];
      try {
        const quotes = await yahooFinance.quote(queries);
        results = Array.isArray(quotes) ? quotes : quotes ? [quotes] : [];
      } catch {
        const settled = await Promise.allSettled(
          queries.map((q) => yahooFinance.quote(q).catch(() => null))
        );
        results = settled.filter((r) => r.status === "fulfilled" && r.value).map((r) => r.value);
      }

      results.forEach((quote) => {
        if (!quote?.symbol) return;
        const cleanSymbol = quote.symbol.replace(/\.NS$/, "").toUpperCase();
        const tickData = {
          symbol:       cleanSymbol,
          symbolNS:     `${cleanSymbol}.NS`,
          name:         quote.shortName || cleanSymbol,
          instrument_key: "",
          price:        quote.regularMarketPrice ?? null,
          ltp:          quote.regularMarketPrice ?? null,
          prev_close:   quote.regularMarketPreviousClose ?? null,
          open:         quote.regularMarketOpen ?? null,
          high:         quote.regularMarketDayHigh ?? null,
          low:          quote.regularMarketDayLow ?? null,
          close:        quote.regularMarketPrice ?? null,
          change:       quote.regularMarketChange ?? 0,
          percent:      quote.regularMarketChangePercent ?? 0,
          timestamp:    new Date().toISOString(),
        };
        this.latestTicks.set(cleanSymbol, tickData);
        this.latestTicks.set(`${cleanSymbol}.NS`, tickData);
        this.listeners.forEach((cb) => { try { cb(tickData); } catch {} });
      });
    } catch (err) {
      console.warn("⚠️ [YahooPolling] Warning fetching prices:", err.message);
    }
  }
}

export const upstoxFeedService = new UpstoxFeedService();
