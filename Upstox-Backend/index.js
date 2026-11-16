/**
 * index.js — Upstox Backend Root Entry Point
 * 
 * Boots the Redis-based Upstox Market Data Feed service:
 *  - Upstox Protobuf WebSocket → Redis pub/sub (ticks:<instrument_key>)
 *  - Redis Snapshot Cache (ticks:latest hash)
 *  - Dynamic subscription control (upstox:control channel)
 *  - REST API on port 4141 (/api/resolve, /api/snapshot, /api/stocks, /api/control)
 */

import "./services/upstox-feed/index.js";
