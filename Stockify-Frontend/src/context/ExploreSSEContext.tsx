import { createContext, useContext, useEffect, useState } from "react";
import { AuthContext } from "../auth/AuthProvider";
import { useWebSocket } from "./WebSocketContext";

type ExploreContextType = {
  data: any;
  recentData: any[];
  invested: any[];
  ready: boolean;
};

const ExploreSSEContext = createContext<ExploreContextType | null>(null);

export function ExploreSSEProvider({ children }: { children: React.ReactNode }) {
  const { user } = useContext(AuthContext);

  const [data, setData] = useState<any>(null);
  const [recentData, setRecentData] = useState<any[]>([]);
  const [invested, setInvested] = useState<any[]>([]);
  const [ready, setReady] = useState(false);
  
  const { subscribe, unsubscribe, lastMessage } = useWebSocket();
  


  useEffect(() => {
    if (!user) {
      setReady(false);
      setData(null);
      setRecentData([]);
      setInvested([]);
      return;
    }

    subscribe("EXPLORE_LIVE");
    subscribe("RECENT_LIVE");

    return () => {
      unsubscribe("EXPLORE_LIVE");
      unsubscribe("RECENT_LIVE");
    };
  }, [user]);

  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === "EXPLORE_UPDATE") {
      setData(lastMessage.data);
      setReady(true);
      
      const marketState = lastMessage.data?.mostTraded?.[0]?.marketState;
      if (marketState && marketState !== "REGULAR") {
        console.log("🛑 Market closed — explore update received");
      }
    }

    if (lastMessage.type === "RECENT_UPDATE") {
      setRecentData(lastMessage.data.recentlyViewed ?? []);
      setInvested(lastMessage.data.invested ?? []);
    }
  }, [lastMessage]);


  return (
    <ExploreSSEContext.Provider
      value={{ data, recentData, invested, ready }}
    >
      {children}
    </ExploreSSEContext.Provider>
  );
}

export function useExploreSSE() {
  const ctx = useContext(ExploreSSEContext);
  if (!ctx) throw new Error("useExploreSSE outside provider");
  return ctx;
}
