"""
upstox_feed_consumer.py
-----------------------
Python consumer example for the upstox-feed Redis pub/sub service.

Requirements:
    pip install redis requests

Usage:
    python upstox_feed_consumer.py
"""

import json
import threading
import time
import redis
import requests
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

REDIS_URL       = "redis://default:AUd9F1nNtQX86sRpLPQdHut91bOR8B3G@redis-11499.c264.ap-south-1-1.ec2.cloud.redislabs.com:11499"
FEED_API_URL    = "http://localhost:4141"
CONTROL_CHANNEL = "upstox:control"
SERVICE_ID      = "python-algo-engine-1"
HEARTBEAT_INTERVAL = 15  # seconds


class UpstoxFeedConsumer:
    def __init__(self, service_id: str, redis_url: str = REDIS_URL, feed_api_url: str = FEED_API_URL):
        self.service_id   = service_id
        self.feed_api_url = feed_api_url
        self._r           = redis.from_url(redis_url, decode_responses=True)
        self._pub         = redis.from_url(redis_url, decode_responses=True)
        self._sub         = self._r.pubsub(ignore_subscribe_messages=True)
        self._stop        = threading.Event()
        self._tick_cbs    = []

    # ── Public API ──────────────────────────────────────────────────────────

    def on_tick(self, callback):
        """Register a callback: fn(tick_dict) called for every incoming tick."""
        self._tick_cbs.append(callback)
        return self

    def subscribe(self, symbols: list[str]):
        """
        Subscribe to a list of symbols (names or instrument_keys).
        Resolves names to instrument_keys via REST and subscribes to Redis channels.
        """
        # Tell the feed service we want these symbols
        self._control({"action": "subscribe", "serviceId": self.service_id, "symbols": symbols})

        # Subscribe to Redis tick channels
        for sym in symbols:
            key = self._resolve(sym)
            if key:
                channel = f"ticks:{key}"
                self._sub.subscribe(channel)
                log.info(f"📻 Subscribed to channel: {channel}")
            else:
                log.warning(f"⚠️  Could not resolve: {sym}")

    def unsubscribe(self, symbols: list[str]):
        self._control({"action": "unsubscribe", "serviceId": self.service_id, "symbols": symbols})

    def get_snapshot(self, instrument_key: str) -> dict | None:
        """Return the last-known tick snapshot for an instrument key."""
        try:
            r = requests.get(f"{self.feed_api_url}/api/snapshot/{instrument_key}", timeout=3)
            if r.ok:
                return r.json()
        except Exception as e:
            log.warning(f"Snapshot fetch failed: {e}")
        return None

    def start(self):
        """Start the heartbeat thread and tick listener loop (blocking)."""
        hb_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        hb_thread.start()
        self._listen_loop()  # blocks

    def start_background(self):
        """Start everything in background threads (non-blocking)."""
        hb_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        hb_thread.start()
        listen_thread = threading.Thread(target=self._listen_loop, daemon=True)
        listen_thread.start()

    def shutdown(self):
        log.info(f"👋 [{self.service_id}] Shutting down…")
        self._stop.set()
        self._control({"action": "unsubscribe_all", "serviceId": self.service_id})
        self._sub.close()

    # ── Internals ───────────────────────────────────────────────────────────

    def _control(self, msg: dict):
        self._pub.publish(CONTROL_CHANNEL, json.dumps(msg))

    def _heartbeat_loop(self):
        while not self._stop.is_set():
            self._control({"action": "heartbeat", "serviceId": self.service_id})
            self._stop.wait(HEARTBEAT_INTERVAL)

    def _listen_loop(self):
        log.info(f"🎧 [{self.service_id}] Listening for ticks…")
        for message in self._sub.listen():
            if self._stop.is_set():
                break
            if message and message.get("type") == "message":
                try:
                    tick = json.loads(message["data"])
                    for cb in self._tick_cbs:
                        cb(tick)
                except Exception as e:
                    log.error(f"Tick parse error: {e}")

    def _resolve(self, symbol: str) -> str | None:
        """Resolve a symbol name to an instrument_key via the feed REST API."""
        try:
            r = requests.get(f"{self.feed_api_url}/api/resolve/{symbol}", timeout=3)
            if r.ok and r.json().get("found"):
                return r.json()["instrument_key"]
        except Exception:
            pass
        # If it looks like an instrument_key already (contains |), use directly
        if "|" in symbol:
            return symbol
        return None


# ── Example usage ──────────────────────────────────────────────────────────────

def on_tick(tick: dict):
    log.info(
        f"🟢 {tick['symbol']:20s}  ₹{tick['ltp']:<10}  "
        f"CP: ₹{tick.get('prev_close', 'N/A')}"
    )

if __name__ == "__main__":
    consumer = UpstoxFeedConsumer(service_id=SERVICE_ID)

    consumer.on_tick(on_tick)
    consumer.subscribe(["RELIANCE", "TCS", "INFY", "HDFCBANK"])

    # Print snapshot immediately before first tick arrives
    snap = consumer.get_snapshot("NSE_EQ|INE002A01018")
    if snap:
        log.info(f"📸 Snapshot: RELIANCE @ ₹{snap.get('ltp')}")

    try:
        consumer.start()          # blocks; Ctrl-C to stop
    except KeyboardInterrupt:
        consumer.shutdown()
