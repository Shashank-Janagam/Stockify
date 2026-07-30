import YahooFinance from "yahoo-finance2";
import WebSocket from "ws";

const yahoo = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

let ws = null;
let priceCache = {};
let isConnected = false;
let reconnectTimer = null;
const feedUrl = process.env.UPSTOX_WS_URL || "ws://localhost:4141";

// Event callback for live ticks
let onTickCallback = null;
let fallbackInterval = null;
let activeSymbols = new Set();

export function setTickListener(callback) {
    onTickCallback = callback;
}

function connectWs() {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) return;

    try {
        console.log(`[PriceMonitor] Connecting to Upstox WS at ${feedUrl}...`);
        ws = new WebSocket(feedUrl);

        ws.on("open", () => {
            console.log("[PriceMonitor] ✅ Connected to Upstox WS!");
            isConnected = true;
            if (activeSymbols.size > 0) {
                subscribe([...activeSymbols]);
            }
        });

        ws.on("message", (data) => {
            try {
                const parsed = JSON.parse(data.toString());
                if (parsed.type === "LIVE_TICK" || (parsed.symbol && parsed.ltp)) {
                    const rawSymbol = parsed.symbol || "";
                    const cleanSymbol = rawSymbol.replace(/\.NS$/, "").toUpperCase();
                    
                    priceCache[cleanSymbol] = parsed.ltp;
                    priceCache[`${cleanSymbol}.NS`] = parsed.ltp;
                    
                    // Immediately trigger tick event for real-time stoploss
                    if (onTickCallback) {
                        onTickCallback(cleanSymbol, parsed.ltp);
                    }
                }
            } catch (err) {}
        });

        ws.on("error", (err) => {
            console.error("[PriceMonitor] ❌ WS Error:", err.message);
        });

        ws.on("close", () => {
            isConnected = false;
            console.log("[PriceMonitor] 🔌 WS Disconnected. Retrying in 10s...");
            scheduleReconnect();
        });
    } catch (err) {
        console.error("[PriceMonitor] ❌ Failed to connect:", err.message);
        scheduleReconnect();
    }
}

function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectWs();
    }, 10000);
}

function subscribe(symbols) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!Array.isArray(symbols) || symbols.length === 0) return;
    try {
        const cleanSymbols = symbols.map(s => s.replace(/\.NS$/, "").toUpperCase());
        console.log(`[PriceMonitor] 📡 Subscribing to: ${cleanSymbols.join(", ")}`);
        ws.send(JSON.stringify({
            action: "subscribe",
            symbols: cleanSymbols,
            reset: false
        }));
    } catch (err) {
        console.error("[PriceMonitor] Subscribe error:", err.message);
    }
}

function unsubscribe(symbols) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (!Array.isArray(symbols) || symbols.length === 0) return;
    try {
        const cleanSymbols = symbols.map(s => s.replace(/\.NS$/, "").toUpperCase());
        console.log(`[PriceMonitor] 📴 Unsubscribing from: ${cleanSymbols.join(", ")}`);
        ws.send(JSON.stringify({
            action: "unsubscribe",
            symbols: cleanSymbols
        }));
    } catch (err) {
        console.error("[PriceMonitor] Unsubscribe error:", err.message);
    }
}

export function updateTrackedSymbols(symbols = []) {
    const newSymbols = new Set(symbols);
    const removed = [...activeSymbols].filter(sym => !newSymbols.has(sym));
    const added = [...newSymbols].filter(sym => !activeSymbols.has(sym));
    
    activeSymbols = newSymbols;

    if (isConnected) {
        if (added.length > 0) {
            subscribe(added);
        }
        if (removed.length > 0) {
            unsubscribe(removed);
        }
    }
}

// Check if market is live
function isMarketLive() {
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

// Fallback polling loop when WS is down
async function fallbackPolling() {
    if (activeSymbols.size === 0) return;
    if (isConnected && isMarketLive()) return; // WS is working, skip polling

    try {
        const symbolsArray = [...activeSymbols];
        const quotes = await yahoo.quote(symbolsArray);
        const results = Array.isArray(quotes) ? quotes : [quotes];
        
        for (const quote of results) {
            if (!quote || !quote.symbol || !quote.regularMarketPrice) continue;
            const price = quote.regularMarketPrice;
            const cleanSymbol = quote.symbol.replace(/\.NS$/, "").toUpperCase();
            
            priceCache[cleanSymbol] = price;
            priceCache[`${cleanSymbol}.NS`] = price;
            
            if (onTickCallback) {
                onTickCallback(cleanSymbol, price);
            }
        }
    } catch (err) {
        console.error("[PriceMonitor] Fallback polling error");
    }
}

// Start WS connection and fallback timer
connectWs();
fallbackInterval = setInterval(fallbackPolling, 5000);
