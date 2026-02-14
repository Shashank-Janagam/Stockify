import { useState, useEffect, lazy, Suspense } from "react";
import Explore from "../components/Explore";
import "../Styles/dashboard.css";
import HoldingsPage from "../components/HoldingsPage.tsx";
// import OrderHistory from "../components/OrderHistory.tsx"; // Remove static import
import { useLocation } from "react-router-dom";

// Lazy load the OrderHistory component
const OrderHistory = lazy(() => import("../components/OrderHistory.tsx"));



export default function Dashboard() {
  const location = useLocation();
  const [tab, setTab] = useState<string>(() => {
    // Priority: 1. Navigation State, 2. Session Storage, 3. Default
    return location.state?.tab || sessionStorage.getItem("CurrentDashboard") || "Explore";
  }); 

  // Update tab if location state changes (e.g. navigation from Navbar)
  useEffect(() => {
    if (location.state?.tab) {
      setTab(location.state.tab);
    }
  }, [location.state]);

 useEffect(() => {
    sessionStorage.setItem("CurrentDashboard", tab);
  }, [tab]);
  return (
    <div className="app">
      <header className="top-nav">
        <div className="tabbs">
          {["Explore", "Holdings", "Positions", "Orders", "Watchlist"].map(t => (
            <span
              key={t}
              className={tab === t ? "tabbs active" : "tabbs"}
              onClick={() => setTab(t)}
            >
              {t}
            </span>
          ))}
        </div>
       
      </header>
      <div className="app2">

      {tab === "Explore" && <Explore />}
      {tab === "Holdings" && <HoldingsPage />}
      {tab === "Orders" && (
        <Suspense fallback={<div className="loading-shimmer-block">Loading...</div>}>
          <OrderHistory />
        </Suspense>
      )}


    </div>
    </div>
  );
}
