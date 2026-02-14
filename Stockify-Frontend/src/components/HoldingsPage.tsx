import React, { useEffect, useState, useContext } from "react";
import "../Styles/HoldingsPage.css";
import { AuthContext } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";
type Holding = {
  symbol: string;
  name: string;
  quantity: number;
  currentPrice: number;
  dayChangePercent: number;
  invested: number;
  current: number;
  pnl: number;
  pnlPercent: number;
  datetime:string
};

type Summary = {
  investedValue: number;
  currentValue: number;
  totalReturns: number;
  totalReturnsPercent: number;
};
function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
function getStockRoute(
  symbol: string,
  name: string
) {
  const symbol1 = symbol.trim().toUpperCase();
  const slug = slugify(name);


  if (symbol1.endsWith(".NS") || symbol1.endsWith(".BO")) {
    return `/indiaSEE/${symbol1}/${slug}`;
  }

  return `/us/${symbol1}/${slug}`;
}
const HOST = import.meta.env.VITE_HOST_ADDRESS;
const HoldingsPage: React.FC = () => {
  const { user } = useContext(AuthContext);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
const navigate = useNavigate();
  useEffect(() => {
    if (!user) return;

    const fetchHoldings = async () => {
      const res = await fetch(`${HOST}/api/holdings/stocks`, {
          credentials:"include",
      });
      const data = await res.json();
      setHoldings(data.holdings);
      setSummary(data.summary);
      setLoading(false);
      
    };

    fetchHoldings();
  }, [user]);

  return (
    <div className="holdings-wrapper">
      {/* LEFT */}
      <div className="holdings-left">
        {/* SUMMARY */}
        <div className="summary-card">
          {loading ? (
            <div className="summary-skeleton skeleton" />
          ) : (
            <>
              <div>
                <p className="label " >Current value</p>
                <h2 className={summary!.totalReturns >= 0 ? "positive" : "negative"}>₹{summary!.currentValue.toLocaleString("en-IN")}</h2>
                
              </div>

              <div>
                <p className="label">Invested value</p>
                <h2>₹{summary!.investedValue.toLocaleString("en-IN")}</h2>
              </div>

              <div>
                <p className="label">Total returns</p>
                <div className="percent">
                <h2 className={summary!.totalReturns >= 0 ? "positive" : "negative"}>
                  {summary!.totalReturns >= 0 ? "+" : ""}
                  ₹{summary!.totalReturns.toLocaleString("en-IN")}
                  
                </h2>
                <span className={summary!.totalReturns >= 0 ? "positive down" : "negative down"}>
                  {summary!.totalReturns >= 0 ? "+" : ""}
                  {summary!.totalReturnsPercent.toFixed(2)}%
                </span>
              </div>
              </div>
             
            </>
          )}
        </div>

        {/* TABLE */}
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Market price (1D)</th>
                <th>Returns</th>
                <th>Current / Invested</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={4}>
                        <div className="row-skeleton skeleton" />
                      </td>
                    </tr>
                  ))
                : holdings.map(h => (
                    <tr key={h.symbol} onClick={() => navigate(getStockRoute(h.symbol, h.name))} className="clickable">
                      <td>
                        <strong>{h.name}</strong>
                        <div className="muted">{h.quantity} shares</div>
                      </td>

                      <td>
                        <strong>₹{h.currentPrice}</strong>
                        <div className={h.dayChangePercent >= 0 ? "positive" : "negative"}>
                          {h.dayChangePercent >= 0 ? "+" : ""}
                          {h.dayChangePercent}%
                        </div>
                      </td>

                      <td className={h.pnl >= 0 ? "positive" : "negative"}>
                        <strong>
                          {h.pnl >= 0 ? "+" : ""}₹{h.pnl}
                        </strong>
                        <div>
                          {h.pnl >= 0 ? "+" : ""}
                          {h.pnlPercent}%
                        </div>
                      </td>

                      <td>
                        <strong>₹{h.current}</strong>
                        <div className="muted">₹{h.invested}</div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

     
    </div>
  );
};

export default HoldingsPage;
