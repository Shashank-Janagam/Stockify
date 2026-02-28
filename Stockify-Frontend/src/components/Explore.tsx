// import { useContext } from "react";
// import { AuthContext } from "../auth/AuthProvider";
import { useNavigate } from "react-router-dom";
import stockifylogo from "../assets/StockiftLogo.png";
import { useExploreSSE } from "../context/ExploreSSEContext";

import "../Styles/explore.css";
import { useMemo } from "react";

function MiniGraph({ positive }: { positive: boolean }) {
  const points = useMemo(() => generatePoints(positive), [positive]);

  const path = useMemo(() => {
    return points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");
  }, [points]);

  return (
    <svg width="80" height="34" viewBox="0 0 80 34">
      <path
        d={path}
        fill="none"
        stroke={positive ? "#16a34a" : "#dc2626"}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="graph-line"
      />
    </svg>
  );
}

function generatePoints(positive: boolean) {
  const points = [];
  // Use a moderate vertical starting point
  let y = positive ? 25 : 9; 

  for (let i = 0; i < 10; i++) {
    // Medium swings (between -4.5 and +4.5) with moderate drift
    const swing = (Math.random() - 0.5) * 9; 
    const drift = positive ? -1.5 : 1.5; 
    
    y += swing + drift;
    
    // clamp within SVG bounds, leaving stroke width padding
    y = Math.max(4, Math.min(30, y));

    points.push({
      x: i * 8,
      y,
    });
  }

  // Ensure it shows a clear but moderate trend at the ends
  if (points.length > 0) {
    if (positive) points[points.length - 1].y = Math.min(points[points.length - 1].y, 14);
    else points[points.length - 1].y = Math.max(points[points.length - 1].y, 20);
  }

  return points;
}
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
  const { data, recentData, invested, ready } = useExploreSSE();

  // const [data, setData] = useState<any>(null);
// const [recentData, setRecentData] = useState<any[]>([]);
// const [invested, setInvested] = useState<any[]>([]);

  const navigate =useNavigate()
  // const [token, setToken] = useState<string | null>(null);
// const [exploreReady, setExploreReady] = useState(false);
// const [recentReady, setRecentReady] = useState(false);
const images = import.meta.glob(
  "../assets/*.{png,jpg,jpeg,svg,webp}",
  { eager: true }
);

const getImageSrc = (symbol: string): string => {
  const name = symbol.replace(".NS", "");

  const match = Object.keys(images).find(path =>
    path.includes(`/${name}.`)
  );

  return match
    ? (images[match] as any).default
    : (images["../assets/StockiftLogo.png"] as any).default;
};


  const handleStockClick = (stock: any) => {
  navigate(getStockRoute(stock.symbol, stock.name));
};

    // const { user } = useContext(AuthContext);
// useEffect(() => {
//   if (!user) return;

//   let cancelled = false;

//   const fetchToken = async () => {
//     try {
//       const jwt = await user.getIdToken(); // no force refresh needed
//       if (!cancelled) {
//         setToken(jwt);
//         // console.log(token)
//       }
//     } catch (err) {
//       console.error("Failed to fetch token", err);
//     }
//   };

//   fetchToken();

//   return () => {
//     cancelled = true;
//   };
// }, [user]);



//   const HOST = import.meta.env.VITE_HOST_ADDRESS;

//   useEffect(() => {
//     if (!token) return; // 🔑 CRITICAL GUARD
//     const source = new EventSource(
//       `${HOST}/api/explore?token=${token}`
//     );

//     source.onmessage = (event) => {
//       const parsed = JSON.parse(event.data);
//       setData(parsed);
//       setExploreReady(true);
//     };

//     source.onerror = () => {
//       console.error("SSE error or market closed");

//       source.close();
//     };

// return () => {
//     source.close();
//   };}, [token]);

//  useEffect(() => {
 
//     if (!token) return; // 🔑 CRITICAL GUARD

//     const source = new EventSource(
//       `${HOST}/api/explore/recent?token=${token}`
//     );    


//           source.onmessage = (event) => {
//   const parsed = JSON.parse(event.data);

//   setRecentData(parsed.recentlyViewed ?? []);
//   setInvested(parsed.invested ?? []);

//   setRecentReady(true);
// };



//       source.onerror = () => {

