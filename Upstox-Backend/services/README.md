# upstox-feed — Redis Pub/Sub Service

Replaces the monolithic `websocket.js` with a **services architecture** backed by Redis pub/sub.

## Quick Start

### 1. Start Redis

```bash
# Docker (recommended)
docker compose up -d redis

# Or native Windows (chocolatey)
# choco install redis-64
# redis-server
```

### 2. Install ioredis

```bash
npm install
```

### 3. Configure `.env`

```
MONGO_URI=mongodb://...
REDIS_URL=redis://127.0.0.1:6379
FEED_API_URL=http://localhost:4141
PORT_4141=4141
SUBSCRIPTIONS_FILE=subscriptions.json
```

### 4. Start the feed service

```bash
npm run feed
# or
node services/upstox-feed/index.js
```

---

## Architecture

```
Consumer Service
      │
      │  PUBLISH upstox:control {"action":"subscribe","serviceId":"algo","symbols":["RELIANCE"]}
      ▼
   Redis ◄──── upstox-feed service ────► Upstox Market Data Feed WebSocket
      │                                        (protobuf decode)
      │  SUBSCRIBE ticks:NSE_EQ|INE002A01018
      ▼
Consumer Service receives LIVE_TICK JSON
```

---

## Consumer Service Integration

### Node.js

```js
import { UpstoxFeedClient } from "./services/upstox-feed-client.js";

const client = new UpstoxFeedClient({ serviceId: "my-service" });
await client.connect();
await client.subscribe(["RELIANCE", "TCS", "HDFCBANK"]);

client.on("tick", (tick) => {
  console.log(tick.symbol, tick.ltp);
});

// Graceful shutdown
process.on("SIGINT", () => client.shutdown());
```

### Python

```python
from services.upstox_feed_consumer import UpstoxFeedConsumer

consumer = UpstoxFeedConsumer(service_id="algo-engine-1")
consumer.on_tick(lambda tick: print(tick["symbol"], tick["ltp"]))
consumer.subscribe(["RELIANCE", "TCS"])
consumer.start()  # blocks; Ctrl-C to stop
```

---

## Control Message Protocol

Publish JSON to Redis channel **`upstox:control`**:

| Action | Fields | Description |
|---|---|---|
| `subscribe` | `serviceId`, `symbols[]` | Subscribe to symbols (names or instrument_keys) |
| `unsubscribe` | `serviceId`, `symbols[]` | Unsubscribe from specific symbols |
| `unsubscribe_all` | `serviceId` | Release all of a service's subscriptions |
| `heartbeat` | `serviceId` | Renew liveness (must send every ≤ 15 s) |

---

## Redis Key Schema

| Key | Type | Description |
|---|---|---|
| `registry:symbols` | Hash | `instrument_key` → `["svc1","svc2"]` |
| `ticks:latest` | Hash | `instrument_key` → last tick JSON |
| `ticks:<instrument_key>` | Pub/Sub | Live tick stream per instrument |
| `upstox:control` | Pub/Sub | Control messages from services |
| `service:heartbeat:<id>` | String (TTL 30s) | Liveness key |

---

## REST API (backward-compat, port 4141)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/stocks` | List all loaded symbols |
| `GET` | `/api/resolve/:symbol` | Resolve name → instrument_key |
| `GET` | `/api/snapshot/:key` | Last cached tick (from Redis) |
| `POST` | `/api/subscribe` | Add symbol + subscribe `{ symbol, instrument_key, name, serviceId? }` |
| `POST` | `/api/control` | HTTP proxy for control messages |

---

## File Structure

```
Upstox-Backend/
├── services/
│   ├── upstox-feed/
│   │   ├── index.js              ← service entry point
│   │   ├── upstoxClient.js       ← Upstox WS + protobuf decode
│   │   ├── redisClient.js        ← ioredis singleton clients
│   │   ├── redisPublisher.js     ← publish ticks + snapshot cache
│   │   ├── symbolRegistry.js     ← Redis-backed registry
│   │   ├── controlListener.js    ← upstox:control channel handler
│   │   └── heartbeatReaper.js    ← culls dead-service subscriptions
│   ├── upstox-feed-client.js     ← Node.js consumer SDK
│   └── upstox_feed_consumer.py  ← Python consumer SDK
├── docker-compose.yml            ← Redis container
├── TokenModel.js                 (unchanged)
├── MarketDataFeed.proto          (unchanged)
├── update_subscriptions.js       (unchanged)
├── websocket.js                  (legacy — can be retired)
└── package.json                  (+ ioredis)
```
