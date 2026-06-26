import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import NavBar from "./components/layout/Navbar.tsx";
import LoginModal from "./components/auth/LoginModule.tsx";
import CookieConsent from "./components/layout/CookieConsent.tsx";
import Footer from "./components/layout/Footer.tsx";
import HomePage from "./pages/HomePage.tsx";
import "./App.css";
import ProtectedRoute from "./auth/ProtectedRoute.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import StockPageSSE from "./pages/StokesPageSSE.tsx";
import FundsPage from "./pages/FundsPage.tsx";
import { ExploreSSEProvider } from "./context/ExploreSSEContext";
import { WebSocketProvider } from "./context/WebSocketContext";
import Portfolio from "./pages/Portfolio.tsx";
import SetPassword from "./components/auth/SetPassword.tsx";
import PrivacyPolicy from "./pages/PrivacyPolicy.tsx";
import TermsAndConditions from "./pages/TermsAndConditions.tsx";
import CookiePolicy from "./pages/CookiePolicy.tsx";
import Disclaimer from "./pages/Disclaimer.tsx";
import CustomerSupport from "./pages/CustomerSupport.tsx";
import NewsPage from "./pages/NewsPage.tsx";
import { PortfolioThemeProvider } from "./context/PortfolioThemeContext";

/* ---------------- TITLE MANAGER ---------------- */

const RouteTitleManager = () => {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname.startsWith("/stocks/")) {
      document.title = "PaperBull | Stock Details";
      return;
    }

    const routeTitles: Record<string, string> = {
      "/": "PaperBull | Home",
      "/dashboard": "PaperBull | Dashboard",
      "/user/balance": "PaperBull | Funds",
      "/news": "PaperBull | News & Announcements",
      "/privacy-policy": "PaperBull | Privacy Policy",
      "/terms": "PaperBull | Terms & Conditions",
      "/cookie-policy": "PaperBull | Cookie Policy",
      "/disclaimer": "PaperBull | Disclaimer",
      "/support": "PaperBull | Customer Support",
    };

    document.title = routeTitles[location.pathname] ?? "PaperBull";
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
    <PortfolioThemeProvider>
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
                  path="/stocks/:symbol/:name"
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
                <Route path="/support" element={<CustomerSupport />} />
                <Route path="/news" element={<NewsPage />} />

              </Routes>
            </div>
            <Footer />
          </ExploreSSEProvider>
        </WebSocketProvider>
      </BrowserRouter>
    </PortfolioThemeProvider>
  );
};

export default App;
