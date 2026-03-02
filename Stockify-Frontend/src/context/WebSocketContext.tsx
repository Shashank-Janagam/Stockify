
import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { AuthContext } from "../auth/AuthProvider";

type WebSocketContextType = {
  subscribe: (topic: string, params?: any) => void;
  unsubscribe: (topic: string, params?: any) => void;
  lastMessage: any;
  isConnected: boolean;
};

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useContext(AuthContext);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const ws = useRef<WebSocket | null>(null);
  const subscriptions = useRef<Set<string>>(new Set());

  const HOST = import.meta.env.VITE_HOST_ADDRESS || "";

  const WS_URL = React.useMemo(() => {
    // Handle relative paths (empty string or starts with /)
    if (HOST === "" || HOST.startsWith("/")) {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const path = HOST === "" ? "/api" : (HOST.endsWith("/api") ? HOST : `${HOST}/api`);
      return `${protocol}//${window.location.host}${path}`;
    }
    // Handle absolute URLs (like http://localhost:4000)
    const wsUrl = HOST.replace(/^http/, "ws");
    return wsUrl.endsWith("/api") ? wsUrl : `${wsUrl}/api`;
  }, [HOST]);

  useEffect(() => {
    let timeout: any;
    
    function connect() {
      console.log("🔌 Connecting to WebSocket...");
      const socket = new WebSocket(WS_URL);
      ws.current = socket;

      socket.onopen = () => {
        console.log("✅ WebSocket connected");
        setIsConnected(true);
        // Re-subscribe to existing topics
        subscriptions.current.forEach(sub => {
          const [topic, paramsStr] = sub.split("|");
          const params = paramsStr ? JSON.parse(paramsStr) : {};
          sendSubscription(topic, params);
        });
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
      if (user) {
        token = await user.getIdToken();
      }
      ws.current.send(JSON.stringify({
        type: "SUBSCRIBE",
        topic,
        token,
        ...params
      }));
    }
  }

  function subscribe(topic: string, params: any = {}) {
    const subKey = `${topic}|${JSON.stringify(params)}`;
    if (subscriptions.current.has(subKey)) return;
    
    subscriptions.current.add(subKey);
    sendSubscription(topic, params);
  }

  function unsubscribe(topic: string, params: any = {}) {
    const subKey = `${topic}|${JSON.stringify(params)}`;
    subscriptions.current.delete(subKey);
    
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: "UNSUBSCRIBE",
        topic,
        ...params
      }));
    }
  }

  return (
    <WebSocketContext.Provider value={{ subscribe, unsubscribe, lastMessage, isConnected }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error("useWebSocket must be used within WebSocketProvider");
  return ctx;
}
