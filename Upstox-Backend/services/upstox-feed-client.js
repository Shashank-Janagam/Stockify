/**
 * upstox-feed-client.js
 *
 * Lightweight Redis pub/sub client SDK for consumer services.
 *
 * Usage (Node.js / ESM):
 *
 *   import { UpstoxFeedClient } from "./upstox-feed-client.js";
 *
 *   const client = new UpstoxFeedClient({ serviceId: "algo-engine-1" });
 *   await client.connect();
 *
 *   // Subscribe to symbols
 *   await client.subscribe(["RELIANCE", "TCS", "INFY"]);
 *
 *   // Listen to ticks
 *   client.on("tick", (tick) => {
 *     console.log(tick.symbol, tick.ltp);
 *   });
 *
 *   // Get last-known snapshot before first tick arrives
 *   const snap = await client.getSnapshot("NSE_EQ|INE002A01018");
 *
 *   // Graceful shutdown
 *   await client.shutdown();
 */

import Redis from "ioredis";
import { EventEmitter } from "events";
import axios from "axios";

const CONTROL_CHANNEL = "upstox:control";
const HEARTBEAT_INTERVAL_MS = 15_000;

export class UpstoxFeedClient extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.serviceId     — unique ID for this service instance
   * @param {string} [opts.redisUrl]    — defaults to REDIS_URL env or redis://127.0.0.1:6379
   * @param {string} [opts.feedApiUrl]  — base URL of the feed service REST API (for snapshots + HTTP-only control)
   */
  constructor({ serviceId, redisUrl, feedApiUrl } = {}) {
    super();
    this.serviceId = serviceId || `service-${Date.now()}`;
    this.redisUrl = redisUrl || process.env.REDIS_URL || "redis://default:AUd9F1nNtQX86sRpLPQdHut91bOR8B3G@redis-11499.c264.ap-south-1-1.ec2.cloud.redislabs.com:11499";
    this.feedApiUrl = feedApiUrl || process.env.FEED_API_URL || "http://localhost:4141";

    this._sub = null;   // subscriber client
    this._pub = null;   // publisher client
    this._subscribedChannels = new Set();
    this._heartbeatTimer = null;
  }

  // ─── Connect ────────────────────────────────────────────────────────────────

  async connect() {
    this._pub = new Redis(this.redisUrl);
    this._sub = new Redis(this.redisUrl);

    this._sub.on("message", (channel, message) => {
      if (!channel.startsWith("ticks:")) return;
      try {
        const tick = JSON.parse(message);
        this.emit("tick", tick);
        this.emit(`tick:${tick.instrument_key}`, tick);
      } catch {}
    });

    // Start heartbeat
    this._heartbeatTimer = setInterval(() => this._heartbeat(), HEARTBEAT_INTERVAL_MS);
    await this._heartbeat(); // immediate first beat

    console.log(`✅ [UpstoxFeedClient:${this.serviceId}] Connected to Redis`);
  }

  // ─── Subscribe ───────────────────────────────────────────────────────────────

  /**
   * Subscribe to a list of symbols / instrument_keys.
   * The feed service resolves symbol names to instrument_keys automatically.
   *
   * @param {string[]} symbols   — symbol names (e.g. "RELIANCE") or instrument_keys
   * @param {string[]} [instrumentKeys] — if you already have resolved instrument keys,
   *                                      pass them here to also subscribe to their Redis channels
   */
  async subscribe(symbols, instrumentKeys = []) {
    // Tell the feed service to track us
    await this._publish({
      action: "subscribe",
      serviceId: this.serviceId,
      symbols,
    });

    // Subscribe to tick channels for already-known instrument_keys
    for (const key of instrumentKeys) {
      await this._subscribeChannel(`ticks:${key}`);
    }

    // Also try to resolve symbols via REST and subscribe to their channels
    for (const sym of symbols) {
      try {
        const { data } = await axios.get(
          `${this.feedApiUrl}/api/resolve/${encodeURIComponent(sym)}`
        );
        if (data.found) {
          await this._subscribeChannel(`ticks:${data.instrument_key}`);
        }
      } catch {}
    }
  }

  /**
   * Unsubscribe from a list of symbols.
   */
  async unsubscribe(symbols) {
    await this._publish({
      action: "unsubscribe",
      serviceId: this.serviceId,
      symbols,
    });
    // Note: we keep the Redis subscription up — the feed service may still push
    // ticks from other consumers' subscriptions; we just stop receiving our slice.
  }

  /**
   * Subscribe to a specific instrument channel by key (e.g. after resolving).
   */
  async subscribeChannel(instrumentKey) {
    await this._subscribeChannel(`ticks:${instrumentKey}`);
  }

  // ─── Snapshot ────────────────────────────────────────────────────────────────

  /**
   * Returns the last-known tick for an instrument key (cached in Redis).
   * Useful to get an instant value before the next live tick arrives.
   */
  async getSnapshot(instrumentKey) {
    try {
      const { data } = await axios.get(
        `${this.feedApiUrl}/api/snapshot/${encodeURIComponent(instrumentKey)}`
      );
      return data;
    } catch {
      return null;
    }
  }

  // ─── Graceful shutdown ───────────────────────────────────────────────────────

  async shutdown() {
    clearInterval(this._heartbeatTimer);
    await this._publish({ action: "unsubscribe_all", serviceId: this.serviceId });
    this._sub?.disconnect();
    this._pub?.disconnect();
    console.log(`👋 [UpstoxFeedClient:${this.serviceId}] Shut down`);
  }

  // ─── Internals ───────────────────────────────────────────────────────────────

  async _publish(msg) {
    await this._pub.publish(CONTROL_CHANNEL, JSON.stringify(msg));
  }

  async _subscribeChannel(channel) {
    if (!this._subscribedChannels.has(channel)) {
      await this._sub.subscribe(channel);
      this._subscribedChannels.add(channel);
    }
  }

  async _heartbeat() {
    await this._publish({ action: "heartbeat", serviceId: this.serviceId });
  }
}
