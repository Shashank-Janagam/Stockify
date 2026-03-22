import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import NavBar from "./components/Navbar.tsx";
import LoginModal from "./components/LoginModule.tsx";
import CookieConsent from "./components/CookieConsent.tsx";
import Footer from "./components/Footer.tsx";
import HomePage from "./pages/HomePage.tsx";
import "./App.css";
import ProtectedRoute from "./auth/ProtectedRoute.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import StockPageSSE from "./pages/StokesPageSSE.tsx";
import FundsPage from "./pages/FundsPage.tsx";
import { ExploreSSEProvider } from "./context/ExploreSSEContext";
import { WebSocketProvider } from "./context/WebSocketContext";
import Portfolio from "./pages/Portfolio.tsx";
import SetPassword from "./components/SetPassword.tsx";
import PrivacyPolicy from "./pages/PrivacyPolicy.tsx";
import TermsAndConditions from "./pages/TermsAndConditions.tsx";
import CookiePolicy from "./pages/CookiePolicy.tsx";
import Disclaimer from "./pages/Disclaimer.tsx";



/* ---------------- TITLE MANAGER ---------------- */

const RouteTitleManager = () => {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname.startsWith("/indiaSEE/")) {
      document.title = "Stockify | Stock Details";
      return;
    }

    const routeTitles: Record<string, string> = {
      "/": "Stockify | Home",
      "/dashboard": "Stockify | Dashboard",
      "/user/balance": "Stockify | Funds",
      "/privacy-policy": "Stockify | Privacy Policy",
      "/terms": "Stockify | Terms & Conditions",
      "/cookie-policy": "Stockify | Cookie Policy",
      "/disclaimer": "Stockify | Disclaimer",
    };

    document.title = routeTitles[location.pathname] ?? "Stockify";
  }, [location.pathname]);

  return null;
};

/* ---------------- APP ---------------- */

const App = () => {
  const [showLogin, setShowLogin] = useState(false);

  // Load Razorpay once
  useEffect(() => {
    if (document.getElementById("razorpay-sdk")) return;

    const script = document.createElement("script");
    script.id = "razorpay-sdk";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;

    document.body.appendChild(script);
  }, []);

  return (
    <BrowserRouter>
      <WebSocketProvider>
        <ExploreSSEProvider> {/* 🔥 PERSISTENT SSE */}
          <RouteTitleManager />
          
          <CookieConsent />

          <NavBar onLoginClick={() => setShowLogin(true)} />

          {showLogin && (
            <LoginModal onClose={() => setShowLogin(false)} />
          )}

          <div className="page-content">
            <Routes>
              <Route
                path="/"
                element={<HomePage onLoginClick={() => setShowLogin(true)} />}
              />

              <Route
                path="/indiaSEE/:symbol/:name"
                element={<StockPageSSE onLoginClick={() => setShowLogin(true)} />}
              />

              <Route
                path="/user/balance"
                element={
                  <ProtectedRoute>
                    <FundsPage />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/portfolio"
                element={
                  <ProtectedRoute>
                    <Portfolio />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/set-password"
                element={
                  <ProtectedRoute>
                    <SetPassword />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />

              {/* ---- Policy Pages ---- */}
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsAndConditions />} />
              <Route path="/cookie-policy" element={<CookiePolicy />} />
              <Route path="/disclaimer" element={<Disclaimer />} />

            </Routes>
          </div>
          <Footer />
        </ExploreSSEProvider>
      </WebSocketProvider>
    </BrowserRouter>
  );
};

export default App;
