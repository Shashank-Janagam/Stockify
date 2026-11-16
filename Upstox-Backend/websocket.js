/**
 * websocket.js
 * 
 * DEPRECATED: The monolithic direct WebSocket server has been superseded by the
 * Redis pub/sub Upstox feed microservice located at services/upstox-feed/index.js.
 * 
 * All live ticks are published to Redis channels `ticks:<instrument_key>` and cached in `ticks:latest`.
 * Consumer services subscribe dynamically via Redis channel `upstox:control`.
 * 
 * This file is retained as an alias to forward execution directly to the new service.
 */

import "./services/upstox-feed/index.js";
