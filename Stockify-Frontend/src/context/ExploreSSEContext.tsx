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
    if (!user) {
        setReady(false);
        setData(null);
        setRecentData([]);
        setInvested([]);
        return;
    }

    // Cancel existing connections if any (defensive)
    if (exploreSource.current) exploreSource.current.close();
    if (recentSource.current) recentSource.current.close();

    let active = true;

    const init = async () => {
      try {
        const token = await user.getIdToken();
        if (!active) return;

        // 🔥 EXPLORE SSE
        exploreSource.current = new EventSource(
            `${HOST}/api/explore?token=${token}`
        );

        exploreSource.current.onmessage = (e) => {
            if (!active) return;
            try {
                const parsed = JSON.parse(e.data);
                setData(parsed);
                setReady(true);
                // console.log("explore update", parsed);

                const marketState = parsed?.mostTraded?.[0]?.marketState;
                if (marketState && marketState !== "REGULAR") {
                    console.log("🛑 Market closed — stopping explore SSE");
                    exploreSource.current?.close();
                    exploreSource.current = null;
                }
            } catch (err) {
                console.error("Explore SSE parse error:", err);
            }
        };

        exploreSource.current.onerror = (e) => {
            console.error("Explore SSE error", e);
            exploreSource.current?.close();
        };

        // 🔥 RECENT SSE
        recentSource.current = new EventSource(
            `${HOST}/api/explore/recent?token=${token}`
        );

        recentSource.current.onmessage = (e) => {
            if (!active) return;
            try {
                const parsed = JSON.parse(e.data);
                setRecentData(parsed.recentlyViewed ?? []);
                setInvested(parsed.invested ?? []);

                const marketState =
                parsed?.recentlyViewed?.[0]?.marketState ||
                parsed?.invested?.[0]?.marketState;

                if (marketState && marketState !== "REGULAR") {
                    console.log("🛑 Market closed — stopping recent SSE");
                    recentSource.current?.close();
                    recentSource.current = null;
                }
            } catch (err) {
                 console.error("Recent SSE parse error:", err);
            }
        };

         recentSource.current.onerror = (e) => {
            console.error("Recent SSE error", e);
            recentSource.current?.close();
        };

      } catch (err) {
        console.error("Failed to init SSE:", err);
      }
    };

    init();

    return () => {
      active = false;
      exploreSource.current?.close();
      recentSource.current?.close();
      exploreSource.current = null;
      recentSource.current = null;
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
