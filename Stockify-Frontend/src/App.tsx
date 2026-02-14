import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import NavBar from "./components/Navbar.tsx";
import LoginModal from "./components/LoginModule.tsx";
import HomePage from "./pages/HomePage.tsx";
import "./App.css";
import ProtectedRoute from "./auth/ProtectedRoute.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import StockPageSSE from "./pages/StokesPageSSE.tsx";
import FundsPage from "./pages/FundsPage.tsx";
import { ExploreSSEProvider } from "./context/ExploreSSEContext";

import Portfolio from "./pages/Portfolio.tsx";




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
      <ExploreSSEProvider> {/* 🔥 PERSISTENT SSE */}
        <RouteTitleManager />

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
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

          </Routes>
        </div>
      </ExploreSSEProvider>
    </BrowserRouter>
  );
};

export default App;
