import { createContext, useContext, useEffect, useRef, useState } from "react";
import { AuthContext } from "../auth/AuthProvider";

type ExploreContextType = {
  data: any;
  recentData: any[];
  invested: any[];
  ready: boolean;
};

const ExploreSSEContext = createContext<ExploreContextType | null>(null);

export function ExploreSSEProvider({ children }: { children: React.ReactNode }) {
  const { user } = useContext(AuthContext);

  const exploreSource = useRef<EventSource | null>(null);
  const recentSource = useRef<EventSource | null>(null);

  const [data, setData] = useState<any>(null);
  const [recentData, setRecentData] = useState<any[]>([]);
  const [invested, setInvested] = useState<any[]>([]);
  const [ready, setReady] = useState(false);

  const HOST = import.meta.env.VITE_HOST_ADDRESS;

  useEffect(() => {
    if (!user || exploreSource.current) return;

    let active = true;

    const init = async () => {
      const token = await user.getIdToken();

      // 🔥 EXPLORE SSE (ONCE PER TAB)
      exploreSource.current = new EventSource(
        `${HOST}/api/explore?token=${token}`
      );

      exploreSource.current.onmessage = (e) => {
        if (!active) return;
        setData(JSON.parse(e.data));
        setReady(true);
      };

      // 🔥 RECENT SSE
      recentSource.current = new EventSource(
        `${HOST}/api/explore/recent?token=${token}`
      );

      recentSource.current.onmessage = (e) => {
        if (!active) return;
        const parsed = JSON.parse(e.data);
        setRecentData(parsed.recentlyViewed ?? []);
        setInvested(parsed.invested ?? []);
      };
    };

    init();

    // ❌ DO NOT CLOSE ON ROUTE CHANGE
    return () => {
      active = false;
    };
  }, [user]);

  // ✅ Close ONLY when tab is closed
  useEffect(() => {
    const closeAll = () => {
      exploreSource.current?.close();
      recentSource.current?.close();
    };

    window.addEventListener("beforeunload", closeAll);
    return () => window.removeEventListener("beforeunload", closeAll);
  }, []);

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
