import { onAuthStateChanged, signOut } from "firebase/auth";
import type{User} from "firebase/auth";
import { createContext, useEffect, useState, useRef, type ReactNode } from "react";
import { auth } from "../firebase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  isGoogleOnlyUser:boolean;

}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: async () => {},
  isGoogleOnlyUser:false,
});

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
const [isGoogleOnlyUser, setIsGoogleOnlyUser] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
           const HOST = import.meta.env.VITE_HOST_ADDRESS || "";
           
           // 1. Check if session is valid
           const res = await fetch(`${HOST}/api/login/checkLogin`, {
             credentials: "include"
           });
           
           let isSessionValid = false;
           if (res.ok) {
             const data = await res.json();
             if (data.status === "active") isSessionValid = true;
           }

           // 2. If session invalid (race condition or expired), try to restore it silently
           if (!isSessionValid) {
             console.log("Session missing or inactive. Attempting to restore session...");
             const idToken = await firebaseUser.getIdToken();
             const loginRes = await fetch(`${HOST}/api/login`, {
               method: "POST",
               headers: {
                 "Content-Type": "application/json"
               },
               credentials: "include",
               body: JSON.stringify({ token: idToken })
             });
             
             if (loginRes.ok) {
               isSessionValid = true;
               console.log("Session successfully restored.");
             }
           }

           // 3. Final decision
           if (isSessionValid) {
              const providers = firebaseUser.providerData.map(p => p.providerId);
              const isGoogle = providers.includes("google.com");
              const hasPassword = providers.includes("password");
              setIsGoogleOnlyUser(isGoogle && !hasPassword);
              setUser(firebaseUser);
            } else {
              console.warn("Failed to restore session. Logging out...");
              await handleLogout();
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

  const handleLogout = async () => {
    try {
      const HOST = import.meta.env.VITE_HOST_ADDRESS || "";
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

  const handleLogoutRef = useRef(handleLogout);
  useEffect(() => {
    handleLogoutRef.current = handleLogout;
  }, [handleLogout]);

  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      try {
        const response = await originalFetch(input, init);
        if (response.status === 401) {
          const urlStr = typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : (input as Request).url || "";

          if (urlStr.includes("/api/") && !urlStr.includes("/api/login")) {
            console.warn("Session expired on backend (401). Logging out...");
            handleLogoutRef.current();
          }
        }
        return response;
      } catch (error) {
        throw error;
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout: handleLogout,isGoogleOnlyUser }}>
      {children}

    </AuthContext.Provider>
  );
}
export default AuthProvider;
