"""
redis_tick_feed.py
------------------
Drop-in async tick feed for AutoTrading/live.py.

Replaces the websockets.connect() block in connect_data_feed().
Subscribes to the upstox-feed service via Redis pub/sub instead of
connecting directly to ws://localhost:4141.

Usage inside connect_data_feed():
    async for tick_dict in redis_tick_stream(symbol, session_id, resolved_key):
        ...  # tick_dict has same keys as old WS JSON: ltp, symbol, timestamp, etc.
"""

import os
import json
import asyncio
import logging
import urllib.request
import urllib.parse
import gzip
from typing import AsyncGenerator, Optional

log = logging.getLogger(__name__)

REDIS_URL       = os.getenv("REDIS_URL", "")
FEED_API_URL    = os.getenv("FEED_API_URL",
                            os.getenv("UPSTOX_API_BASE_URL", "http://localhost:4141"))
CONTROL_CHANNEL = "upstox:control"
HEARTBEAT_INTERVAL = 15   # seconds
TICK_TIMEOUT       = 20   # seconds – raises TimeoutError if no tick arrives


# ── REST helpers (sync, called once at start) ─────────────────────────────────

def resolve_symbol_via_rest(symbol: str) -> Optional[str]:
    """
    Call the upstox-feed REST API to resolve a display symbol → instrument_key.
    Returns instrument_key string or None.
    """
    try:
        url = f"{FEED_API_URL}/api/resolve/{symbol}"
        with urllib.request.urlopen(url, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            if data.get("found"):
                return data["instrument_key"]
    except Exception as e:
        log.warning(f"[redis_tick_feed] REST resolve failed for {symbol}: {e}")
    return None


def subscribe_symbol_via_rest(symbol: str, instrument_key: str, name: str = "") -> bool:
    """
    POST /api/subscribe to dynamically add a new symbol to the feed service.
    Returns True on success.
    """
    try:
        payload = json.dumps({"symbol": symbol, "instrument_key": instrument_key,
                               "name": name, "serviceId": "autotrading"}).encode()
        req = urllib.request.Request(
            f"{FEED_API_URL}/api/subscribe", data=payload,
            headers={"Content-Type": "application/json"}, method="POST"
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read().decode())
            return result.get("ok", False)
    except Exception as e:
        log.warning(f"[redis_tick_feed] REST subscribe failed: {e}")
    return False


def lookup_instrument_key_from_upstox(symbol: str) -> Optional[tuple[str, str]]:
    """
    Download NSE instruments from Upstox CDN and find the instrument_key
    for the given symbol. Returns (instrument_key, name) or None.
    """
    try:
        with urllib.request.urlopen(
            "https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz",
            timeout=15
        ) as resp:
            raw = gzip.decompress(resp.read())
        instruments = json.loads(raw.decode())
        sym_upper = symbol.upper()
        for inst in instruments:
            ts = (inst.get("trading_symbol") or "").upper()
            nm = (inst.get("name") or "").upper()
            if ts == sym_upper or nm == sym_upper or ts.startswith(sym_upper):
                if inst.get("instrument_type") in ("EQUITY", "EQ", "INDEX", None):
                    return inst["instrument_key"], inst.get("name", symbol)
    except Exception as e:
        log.warning(f"[redis_tick_feed] Instrument CDN lookup failed: {e}")
    return None


def fetch_snapshot_via_rest(instrument_key_or_symbol: str) -> Optional[dict]:
    """
    Fetch the latest cached tick snapshot from Redis via the feed REST API.
    """
    try:
        url = f"{FEED_API_URL}/api/snapshot/{urllib.parse.quote(instrument_key_or_symbol)}"
        with urllib.request.urlopen(url, timeout=3) as resp:
            data = json.loads(resp.read().decode())
            if data and data.get("ltp"):
                return data
    except Exception:
        pass
    return None


# ── Async Redis tick stream ───────────────────────────────────────────────────

async def redis_tick_stream(
    symbol: str,
    session_id: str,
    resolved_key: Optional[str] = None,
) -> AsyncGenerator[dict, None]:
    """
    Async generator that yields tick dicts compatible with the old WS JSON format:
      { type, symbol, ltp, prev_close, open, high, low, close, timestamp, instrument_key, name }

    Steps:
      1. Resolve instrument_key (passed in or via REST)
      2. Publish subscribe control message to upstox:control
      3. Subscribe to ticks:<instrument_key> Redis channel
      4. Yield each incoming tick dict
      5. On CancelledError / GeneratorExit: publish unsubscribe_all
    """
    if not REDIS_URL:
        raise RuntimeError(
            "[redis_tick_feed] REDIS_URL is not set. "
            "Cannot connect to upstox-feed service via Redis."
        )

    # ── Step 1: Resolve instrument key ────────────────────────────────────────
    instrument_key = resolved_key

    if not instrument_key:
        instrument_key = resolve_symbol_via_rest(symbol)

    if not instrument_key:
        log.info(f"[redis_tick_feed] {symbol} not in feed registry — looking up Upstox CDN…")
        result = lookup_instrument_key_from_upstox(symbol)
        if result:
            instrument_key, inst_name = result
            subscribe_symbol_via_rest(symbol, instrument_key, inst_name)
            log.info(f"[redis_tick_feed] Dynamically registered {symbol} → {instrument_key}")
        else:
            log.warning(f"[redis_tick_feed] Could not resolve {symbol}. Tick stream will be empty.")

    service_id = f"autotrading-{session_id}"
    channel    = f"ticks:{instrument_key}" if instrument_key else None

    # ── Step 2 & 3: Connect to Redis and subscribe ────────────────────────────
    # Import here so the module loads even without redis installed
    import redis.asyncio as aioredis  # pip install redis[asyncio]

    client = aioredis.from_url(REDIS_URL, decode_responses=True)
    pubsub = client.pubsub(ignore_subscribe_messages=True)

    try:
        # Tell the feed service we're alive
        await client.publish(
            CONTROL_CHANNEL,
            json.dumps({"action": "subscribe", "serviceId": service_id,
                        "symbols": [instrument_key or symbol]})
        )

        if channel:
            await pubsub.subscribe(channel)
            log.info(f"[redis_tick_feed] Subscribed to Redis channel: {channel}")
        else:
            log.warning(f"[redis_tick_feed] No channel to subscribe to for {symbol}. No live ticks will come.")

        # ── Heartbeat task ────────────────────────────────────────────────────
        async def heartbeat_loop():
            while True:
                try:
                    await client.publish(
                        CONTROL_CHANNEL,
                        json.dumps({"action": "heartbeat", "serviceId": service_id})
                    )
                    await asyncio.sleep(HEARTBEAT_INTERVAL)
                except asyncio.CancelledError:
                    break
                except Exception:
                    await asyncio.sleep(HEARTBEAT_INTERVAL)

        hb_task = asyncio.create_task(heartbeat_loop())

        # Yield immediate cached snapshot if available so session doesn't wait for next live tick
        initial_snap = fetch_snapshot_via_rest(instrument_key or symbol)
        if initial_snap:
            log.info(f"[redis_tick_feed] Yielding instant snapshot for {symbol}: ₹{initial_snap.get('ltp')}")
            yield initial_snap

        # ── Step 4: Yield ticks ───────────────────────────────────────────────
        try:
            while True:
                try:
                    message = await asyncio.wait_for(
                        pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0),
                        timeout=TICK_TIMEOUT
                    )
                except asyncio.TimeoutError:
                    raise asyncio.TimeoutError(
                        f"No tick received for {symbol} within {TICK_TIMEOUT}s"
                    )

                if message and message.get("type") == "message":
                    try:
                        tick = json.loads(message["data"])
                        yield tick
                    except Exception:
                        pass
                else:
                    # No message yet — yield control briefly
                    await asyncio.sleep(0.01)

        finally:
            hb_task.cancel()
            try:
                await hb_task
            except asyncio.CancelledError:
                pass

    finally:
        # ── Step 5: Unsubscribe on exit ───────────────────────────────────────
        try:
            await client.publish(
                CONTROL_CHANNEL,
                json.dumps({"action": "unsubscribe_all", "serviceId": service_id})
            )
            log.info(f"[redis_tick_feed] Unsubscribed {service_id} from upstox-feed")
        except Exception:
            pass
        try:
            await pubsub.unsubscribe()
            await pubsub.aclose()
        except Exception:
            pass
        try:
            await client.aclose()
        except Exception:
            pass
