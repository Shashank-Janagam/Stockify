import { onAuthStateChanged, signOut } from "firebase/auth";
import type{User} from "firebase/auth";
import { createContext, useEffect, useState, useRef } from "react";
import { auth } from "../firebase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
});

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
           const HOST = import.meta.env.VITE_HOST_ADDRESS;
           
           // 1. Check if session is valid
           const res = await fetch(`${HOST}/api/login/status`, {
             credentials: "include"
           });
           
           let isSessionValid = false;
           if (res.ok) {
             const data = await res.json();
             if (data.status === "active") isSessionValid = true;
           }

           // 2. If session invalid (race condition or expired), try to restore it
           if (!isSessionValid) {
             // console.log("Session missing/inactive. Attempting to restore...");
             try {
               const token = await firebaseUser.getIdToken();
               const loginRes = await fetch(`${HOST}/api/login`, {
                 method: "POST",
                 headers: { "Content-Type": "application/json" },
                 credentials: "include",
                 body: JSON.stringify({ token })
               });

               if (loginRes.ok) {
                 isSessionValid = true;
               }
             } catch (err) {
               console.error("Session restoration failed:", err);
             }
           }

           // 3. Final decision
           if (isSessionValid) {
              setUser(firebaseUser);
           } else {
              await signOut(auth);
              setUser(null);
           }

        } catch (error) {
           console.error("Session check failed, proceeding with Firebase user:", error);
           setUser(firebaseUser);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  /* ---------------- IDLE TIMEOUT ---------------- */
  const lastActivityRef = useRef(Date.now());

  // Throttled reset to avoid excessive updates (every 5s max)
  const resetTimer = () => {
    lastActivityRef.current = Date.now();
  };

  const handleLogout = async () => {
    try {
      const HOST = import.meta.env.VITE_HOST_ADDRESS;
      // Fire and forget logout to avoid blocking
      fetch(`${HOST}/api/login/logout`, {
        method: "POST",
        credentials: "include"
      }).catch(err => console.error("Logout backend error:", err));
      
    } finally {
      // Always cleanup locally
      await signOut(auth);
      setUser(null);
    }
  };

  useEffect(() => {
    if (!user) return;

    // Reset timer immediately when user logs in
    lastActivityRef.current = Date.now();

    // Events to track activity
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    
    // Add listeners
    events.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    // Check interval
    const checkInterval = setInterval(() => {
        const now = Date.now();
        // 5 minutes = 300,000 ms
        const IDLE_LIMIT = 60* 1000*5; 
        const diff = now - lastActivityRef.current;

        // console.log(`Idle check: ${Math.floor(diff / 1000)}s inactive`);

        if (diff > IDLE_LIMIT) {
            console.log("User idle for 5 mins. Logging out...");
            handleLogout();
        }
    },  30*1000); // Check every 30s for better precision

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
      clearInterval(checkInterval);
    };
  }, [user]);
  /* ---------------- DEBUG TIMER ---------------- */
  const [idleSeconds, setIdleSeconds] = useState(0);

  useEffect(() => {
    if (!user) return;

    const timerInterval = setInterval(() => {
      const diff = Date.now() - lastActivityRef.current;
      setIdleSeconds(Math.floor(diff / 1000));
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, logout: handleLogout }}>
      {children}
      {user && (
        <div style={{
          position: "fixed",
          bottom: "10px",
          right: "10px",
          background: "black",
          color: "white",
          padding: "5px 10px",
          borderRadius: "5px",
          fontSize: "12px",
          zIndex: 9999,
          pointerEvents: "none",
          opacity: 0.8
        }}>
          Idle: {idleSeconds}s / 300s
        </div>
      )}
    </AuthContext.Provider>
  );
}

export default AuthProvider;