//           console.error("SSE error or market closed");
//           source.close();
//         };
// return () => {
//     source.close();
//   };
// }, [token]);

// const loading = !(exploreReady && recentReady);

// if (loading) return <ExploreSkeleton />;

if (!ready) return <ExploreSkeleton />;


  const { mostTraded, movers } = data;
//   console.log("most traded",mostTraded)
//   console.log("movers",movers)

  return (
    <div className="explore-page">
      {/* RECENTLY VIEWED */}
<section className="section">
  <h2>Recently viewed</h2>

  <div className="recent-grid">
    {recentData.map((r: any) => (
      <div
        key={r.symbol}
        className="recent-item clickable"
        onClick={() => handleStockClick(r)}
      >
        <img
          src={new URL(getImageSrc(r.symbol), import.meta.url).href}
          alt={r.name}
        />
        <div>{r.symbol.replace(".NS","")}</div>
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
            <h2>Most traded stocks on Stockify</h2>
           <div className="card-grid">
  {mostTraded.map((s: any) => (
<div className="stock-card clickable" onClick={() => handleStockClick(s)}>
  <div className="stock-top">
    <div className="logo-wrap">
      <img
        src={new URL(`${getImageSrc(s.symbol)}`, import.meta.url).href}
        alt={s.name}
      />
    </div>

    <MiniGraph positive={s.percent > 0} />
  </div>

  <div className="name">
    {s.name.split(" ")[0]} {s.name.split(" ")[1] || ""}
  </div>

  <div className="price">
    ₹{s.price?.toLocaleString("en-IN")}
  </div>

  <div className={s.percent > 0 ? "badge pos" : "badge neg"}>
    {s.percent > 0 ? "+" : ""}
    {s.percent}%
  </div>
</div>
  ))}
</div>

            <span className="link">See more →</span>
          </section>

          {/* TOP MARKET MOVERS */}
          <section className="section">
            <h2>Top market movers</h2>

           

            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th></th>
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
    >
      {/* Company column: logo + name + symbol */}
      <td>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <img
            src={new URL(`${getImageSrc(m.symbol)}`, import.meta.url).href}
            onError={(e) => (e.currentTarget.src = stockifylogo)}
            alt={m.name}
            className="table-logo"
          />
          <div>
            <div className="table-name">{m.name}</div>
            <div className="table-sym">{m.symbol.replace(".NS", "")}</div>
          </div>
        </div>
      </td>

      {/* Chart column */}
      <td className="table-chart-cell">
        <MiniGraph positive={m.percent > 0} />
      </td>

      {/* Price + % column */}
      <td className={m.percent > 0 ? "pos" : "neg"} id="marketprice">
        {m.price !== null ? `₹${m.price.toLocaleString("en-IN")}` : "—"}
        <div>
          {m.percent > 0 ? "+" : ""}{m.percent}%
        </div>
      </td>

      {/* Volume column */}
      <td className="vol">
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
    <div className="investment-header">
      <h3>Your Investments</h3>
      
    </div>

    {invested?.length === 0 ? (
      <div className="empty-box">
        You haven't invested yet
      </div>
    ) : (
      <div className="invest-list">
        {invested.map((s: any) => (
          <div className="invest-item clickable" onClick={() => handleStockClick(s)} key={s.symbol}>
  {/* Logo */}
  <img
    className="invest-logo"
    src={new URL(`${getImageSrc(s.symbol)}`, import.meta.url).href}
    alt={s.name}
    onError={(e) => (e.currentTarget.src = stockifylogo)}
  />

  {/* Name + symbol */}
  <div className="invest-text">
    <strong>{s.name.split(" ")[0]} {s.name.split(" ")[1] || ""}</strong>
    <span className="inv-sym">{s.symbol.replace(".NS", "")}</span>
  </div>

  {/* PnL */}
  <div className="invest-right">
    <div className={`invest-pnl ${s.percent >= 0 ? "pos" : "neg"}`}>
      ₹{s.price?.toLocaleString("en-IN")}
    </div>
    <div className={`invest-percent ${s.percent >= 0 ? "pos" : "neg"}`}>
      {s.percent >= 0 ? "+" : ""}{s.percent}%
    </div>
  </div>
</div>

        ))}
      </div>
    )}
  </div>
</aside>


      </div>
    </div>
  );
}
