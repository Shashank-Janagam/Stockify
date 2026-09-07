import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import StockLogo from "../common/StockLogo";
import { getBasketDetails } from "../../data/constituentsData";
import "../../Styles/ConstituentsContainer.css";

interface ConstituentsContainerProps {
  symbol: string;
  companyName?: string;
  isIndex?: boolean;
  isFund?: boolean;
}

function slugify(name: string) {
  return (name || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Smart Semantic Sector Matcher
 * Maps high-level sector group categories to subsector tags
 */
function isSectorMatch(itemSector: string, filterSector: string): boolean {
  if (!filterSector || filterSector === "ALL") return true;
  if (!itemSector) return false;

  const itemSec = itemSector.toLowerCase().trim();
  const filtSec = filterSector.toLowerCase().trim();

  // 1. Direct or Substring match
  if (itemSec === filtSec || itemSec.includes(filtSec) || filtSec.includes(itemSec)) {
    return true;
  }

  // 2. Semantic Keyword Mappings
  const synMap: Record<string, string[]> = {
    "financial services": ["bank", "banking", "nbfc", "fintech", "finance", "insurance", "depository", "exchange", "capital market", "private bank", "public bank", "financials"],
    "banking": ["financial services", "private bank", "public bank", "bank"],
    "private sector banks": ["private bank", "banking", "bank"],
    "public sector banks": ["public bank", "banking", "bank"],
    "information technology": ["it", "it services", "software", "tech", "cloud", "saas", "digital", "digital engineering", "solutions"],
    "it consulting & software": ["it", "it services", "software", "tech", "cloud", "saas"],
    "it services": ["information technology", "it", "software", "tech"],
    "oil, gas & consumables": ["oil", "gas", "energy", "petroleum", "refining", "conglomerate", "exploration"],
    "oil & gas": ["oil", "gas", "energy", "petroleum", "refining", "exploration"],
    "oil & gas exploration": ["oil", "gas", "energy", "petroleum"],
    "automobile & auto comps": ["auto", "automobile", "ev", "tyre", "tyres", "motor", "vehicles", "commercial vehicle", "2w", "4w", "suv", "tractors", "forging"],
    "automobiles": ["auto", "automobile", "motor", "vehicles", "2w", "4w", "ev"],
    "automobiles - 4w & uvs": ["auto", "automobile", "motor", "vehicles", "ev", "passenger cars", "suv"],
    "automobiles - 2w & 3w": ["auto", "motor", "vehicles", "2w", "3w", "scooters", "motorcycles"],
    "auto ancillaries & tyres": ["auto", "ancillary", "tyre", "tyres", "forging", "mobility"],
    "fast moving consumer goods": ["fmcg", "consumer", "beverage", "beverages", "foods", "tobacco", "personal care"],
    "fmcg": ["fast moving consumer goods", "consumer", "food", "beverages"],
    "healthcare & pharma": ["pharma", "pharmaceutical", "health", "healthcare", "hospital", "api", "generics", "diagnostic", "specialty pharma"],
    "generic formulations": ["pharma", "pharmaceutical", "generics", "formulations"],
    "pharma": ["healthcare & pharma", "pharmaceutical", "generics", "api", "medicine"],
    "metals & mining": ["metal", "steel", "mining", "aluminium", "copper", "zinc", "lignite"],
    "mining & minerals": ["mining", "minerals", "coal", "lignite"],
    "power & utilities": ["power", "utilities", "energy", "electricity", "solar", "wind", "hydro", "transmission"],
    "defense & aerospace": ["defense", "aerospace", "shipyard", "electronics"],
    "capital goods & infra": ["infrastructure", "infra", "capital goods", "construction", "engineering"],
    "consumer & retail": ["retail", "consumer", "apparel", "jewellery", "e-commerce", "durables"],
    "precious metals": ["gold", "silver", "bullion", "commodity", "metals"],
    "cash management": ["cash", "repo", "treps", "liquid"],
    "financial exchanges & capital markets": ["exchange", "depository", "fintech", "broker", "capital markets"],
  };

  for (const [groupKey, keywords] of Object.entries(synMap)) {
    const isFiltInGroup = filtSec === groupKey || filtSec.includes(groupKey) || groupKey.includes(filtSec);
    if (isFiltInGroup) {
      if (keywords.some((kw) => itemSec.includes(kw) || kw.includes(itemSec))) {
        return true;
      }
    }
  }

  // 3. Token-level overlap
  const filtTokens = filtSec.replace(/[^a-z0-9]/g, " ").split(/\s+/).filter((t) => t.length > 2);
  const itemTokens = itemSec.replace(/[^a-z0-9]/g, " ").split(/\s+/).filter((t) => t.length > 2);
  return filtTokens.some((ft) => itemTokens.some((it) => ft === it || it.includes(ft) || ft.includes(it)));
}

export const ConstituentsContainer: React.FC<ConstituentsContainerProps> = ({
  symbol,
  companyName,
  isIndex,
  isFund,
}) => {
  const navigate = useNavigate();
  const [filterText, setFilterText] = useState("");
  const [selectedSector, setSelectedSector] = useState<string>("ALL");

  const basket = getBasketDetails(symbol);

  if (!basket) {
    return null;
  }

  const containerTitle = basket.title || companyName || symbol;

  const handleStockClick = (sym: string, name: string) => {
    const cleanSym = sym.replace(/\.(NS|BO)$/, "").trim().toUpperCase();
    const route = `/stocks/${cleanSym}.NS/${slugify(name)}`;
    navigate(route);
  };

  // Filter constituents by search text and smart sector matcher
  const filteredConstituents = basket.constituents.filter((item) => {
    const cleanQuery = filterText.trim().toLowerCase();
    const matchesSearch =
      !cleanQuery ||
      item.name.toLowerCase().includes(cleanQuery) ||
      item.symbol.toLowerCase().includes(cleanQuery) ||
      item.sector.toLowerCase().includes(cleanQuery);

    const matchesSector = isSectorMatch(item.sector, selectedSector);

    return matchesSearch && matchesSector;
  });

  const maxWeight = Math.max(...basket.constituents.map((c) => c.weight), 1);

  return (
    <div className="constituents-card">
      {/* ── HEADER ── */}
      <div className="constituents-header">
        <div className="constituents-title-group">
          <div className="constituents-badge-row">
            <span className={`basket-type-badge type-${basket.category.toLowerCase().replace(/[^a-z]/g, "")}`}>
              {isIndex ? "INDEX BASKET" : isFund ? "MUTUAL FUND HOLDINGS" : `${basket.category.toUpperCase()} PORTFOLIO`}
            </span>
            <span className="constituents-count-badge">
              {basket.totalConstituents} Underlying Companies
            </span>
          </div>
          <h2 className="constituents-main-title">{containerTitle}</h2>
          <p className="constituents-subtitle">{basket.subtitle}</p>
        </div>

        {/* ── STATS PILLS ── */}
        <div className="constituents-stats-grid">
          {basket.benchmark && (
            <div className="stat-pill-box">
              <span className="stat-pill-label">Benchmark</span>
              <span className="stat-pill-value">{basket.benchmark}</span>
            </div>
          )}
          {basket.amc && (
            <div className="stat-pill-box">
              <span className="stat-pill-label">Fund Manager</span>
              <span className="stat-pill-value">{basket.amc}</span>
            </div>
          )}
          <div className="stat-pill-box">
            <span className="stat-pill-label">Top Sector</span>
            <span className="stat-pill-value">
              {basket.sectors[0]?.sector || "Diversified"} ({basket.sectors[0]?.weight}%)
            </span>
          </div>
        </div>
      </div>

      {/* ── SECTOR ALLOCATION PROGRESS BAR ── */}
      {basket.sectors.length > 0 && (
        <div className="sector-breakdown-section">
          <div className="sector-section-title">Sector Allocation Breakdown</div>
          
          <div className="sector-multi-bar">
            {basket.sectors.map((sec, idx) => (
              <div
                key={sec.sector + idx}
                className="sector-bar-segment"
                style={{
                  width: `${sec.weight}%`,
                  backgroundColor: sec.color,
                }}
                title={`${sec.sector}: ${sec.weight}%`}
              />
            ))}
          </div>

          <div className="sector-legend-wrap">
            <button
              className={`sector-chip ${selectedSector === "ALL" ? "active" : ""}`}
              onClick={() => setSelectedSector("ALL")}
            >
              All Sectors
            </button>
            {basket.sectors.map((sec, idx) => (
              <button
                key={sec.sector + idx}
                className={`sector-chip ${selectedSector === sec.sector ? "active" : ""}`}
                onClick={() => setSelectedSector(selectedSector === sec.sector ? "ALL" : sec.sector)}
              >
                <span className="sector-chip-dot" style={{ backgroundColor: sec.color }} />
                <span>{sec.sector}</span>
                <strong className="sector-chip-pct">{sec.weight}%</strong>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── SEARCH & FILTER CONTROLS ── */}
      <div className="constituents-filter-bar">
        <div className="constituents-search-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder={`Search within ${basket.title}...`}
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
          {filterText && (
            <button className="clear-filter-btn" onClick={() => setFilterText("")}>
              ✕
            </button>
          )}
        </div>
        <div className="constituents-showing-count">
          Showing {filteredConstituents.length} of {basket.constituents.length} top holdings
        </div>
      </div>

      {/* ── CONSTITUENTS GRID / LIST ── */}
      <div className="constituents-grid">
        {filteredConstituents.map((item, idx) => {
          const barWidth = Math.max((item.weight / maxWeight) * 100, 8);
          return (
            <div
              key={item.symbol + idx}
              className="constituent-card-item"
              onClick={() => handleStockClick(item.symbol, item.name)}
              title={`Click to view ${item.name} (${item.symbol})`}
            >
              <div className="constituent-left">
                <div className="constituent-logo-wrapper">
                  <StockLogo symbol={item.symbol} name={item.name} />
                </div>
                <div className="constituent-info">
                  <div className="constituent-name-row">
                    <span className="constituent-name">{item.name}</span>
                    <span className="constituent-sector-tag">{item.sector}</span>
                  </div>
                  <div className="constituent-sym-row">
                    <span className="constituent-symbol">{item.symbol}</span>
                    <span className="constituent-exchange">NSE</span>
                  </div>
                </div>
              </div>

              <div className="constituent-right">
                <div className="weightage-data">
                  <span className="weightage-val">{item.weight}%</span>
                  <span className="weightage-label">Weight</span>
                </div>
                <div className="weightage-bar-track">
                  <div
                    className="weightage-bar-fill"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              </div>

              <div className="constituent-arrow">↗</div>
            </div>
          );
        })}
      </div>

      {filteredConstituents.length === 0 && (
        <div className="constituents-empty-state">
          <p>No constituent stocks match &ldquo;{filterText}&rdquo;</p>
          <button onClick={() => { setFilterText(""); setSelectedSector("ALL"); }}>
            Reset Filters
          </button>
        </div>
      )}

      {/* ── BASKET ABOUT FOOTER ── */}
      <div className="basket-about-footer">
        <div className="about-footer-title">About this Basket</div>
        <p className="about-footer-desc">{basket.description}</p>
      </div>
    </div>
  );
};

export default ConstituentsContainer;
