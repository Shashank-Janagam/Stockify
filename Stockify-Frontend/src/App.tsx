import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState, useEffect } from "react";
import NavBar from "./components/Navbar.tsx";
import LoginModal from "./components/LoginModule.tsx";
import HomePage from "./pages/HomePage.tsx";
import "./App.css";
import ProtectedRoute from "./auth/ProtectedRoute.tsx";
import Dashboard from "./pages/Dashboard.tsx";
// import StockPageIndia from "./pages/StockPageIndia.tsx"
import StockPageSSE from "./pages/StokesPageSSE.tsx";
import FundsPage from "./pages/FundsPage.tsx";

const App = () => {
  const [showLogin, setShowLogin] = useState(false);

  // ✅ Load Razorpay once
  useEffect(() => {
    if (document.getElementById("razorpay-sdk")) return;

    const script = document.createElement("script");
    script.id = "razorpay-sdk";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;

    script.onload = () => {
      console.log("Razorpay SDK loaded");
    };

    document.body.appendChild(script);
  }, []);

  return (
    <BrowserRouter>
      <NavBar onLoginClick={() => setShowLogin(true)} />

      {/* Login modal */}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}

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

          <Route path="/user/balance" element={<FundsPage />} />

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
    </BrowserRouter>
  );
};

export default App;
