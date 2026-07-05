import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

interface SimilarStock {
  symbol: string;
  company_name: string;
}

function slugify(n: string) {
  return n.toLowerCase().trim().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const images = import.meta.glob(
  "../../assets/*.{png,jpg,jpeg,svg,webp}",
  { eager: true }
);

const getImageSrc = (symbol: string): string => {
  const name = symbol.replace(".NS", "").replace(".BO", "");

  const match = Object.keys(images).find(path =>
    path.includes(`/${name}.`)
  );

  return match
    ? (images[match] as any).default
    : (images["../../assets/imageinv.png"] as any).default;
};

interface CompanyProfileData {
  symbol: string;
  company_name: string;
  sector: string;
  industry: string;
  website: string;
  summary_text: string;
}

interface CompanyProfileProps {
  symbol: string;
  companyName: string;
}

export default function CompanyProfile({ symbol }: CompanyProfileProps) {
  const [profile, setProfile] = useState<CompanyProfileData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [similarStocks, setSimilarStocks] = useState<SimilarStock[]>([]);

  const PYTHON_HOST = import.meta.env.VITE_PYTHON_API_URL || "http://localhost:5001";

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);

    fetch(`${PYTHON_HOST}/api/news/stock/${encodeURIComponent(symbol)}/profile`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch profile");
        return res.json();
      })
      .then((data) => {
        if (data && !data.error) {
          setProfile(data);
        } else {
          setProfile(null);
        }
      })
      .catch((err) => {
        console.error("Error fetching company profile:", err);
        setProfile(null);
      })
      .finally(() => setLoading(false));
  }, [symbol, PYTHON_HOST]);

  useEffect(() => {
    if (!symbol) return;
    fetch(`${PYTHON_HOST}/api/news/stock/${encodeURIComponent(symbol)}/similar`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch similar stocks");
        return res.json();
      })
      .then((data) => {
        if (data && Array.isArray(data.similar_stocks)) {
          setSimilarStocks(data.similar_stocks);
        } else {
          setSimilarStocks([]);
        }
      })
      .catch((err) => {
        console.error("Error fetching similar stocks:", err);
        setSimilarStocks([]);
      });
  }, [symbol, PYTHON_HOST]);

  if (loading) {
    return (
      <div className="company-profile-section skeleton">
        <h3 className="section-title">About Company</h3>
        <div style={{ height: "16px", backgroundColor: "#f3f4f6", borderRadius: "4px", width: "60%", marginBottom: "12px" }}></div>
        <div style={{ height: "12px", backgroundColor: "#f3f4f6", borderRadius: "4px", width: "100%", marginBottom: "8px" }}></div>
        <div style={{ height: "12px", backgroundColor: "#f3f4f6", borderRadius: "4px", width: "95%", marginBottom: "8px" }}></div>
        <div style={{ height: "12px", backgroundColor: "#f3f4f6", borderRadius: "4px", width: "80%" }}></div>
      </div>
    );
  }

  if (!profile || profile.summary_text === "No corporate summary available.") {
    return null;
  }

  const cleanWebsite = profile.website && profile.website !== "N/A" ? profile.website : null;
  const displaySummary = isExpanded 
    ? profile.summary_text 
    : profile.summary_text.slice(0, 300) + (profile.summary_text.length > 300 ? "..." : "");

  return (
    <div className="company-profile-section">
      {similarStocks.length > 0 && (
        <div className="similar-stocks-section">
          <h4 className="similar-stocks-title">Similar Sector Stocks</h4>
          <div className="similar-stocks-grid">
            {similarStocks.map((s) => (
              <Link
                key={s.symbol}
                to={`/stocks/${s.symbol}/${slugify(s.company_name)}`}
                className="similar-stock-card"
              >
                <div className="similar-stock-logo-wrapper">
                  <img
                    src={new URL(`${getImageSrc(s.symbol)}`, import.meta.url).href}
                    alt={s.company_name}
                    className="similar-stock-logo"
                    onError={(e) => {
                      e.currentTarget.src = "/assets/default-logo.png";
                    }}
                  />
                </div>
                <div className="similar-stock-info">
                  <span className="similar-stock-name" title={s.company_name}>{s.company_name}</span>
                </div>
                <div className="similar-stock-arrow">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <h3 className="section-title">About {profile.company_name}</h3>
      
      <div className="profile-meta-badges">
        {profile.sector && profile.sector !== "N/A" && (
          <span className="profile-badge">
            Sector: {profile.sector}
          </span>
        )}
        {profile.industry && profile.industry !== "N/A" && (
          <span className="profile-badge">
            Industry: {profile.industry}
          </span>
        )}
        {cleanWebsite && (
          <a href={cleanWebsite} target="_blank" rel="noopener noreferrer" className="profile-badge website">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
            Website
          </a>
        )}
      </div>

      <div className="profile-summary-container">
        <p className="profile-summary-text">{displaySummary}</p>
        {profile.summary_text.length > 300 && (
          <button 
            className="toggle-summary-btn"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <>
                Show Less
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15"></polyline>
                </svg>
              </>
            ) : (
              <>
                Read More
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
