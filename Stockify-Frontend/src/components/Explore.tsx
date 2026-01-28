import { useContext, useEffect, useState } from "react";
import { AuthContext } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import googleimage from "../assets/google.png";
function ExploreSkeleton() {
  return (
    <div className="explore-page">
      <section className="section">
        <h2>Recently viewed</h2>
        <div className="recent-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="recent-item">
              <div className="sk sk-avatar" />
              <div className="sk sk-text" />
              <div className="sk sk-text small" />
            </div>
          ))}
        </div>
      </section>

      <div className="main-grid">
        <div>
          <section className="section">
            <h2>Most traded stocks on Groww</h2>
            <div className="card-grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="stock-card">
                  <div className="sk sk-icon" />
                  <div className="sk sk-text" />
                  <div className="sk sk-text small" />
                  <div className="sk sk-text small" />
                </div>
              ))}
            </div>
          </section>

          <section className="section">
            <h2>Top market movers</h2>
            <div className="table-card">
              <table>
                <tbody>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td><div className="sk sk-text" /></td>
                      <td><div className="sk sk-text" /></td>
                      <td><div className="sk sk-text" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="right-panel">
          <div className="investment-box">
            <div className="sk sk-box" />
          </div>
          <div className="tools-box">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="sk sk-text" />
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
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
export default function Explore() {
  const [data, setData] = useState<any>(null);
const [recentData, setRecentData] = useState<{ recent: any[] }>({ recent: [] });
  const navigate =useNavigate()
  const [token, setToken] = useState<string | null>(null);
const [exploreReady, setExploreReady] = useState(false);
const [recentReady, setRecentReady] = useState(false);

  const handleStockClick = (stock: any) => {
  navigate(getStockRoute(stock.symbol, stock.name));
};

    const { user } = useContext(AuthContext);
useEffect(() => {
  if (!user) return;

  let cancelled = false;

  const fetchToken = async () => {
    try {
      const jwt = await user.getIdToken(); // no force refresh needed
      if (!cancelled) {
        setToken(jwt);
        // console.log(token)
      }
    } catch (err) {
      console.error("Failed to fetch token", err);
    }
  };

  fetchToken();

  return () => {
    cancelled = true;
  };
}, [user]);



  const HOST = import.meta.env.VITE_HOST_ADDRESS;

  useEffect(() => {
    if (!token) return; // 🔑 CRITICAL GUARD

    const source = new EventSource(
      `${HOST}/api/explore?token=${token}`
    );

    source.onmessage = (event) => {
      const parsed = JSON.parse(event.data);
      setData(parsed);
      setExploreReady(true);
      console.log("data received:", parsed);
    };

    source.onerror = () => {
      console.error("SSE error or market closed");

      source.close();
    };

return () => {
    source.close();
  };}, [token]);

 useEffect(() => {
    if (!token) return; // 🔑 CRITICAL GUARD

    const source = new EventSource(
      `${HOST}/api/explore/recent?token=${token}`
    );

          source.onmessage = (event) => {
          const parsed = JSON.parse(event.data);
          setRecentReady(true);

          console.log("recent data received:", parsed);
          setRecentData(parsed ?? { recent: [] });
        };


      source.onerror = () => {

          console.error("SSE error or market closed");
          source.close();
        };
return () => {
    source.close();
  };
}, [token]);

const loading = !(exploreReady && recentReady);

if (loading) return <ExploreSkeleton />;

  if (loading) {
    return <ExploreSkeleton />;
  }

  const { mostTraded, movers } = data;
  console.log("most traded",mostTraded)
  console.log("movers",movers)

  return (
    <div className="explore-page">
      {/* RECENTLY VIEWED */}
      <section className="section">
        <h2>Recently viewed</h2>
        <div className="recent-grid">
            {recentData?.recent.map((r: any) => (
              <div
      key={r.symbol}
      className="recent-item clickable"
      onClick={() => handleStockClick(r)}
    >
      <img
    src={`https://logo.clearbit.com/${r.symbol.replace(".NS","").toLowerCase()}.com`}
    onError={(e) => (e.currentTarget.src = googleimage)}
    alt={r.name}
  />
                <div>{r.name.split(" ")[0]}</div>
                <span className={r.percent > 0 ? "pos" : "neg"}>
                  {r.percent > 0 ? "+" : ""}
                  {r.percent}%
                </span>
              </div>
            ))}
          </div>

      </section>

      <div className="main-grid">
        {/* LEFT */}
        <div>
          {/* MOST TRADED */}
          <section className="section">
            <h2>Most traded stocks on Groww</h2>
           <div className="card-grid">
  {mostTraded.map((s: any) => (
<div
      key={s.symbol}
      className="stock-card clickable"
      onClick={() => handleStockClick(s)}
    >    <img
    src={`https://logo.clearbit.com/${s.symbol.replace(".NS","").toLowerCase()}.com`}
    onError={(e) => (e.currentTarget.src = googleimage)}
    alt={s.name}
  />  <div className="name">{s.name.split(" ")[0]} {s.name.split(" ")[1] ? s.name.split(" ")[1] : " "}</div>
      <div className="price">
        {s.price !== null ? `₹${s.price.toLocaleString("en-IN")}` : "—"}
      </div>
      <div className={s.percent > 0 ? "pos" : "neg"}>
        {s.change !== null ? (s.change > 0 ? `${s.change}` : s.change) : "—"}
        `({s.percent > 0 ? "+" : ""} {s.percent}%)`
      </div>
    </div>
  ))}
</div>

            <span className="link">See more →</span>
          </section>

          {/* TOP MARKET MOVERS */}
          <section className="section">
            <h2>Top market movers</h2>

            <div className="filters">
              <button className="filter active">Gainers</button>
              <button className="filter">Losers</button>
              <button className="filter">Volume shockers</button>
              <select>
                <option>NIFTY 100</option>
              </select>
            </div>

            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Market price (1D)</th>
                    <th>Volume</th>
                  </tr>
                </thead>
                <tbody>
  {movers.map((m: any) => (
<tr
      key={m.symbol}
      className="clickable"
      onClick={() => handleStockClick(m)}
    >      <td style={{ display: "flex", alignItems: "center", gap: "8px" }}>
    <img
      src={`https://logo.clearbit.com/${m.symbol.replace(".NS","").toLowerCase()}.com`}
      onError={(e) => (e.currentTarget.src = googleimage)}
      alt={m.name}
      style={{ width: 20, height: 20 }}
    />
    {m.name.split(" ")[0]}
  </td>
      <td className={m.percent > 0 ? "pos" : "neg"} id="marketprice" >
        {m.price !== null ? `₹${m.price.toLocaleString("en-IN")}` : "—"}
        <div>
          {m.percent > 0 ? "+" : ""}
          {m.percent}%
        </div>

      </td>
      <td>
        {m.volume.toLocaleString("en-IN")}
      </td>
    </tr>
  ))}
</tbody>

              </table>
            </div>
          </section>
        </div>

        {/* RIGHT PANEL */}
        <aside className="right-panel">
          <div className="investment-box">
            <h3>Your investments</h3>
            <div className="empty-box">
              You haven't invested yet
            </div>
          </div>

        </aside>
      </div>
    </div>
  );
}
