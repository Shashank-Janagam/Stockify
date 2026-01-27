import { useState } from "react";
import Explore from "../components/Explore";
import "../Styles/dashboard.css";

export default function Dashboard() {
  const [tab, setTab] = useState("Explore");

  return (
    <div className="app">
      <header className="top-nav">
        <div className="tabs">
          {["Explore", "Holdings", "Positions", "Orders", "Watchlist"].map(t => (
            <span
              key={t}
              className={tab === t ? "tab active" : "tab"}
              onClick={() => setTab(t)}
            >
              {t}
            </span>
          ))}
        </div>
        <div className="top-actions">
          <button className="pill">Terminal</button>
          <div className="pill">915</div>
        </div>
      </header>

      {tab === "Explore" && <Explore />}
    </div>
  );
}