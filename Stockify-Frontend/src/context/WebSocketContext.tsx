
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AuthContext } from "../auth/AuthProvider";

// Topics that are "background" feeds — paused when a specific stock page is open
const BACKGROUND_TOPICS = ["EXPLORE_LIVE", "RECENT_LIVE", "HOLDINGS_LIVE", "INDICES_LIVE", "POSITIONS_LIVE"];

type WebSocketContextType = {
  subscribe: (topic: string, params?: any) => void;
  unsubscribe: (topic: string, params?: any) => void;
  lastMessage: any;
  isConnected: boolean;
  /** Call on stock-page mount: pauses all background feeds on the server */
  pauseBackgroundFeeds: () => void;
  /** Call on stock-page unmount: resumes all background feeds on the server */
  resumeBackgroundFeeds: () => void;
  /** True while background feeds are paused */
  isFeedsPaused: boolean;
};

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useContext(AuthContext);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const [isFeedsPaused, setIsFeedsPaused] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const subscriptions = useRef<Map<string, number>>(new Map());
  const userRef = useRef(user);
  const feedsPausedRef = useRef(false);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const HOST = import.meta.env.VITE_HOST_ADDRESS || "";

  const WS_URL = React.useMemo(() => {
    // 1. Handle relative paths (empty string or starts with /)
    if (!HOST || HOST.startsWith("/")) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      let path = HOST || "/api";
      // Ensure it ends with /api
      if (!path.endsWith("/api")) {
        path = path.endsWith("/") ? `${path}api` : `${path}/api`;
      }
      // Construct absolute URL (WebSocket requires absolute URL in most browsers)
      const url = `${protocol}//${window.location.host}${path}`;
      return url.replace(/([^:]\/)\/+/g, "$1"); // Normalize double slashes
    }

    // 2. Handle absolute URLs (e.g., http://localhost:4000)
    const wsUrl = HOST.replace(/^http/, "ws");
    const finalUrl = wsUrl.endsWith("/api") ? wsUrl : (wsUrl.endsWith("/") ? `${wsUrl}api` : `${wsUrl}/api`);
    return finalUrl.replace(/([^:]\/)\/+/g, "$1"); // Normalize double slashes
  }, [HOST]);

  useEffect(() => {
    let timeout: any;
    
    function connect() {
      console.log("🔌 Connecting to WebSocket...");
      console.log("Web Socket url:", WS_URL)
      const socket = new WebSocket(WS_URL);
      ws.current = socket;

      socket.onopen = () => {
        console.log("✅ WebSocket connected");
        setIsConnected(true);
        // Re-subscribe to existing topics (skip background if paused)
        for (const sub of subscriptions.current.keys()) {
          const [topic, paramsStr] = sub.split("|");
          if (feedsPausedRef.current && BACKGROUND_TOPICS.includes(topic)) continue;
          const params = paramsStr ? JSON.parse(paramsStr) : {};
          sendSubscription(topic, params);
        }
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
        } catch (err) {
          console.error("WS Message parse error:", err);
        }
      };

      socket.onclose = () => {
        console.log("❌ WebSocket disconnected");
        setIsConnected(false);
        ws.current = null;
        // Attempt reconnect
        timeout = setTimeout(connect, 3000);
      };

      socket.onerror = (err) => {
        console.error("WS Error:", err);
        socket.close();
      };
    }

    connect();

    return () => {
      if (ws.current) ws.current.close();
      clearTimeout(timeout);
    };
  }, [WS_URL]);

  async function sendSubscription(topic: string, params: any = {}) {
    if (ws.current?.readyState === WebSocket.OPEN) {
      let token = null;
      if (userRef.current) {
        token = await userRef.current.getIdToken();
      }
      ws.current.send(JSON.stringify({
        type: "SUBSCRIBE",
        topic,
        token,
        ...params
      }));
    }
  }

  function sendUnsubscription(topic: string, params: any = {}) {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: "UNSUBSCRIBE",
        topic,
        ...params
      }));
    }
  }

  // 🔥 Re-subscribe all when user logs in
  useEffect(() => {
    if (user && isConnected) {
      for (const sub of subscriptions.current.keys()) {
        const [topic, paramsStr] = sub.split("|");
        if (feedsPausedRef.current && BACKGROUND_TOPICS.includes(topic)) continue;
        const params = paramsStr ? JSON.parse(paramsStr) : {};
        sendSubscription(topic, params);
      }
    }
  }, [user, isConnected]);

  function subscribe(topic: string, params: any = {}) {
    const subKey = `${topic}|${JSON.stringify(params)}`;
    const currentCount = subscriptions.current.get(subKey) || 0;
    subscriptions.current.set(subKey, currentCount + 1);
    
    // Don't actually send to server if background feeds are paused and this is a background topic
    if (currentCount === 0) {
      if (feedsPausedRef.current && BACKGROUND_TOPICS.includes(topic)) {
        console.log(`⏸️ [WS] Skipping subscribe for paused background topic: ${topic}`);
        return;
      }
      sendSubscription(topic, params);
    }
  }

  function unsubscribe(topic: string, params: any = {}) {
    const subKey = `${topic}|${JSON.stringify(params)}`;
    const currentCount = subscriptions.current.get(subKey) || 0;
    
    if (currentCount <= 1) {
      subscriptions.current.delete(subKey);
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          type: "UNSUBSCRIBE",
          topic,
          ...params
        }));
      }
    } else {
      subscriptions.current.set(subKey, currentCount - 1);
    }
  }

  /** Pause all background feed subscriptions on the server (called when entering a stock page) */
  const pauseBackgroundFeeds = useCallback(() => {
    if (feedsPausedRef.current) return; // already paused
    feedsPausedRef.current = true;
    setIsFeedsPaused(true);
    console.log("⏸️ [WS] Pausing background feeds for stock page");

    // Send UNSUBSCRIBE for every active background subscription
    for (const sub of subscriptions.current.keys()) {
      const [topic, paramsStr] = sub.split("|");
      if (BACKGROUND_TOPICS.includes(topic)) {
        const params = paramsStr ? JSON.parse(paramsStr) : {};
        sendUnsubscription(topic, params);
      }
    }
  }, []);

  /** Resume all background feed subscriptions on the server (called when leaving a stock page) */
  const resumeBackgroundFeeds = useCallback(() => {
    if (!feedsPausedRef.current) return; // already running
    feedsPausedRef.current = false;
    setIsFeedsPaused(false);
    console.log("▶️ [WS] Resuming background feeds after stock page");

    // Re-subscribe all background topics that are still in the subscriptions map
    for (const sub of subscriptions.current.keys()) {
      const [topic, paramsStr] = sub.split("|");
      if (BACKGROUND_TOPICS.includes(topic)) {
        const params = paramsStr ? JSON.parse(paramsStr) : {};
        sendSubscription(topic, params);
      }
    }
  }, []);

  return (
    <WebSocketContext.Provider value={{ subscribe, unsubscribe, lastMessage, isConnected, pauseBackgroundFeeds, resumeBackgroundFeeds, isFeedsPaused }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error("useWebSocket must be used within WebSocketProvider");
  return ctx;
}
