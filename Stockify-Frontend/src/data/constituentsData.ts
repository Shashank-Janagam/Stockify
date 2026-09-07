// src/data/constituentsData.ts

export interface ConstituentStock {
  symbol: string;
  name: string;
  weight: number; // percentage (e.g. 13.5 for 13.5%)
  sector: string;
  price?: number;
}

export interface SectorWeight {
  sector: string;
  weight: number;
  color: string;
}

export interface BasketDetails {
  title: string;
  subtitle: string;
  category: "Index" | "Mutual Fund" | "ETF" | "Commodity";
  benchmark?: string;
  amc?: string;
  totalConstituents: number;
  sectors: SectorWeight[];
  constituents: ConstituentStock[];
  description: string;
}

export const BASKET_DATA: Record<string, BasketDetails> = {
  // ─── NIFTY 50 & NIFTY 50 ETFS ───
  "^NSEI": {
    title: "NIFTY 50 Index Constituents",
    subtitle: "India's Flagship Benchmark Index of Top 50 Bluechip Companies",
    category: "Index",
    benchmark: "NIFTY 50 Total Returns",
    totalConstituents: 50,
    description: "The NIFTY 50 is the benchmark index of the National Stock Exchange of India (NSE). It represents the weighted average of 50 of the largest Indian companies across 13 economic sectors.",
    sectors: [
      { sector: "Financial Services", weight: 33.2, color: "#3b82f6" },
      { sector: "Information Technology", weight: 13.8, color: "#8b5cf6" },
      { sector: "Oil, Gas & Consumables", weight: 11.5, color: "#f59e0b" },
      { sector: "Automobile & Auto Comps", weight: 8.4, color: "#10b981" },
      { sector: "Fast Moving Consumer Goods", weight: 7.9, color: "#ec4899" },
      { sector: "Healthcare & Pharma", weight: 4.8, color: "#06b6d4" },
      { sector: "Metals & Mining", weight: 4.2, color: "#64748b" },
      { sector: "Others", weight: 16.2, color: "#94a3b8" },
    ],
    constituents: [
      { symbol: "HDFCBANK", name: "HDFC Bank Ltd", weight: 13.5, sector: "Banking" },
      { symbol: "RELIANCE", name: "Reliance Industries Ltd", weight: 9.2, sector: "Energy & Conglomerate" },
      { symbol: "ICICIBANK", name: "ICICI Bank Ltd", weight: 7.8, sector: "Banking" },
      { symbol: "INFY", name: "Infosys Ltd", weight: 5.9, sector: "IT Services" },
      { symbol: "TCS", name: "Tata Consultancy Services Ltd", weight: 4.1, sector: "IT Services" },
      { symbol: "ITC", name: "ITC Ltd", weight: 3.8, sector: "FMCG" },
      { symbol: "LT", name: "Larsen & Toubro Ltd", weight: 3.7, sector: "Capital Goods & Infra" },
      { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd", weight: 3.5, sector: "Telecom" },
      { symbol: "AXISBANK", name: "Axis Bank Ltd", weight: 3.2, sector: "Banking" },
      { symbol: "SBIN", name: "State Bank of India", weight: 3.1, sector: "Banking" },
      { symbol: "MM", name: "Mahindra & Mahindra Ltd", weight: 2.6, sector: "Automobile" },
      { symbol: "MARUTI", name: "Maruti Suzuki India Ltd", weight: 2.2, sector: "Automobile" },
      { symbol: "SUNPHARMA", name: "Sun Pharmaceutical Industries", weight: 2.0, sector: "Healthcare" },
      { symbol: "TITAN", name: "Titan Company Ltd", weight: 1.8, sector: "Consumer Durables" },
      { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd", weight: 1.7, sector: "NBFC" },
      { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank Ltd", weight: 1.7, sector: "Banking" },
      { symbol: "ULTRACEMCO", name: "UltraTech Cement Ltd", weight: 1.5, sector: "Materials" },
      { symbol: "NTPC", name: "NTPC Ltd", weight: 1.4, sector: "Power" },
      { symbol: "POWERGRID", name: "Power Grid Corporation of India", weight: 1.3, sector: "Power" },
      { symbol: "TATAMOTORS", name: "Tata Motors Ltd", weight: 1.2, sector: "Automobile" },
    ],
  },

  // ─── SENSEX ───
  "^BSESN": {
    title: "SENSEX (BSE 30) Constituents",
    subtitle: "Bombay Stock Exchange 30 Largest & Most Actively Traded Stocks",
    category: "Index",
    benchmark: "S&P BSE SENSEX",
    totalConstituents: 30,
    description: "The SENSEX is a free-float market-weighted stock market index of 30 well-established and financially sound companies listed on Bombay Stock Exchange.",
    sectors: [
      { sector: "Financial Services", weight: 38.5, color: "#3b82f6" },
      { sector: "Information Technology", weight: 14.8, color: "#8b5cf6" },
      { sector: "Oil & Gas", weight: 11.2, color: "#f59e0b" },
      { sector: "Automobiles", weight: 7.9, color: "#10b981" },
      { sector: "FMCG", weight: 7.4, color: "#ec4899" },
      { sector: "Others", weight: 20.2, color: "#94a3b8" },
    ],
    constituents: [
      { symbol: "HDFCBANK", name: "HDFC Bank Ltd", weight: 15.2, sector: "Banking" },
      { symbol: "RELIANCE", name: "Reliance Industries Ltd", weight: 10.4, sector: "Energy" },
      { symbol: "ICICIBANK", name: "ICICI Bank Ltd", weight: 8.9, sector: "Banking" },
      { symbol: "INFY", name: "Infosys Ltd", weight: 6.7, sector: "IT Services" },
      { symbol: "TCS", name: "Tata Consultancy Services Ltd", weight: 4.8, sector: "IT Services" },
      { symbol: "ITC", name: "ITC Ltd", weight: 4.2, sector: "FMCG" },
      { symbol: "LT", name: "Larsen & Toubro Ltd", weight: 4.1, sector: "Infrastructure" },
      { symbol: "BHARTIARTL", name: "Bharti Airtel Ltd", weight: 3.9, sector: "Telecom" },
      { symbol: "AXISBANK", name: "Axis Bank Ltd", weight: 3.6, sector: "Banking" },
      { symbol: "SBIN", name: "State Bank of India", weight: 3.5, sector: "Banking" },
      { symbol: "MM", name: "Mahindra & Mahindra Ltd", weight: 2.8, sector: "Automobile" },
      { symbol: "MARUTI", name: "Maruti Suzuki India Ltd", weight: 2.5, sector: "Automobile" },
      { symbol: "SUNPHARMA", name: "Sun Pharmaceutical Industries", weight: 2.3, sector: "Pharma" },
      { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd", weight: 2.0, sector: "NBFC" },
    ],
  },

  // ─── BANK NIFTY & BANKING ETFS ───
  "^NSEBANK": {
    title: "NIFTY BANK Index Constituents",
    subtitle: "12 Most Liquid and Large-Cap Indian Banking Stocks",
    category: "Index",
    benchmark: "NIFTY Bank Index",
    totalConstituents: 12,
    description: "NIFTY Bank Index comprises the most liquid and large capitalized Indian banking stocks. It serves as a benchmark for the Indian banking sector.",
    sectors: [
      { sector: "Private Sector Banks", weight: 81.5, color: "#3b82f6" },
      { sector: "Public Sector Banks", weight: 18.5, color: "#10b981" },
    ],
    constituents: [
      { symbol: "HDFCBANK", name: "HDFC Bank Ltd", weight: 29.2, sector: "Private Bank" },
      { symbol: "ICICIBANK", name: "ICICI Bank Ltd", weight: 23.4, sector: "Private Bank" },
      { symbol: "SBIN", name: "State Bank of India", weight: 11.5, sector: "Public Bank" },
      { symbol: "AXISBANK", name: "Axis Bank Ltd", weight: 9.8, sector: "Private Bank" },
      { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank Ltd", weight: 9.4, sector: "Private Bank" },
      { symbol: "INDUSINDBK", name: "IndusInd Bank Ltd", weight: 5.6, sector: "Private Bank" },
      { symbol: "BANKBARODA", name: "Bank of Baroda", weight: 2.8, sector: "Public Bank" },
      { symbol: "PNB", name: "Punjab National Bank", weight: 2.2, sector: "Public Bank" },
      { symbol: "FEDERALBNK", name: "Federal Bank Ltd", weight: 2.1, sector: "Private Bank" },
      { symbol: "IDFCFIRSTB", name: "IDFC First Bank Ltd", weight: 1.8, sector: "Private Bank" },
      { symbol: "BANDHANBNK", name: "Bandhan Bank Ltd", weight: 1.2, sector: "Private Bank" },
    ],
  },

  // ─── NIFTY IT & TECH ETFS ───
  "^CNXIT": {
    title: "NIFTY IT Index Constituents",
    subtitle: "Top 10 Indian Information Technology & Software Leaders",
    category: "Index",
    benchmark: "NIFTY IT Index",
    totalConstituents: 10,
    description: "NIFTY IT Index provides investors and market participants with a benchmark that captures the performance of the Indian IT sector.",
    sectors: [
      { sector: "IT Consulting & Software", weight: 88.5, color: "#8b5cf6" },
      { sector: "Product & SaaS", weight: 11.5, color: "#06b6d4" },
    ],
    constituents: [
      { symbol: "TCS", name: "Tata Consultancy Services Ltd", weight: 27.5, sector: "IT Services" },
      { symbol: "INFY", name: "Infosys Ltd", weight: 26.8, sector: "IT Services" },
      { symbol: "HCLTECH", name: "HCL Technologies Ltd", weight: 10.2, sector: "IT Services" },
      { symbol: "WIPRO", name: "Wipro Ltd", weight: 8.5, sector: "IT Services" },
      { symbol: "LTIM", name: "LTIMindtree Ltd", weight: 7.1, sector: "IT Services" },
      { symbol: "TECHM", name: "Tech Mahindra Ltd", weight: 6.8, sector: "IT Services" },
      { symbol: "PERSISTENT", name: "Persistent Systems Ltd", weight: 5.2, sector: "Digital Engineering" },
      { symbol: "COFORGE", name: "Coforge Ltd", weight: 4.1, sector: "IT Solutions" },
      { symbol: "MPHASIS", name: "Mphasis Ltd", weight: 2.8, sector: "Cloud & AI" },
      { symbol: "KPITTECH", name: "KPIT Technologies Ltd", weight: 2.0, sector: "Automotive Software" },
    ],
  },

  // ─── FINNIFTY ───
  "^CNXFIN": {
    title: "NIFTY Financial Services Constituents",
    subtitle: "20 Leaders across Banks, NBFCs, Insurance & Asset Managers",
    category: "Index",
    benchmark: "NIFTY Financial Services Index",
    totalConstituents: 20,
    description: "Designed to reflect the behavior and performance of the Indian financial market, including banks, financial institutions, housing finance, insurance and other financial services companies.",
    sectors: [
      { sector: "Banking", weight: 65.2, color: "#3b82f6" },
      { sector: "NBFCs", weight: 16.8, color: "#f59e0b" },
      { sector: "Life & General Insurance", weight: 11.5, color: "#10b981" },
      { sector: "Other Financials", weight: 6.5, color: "#8b5cf6" },
    ],
    constituents: [
      { symbol: "HDFCBANK", name: "HDFC Bank Ltd", weight: 23.5, sector: "Banking" },
      { symbol: "ICICIBANK", name: "ICICI Bank Ltd", weight: 18.2, sector: "Banking" },
      { symbol: "BAJFINANCE", name: "Bajaj Finance Ltd", weight: 7.8, sector: "NBFC" },
      { symbol: "SBIN", name: "State Bank of India", weight: 7.5, sector: "Banking" },
      { symbol: "AXISBANK", name: "Axis Bank Ltd", weight: 6.9, sector: "Banking" },
      { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank Ltd", weight: 6.5, sector: "Banking" },
      { symbol: "HDFCLIFE", name: "HDFC Life Insurance Co Ltd", weight: 4.2, sector: "Insurance" },
      { symbol: "SBILIFE", name: "SBI Life Insurance Co Ltd", weight: 3.8, sector: "Insurance" },
      { symbol: "BAJAJFINSV", name: "Bajaj Finserv Ltd", weight: 3.5, sector: "Holding Co" },
      { symbol: "CHOLAFIN", name: "Cholamandalam Investment & Fin", weight: 3.2, sector: "NBFC" },
      { symbol: "SHRIRAMFIN", name: "Shriram Finance Ltd", weight: 2.8, sector: "NBFC" },
      { symbol: "PFC", name: "Power Finance Corporation Ltd", weight: 2.5, sector: "Infra Finance" },
      { symbol: "RECLTD", name: "REC Ltd", weight: 2.2, sector: "Power Finance" },
      { symbol: "IRFC", name: "Indian Railway Finance Corp", weight: 1.9, sector: "Railway Finance" },
    ],
  },

  // ─── CPSE ETF ───
  CPSEETF: {
    title: "CPSE ETF Underlying Holdings",
    subtitle: "Maharatna & Navratna Central Public Sector Enterprises",
    category: "ETF",
    amc: "Nippon India Mutual Fund",
    benchmark: "Nifty CPSE Index",
    totalConstituents: 11,
    description: "The CPSE ETF invests in shares of Central Public Sector Enterprises (CPSEs) held by the Government of India, featuring high dividend yields and major infrastructure monopolies.",
    sectors: [
      { sector: "Power & Utilities", weight: 43.7, color: "#f59e0b" },
      { sector: "Oil & Gas Exploration", weight: 22.8, color: "#ef4444" },
      { sector: "Mining & Minerals", weight: 14.2, color: "#64748b" },
      { sector: "Defense & Aerospace", weight: 11.5, color: "#3b82f6" },
      { sector: "Construction", weight: 7.8, color: "#10b981" },
    ],
    constituents: [
      { symbol: "NTPC", name: "NTPC Ltd", weight: 20.1, sector: "Power" },
      { symbol: "POWERGRID", name: "Power Grid Corporation of India", weight: 18.8, sector: "Power Transmission" },
      { symbol: "ONGC", name: "Oil and Natural Gas Corporation", weight: 15.6, sector: "Oil & Gas" },
      { symbol: "COALINDIA", name: "Coal India Ltd", weight: 14.2, sector: "Mining" },
      { symbol: "BEL", name: "Bharat Electronics Ltd", weight: 11.5, sector: "Defense" },
      { symbol: "OIL", name: "Oil India Ltd", weight: 7.2, sector: "Oil Exploration" },
      { symbol: "NHPC", name: "NHPC Ltd", weight: 4.8, sector: "Hydro Power" },
      { symbol: "NBCC", name: "NBCC (India) Ltd", weight: 3.2, sector: "Infrastructure" },
      { symbol: "SJVN", name: "SJVN Ltd", weight: 2.6, sector: "Renewable Power" },
      { symbol: "NLCINDIA", name: "NLC India Ltd", weight: 2.0, sector: "Lignite Mining" },
    ],
  },

  // ─── AUTOBEES ───
  AUTOBEES: {
    title: "Nippon India ETF Nifty Auto Holdings",
    subtitle: "Leading 4-Wheelers, 2-Wheelers, Commercial Vehicles & Auto Ancillary Stocks",
    category: "ETF",
    amc: "Nippon India Mutual Fund",
    benchmark: "Nifty Auto Index",
    totalConstituents: 15,
    description: "An open-ended Exchange Traded Scheme replicating the Nifty Auto Index, providing targeted exposure to India's automotive manufacturing powerhouses.",
    sectors: [
      { sector: "Automobiles - 4W & UVs", weight: 57.5, color: "#10b981" },
      { sector: "Automobiles - 2W & 3W", weight: 24.5, color: "#3b82f6" },
      { sector: "Auto Ancillaries & Tyres", weight: 18.0, color: "#f59e0b" },
    ],
    constituents: [
      { symbol: "TATAMOTORS", name: "Tata Motors Ltd", weight: 19.8, sector: "Commercial & EV" },
      { symbol: "MM", name: "Mahindra & Mahindra Ltd", weight: 19.2, sector: "SUVs & Tractors" },
      { symbol: "MARUTI", name: "Maruti Suzuki India Ltd", weight: 18.5, sector: "Passenger Cars" },
      { symbol: "BAJAJ_AUTO", name: "Bajaj Auto Ltd", weight: 10.2, sector: "2W & 3W Vehicles" },
      { symbol: "EICHERMOT", name: "Eicher Motors Ltd", weight: 7.8, sector: "Royal Enfield 2W" },
      { symbol: "HEROMOTOCO", name: "Hero MotoCorp Ltd", weight: 6.5, sector: "2W Motorcycles" },
      { symbol: "TVSMOTOR", name: "TVS Motor Company Ltd", weight: 5.8, sector: "2W & Scooters" },
      { symbol: "BHARATFORG", name: "Bharat Forge Ltd", weight: 4.2, sector: "Forging & Auto Ancs" },
      { symbol: "BOSCHLTD", name: "Bosch Ltd", weight: 3.8, sector: "Mobility Solutions" },
      { symbol: "MRF", name: "MRF Ltd", weight: 2.6, sector: "Tyres & Rubber" },
      { symbol: "APOLLOTYRE", name: "Apollo Tyres Ltd", weight: 1.6, sector: "Tyres" },
    ],
  },

  // ─── PHARMABEES ───
  PHARMABEES: {
    title: "Nippon India ETF Nifty Pharma Holdings",
    subtitle: "India's Top Generic, Biopharma, CDMO & Diagnostic Healthcare Champions",
    category: "ETF",
    amc: "Nippon India Mutual Fund",
    benchmark: "Nifty Pharma Index",
    totalConstituents: 20,
    description: "Provides exposure to India's pharmaceutical and biotechnology sector with heavy global export and domestic formulation presence.",
    sectors: [
      { sector: "Generic Formulations", weight: 52.4, color: "#06b6d4" },
      { sector: "Active Pharma Ingredients (API)", weight: 24.8, color: "#8b5cf6" },
      { sector: "Hospitals & Diagnostics", weight: 14.5, color: "#10b981" },
      { sector: "Biotechnology", weight: 8.3, color: "#ec4899" },
    ],
    constituents: [
      { symbol: "SUNPHARMA", name: "Sun Pharmaceutical Industries", weight: 28.5, sector: "Specialty Pharma" },
      { symbol: "DRREDDY", name: "Dr. Reddy's Laboratories Ltd", weight: 12.2, sector: "Generics & Biosimilars" },
      { symbol: "CIPLA", name: "Cipla Ltd", weight: 11.8, sector: "Respiratory & Generics" },
      { symbol: "DIVISLAB", name: "Divi's Laboratories Ltd", weight: 7.9, sector: "API & CDMO" },
      { symbol: "APOLLOHOSP", name: "Apollo Hospitals Enterprise Ltd", weight: 7.5, sector: "Hospitals & Healthcare" },
      { symbol: "TORNTCHEM", name: "Torrent Pharmaceuticals Ltd", weight: 6.8, sector: "Formulations" },
      { symbol: "LUPIN", name: "Lupin Ltd", weight: 5.9, sector: "Global Pharma" },
      { symbol: "AUROPHARMA", name: "Aurobindo Pharma Ltd", weight: 5.4, sector: "Formulations & API" },
      { symbol: "ZYDUSLIFE", name: "Zydus Lifesciences Ltd", weight: 4.8, sector: "Healthcare & Vaccines" },
      { symbol: "ALKEM", name: "Alkem Laboratories Ltd", weight: 4.2, sector: "Domestic Formulations" },
      { symbol: "BIOCON", name: "Biocon Ltd", weight: 3.0, sector: "Biopharmaceuticals" },
    ],
  },

  // ─── SMALLIETF ───
  SMALLIETF: {
    title: "ICICI Prudential Nifty Smallcap 250 ETF Holdings",
    subtitle: "High Growth Indian Small-Cap Leaders with Multibagger Potential",
    category: "Mutual Fund",
    amc: "ICICI Prudential Mutual Fund",
    benchmark: "Nifty Smallcap 250 Index",
    totalConstituents: 250,
    description: "Replicates the performance of top 250 smallcap market leaders across India's vibrant manufacturing, financial exchanges, defense, and emerging tech sectors.",
    sectors: [
      { sector: "Financial Exchanges & Capital Markets", weight: 22.4, color: "#3b82f6" },
      { sector: "Defense & Heavy Engineering", weight: 18.5, color: "#10b981" },
      { sector: "Consumer & Retail", weight: 16.8, color: "#ec4899" },
      { sector: "Green Energy & CleanTech", weight: 14.2, color: "#f59e0b" },
      { sector: "Chemicals & Agri", weight: 12.5, color: "#06b6d4" },
      { sector: "Others", weight: 15.6, color: "#64748b" },
    ],
    constituents: [
      { symbol: "BSE", name: "BSE Limited", weight: 4.5, sector: "Capital Markets Exchange" },
      { symbol: "CDSL", name: "Central Depository Services Ltd", weight: 4.1, sector: "Depository & FinTech" },
      { symbol: "MCX", name: "Multi Commodity Exchange of India", weight: 3.8, sector: "Commodity Exchange" },
      { symbol: "SUZLON", name: "Suzlon Energy Ltd", weight: 3.5, sector: "Wind Energy" },
      { symbol: "KALYANKJIL", name: "Kalyan Jewellers India Ltd", weight: 3.2, sector: "Jewellery & Retail" },
      { symbol: "ANGELONE", name: "Angel One Ltd", weight: 3.0, sector: "Digital Stock Broker" },
      { symbol: "MAZDOCK", name: "Mazagon Dock Shipbuilders Ltd", weight: 2.8, sector: "Defense Shipyard" },
      { symbol: "CENTRALBK", name: "Central Bank of India", weight: 2.5, sector: "Public Bank" },
      { symbol: "HUDCO", name: "Housing & Urban Development Corp", weight: 2.4, sector: "Housing Finance" },
      { symbol: "NATCOPHARM", name: "Natco Pharma Ltd", weight: 2.2, sector: "Specialty Pharma" },
      { symbol: "SONACOMS", name: "Sona BLW Precision Forgings Ltd", weight: 2.0, sector: "EV Driveline Systems" },
    ],
  },
  // ─── GOLDBEES & GOLD SCHEMES ───
  GOLDBEES: {
    title: "Nippon India ETF Gold BeES Underlying Assets",
    subtitle: "Physical Gold Bullion of 99.5% Purity & Cash Equivalents",
    category: "Commodity",
    amc: "Nippon India Mutual Fund",
    benchmark: "Domestic Price of Gold (LBMA AM / PM Fix)",
    totalConstituents: 2,
    description: "An open-ended gold ETF tracking physical gold prices. Each unit represents physical gold bars of 99.5% purity stored in secure vaults with custodian banks.",
    sectors: [
      { sector: "Physical Gold Bullion (0.995 Purity)", weight: 98.5, color: "#f59e0b" },
      { sector: "TREPS & Cash Equivalents", weight: 1.5, color: "#10b981" },
    ],
    constituents: [
      { symbol: "GOLD", name: "Physical Gold Bullion 24K (99.5% Purity)", weight: 98.5, sector: "Precious Metals" },
      { symbol: "LIQUID", name: "Tri-Party Repo (TREPS) & Bank Balances", weight: 1.5, sector: "Cash Management" },
    ],
  },

  // ─── SILVERBEES ───
  SILVERBEES: {
    title: "Nippon India ETF Silver BeES Underlying Assets",
    subtitle: "Physical Silver Bullion of 99.9% Purity & Vault Storage",
    category: "Commodity",
    amc: "Nippon India Mutual Fund",
    benchmark: "Domestic Price of Silver",
    totalConstituents: 2,
    description: "Tracks the performance of physical silver with direct investment in fine silver bars meeting London Bullion Market Association (LBMA) standards.",
    sectors: [
      { sector: "Physical Silver Bullion (0.999 Purity)", weight: 98.2, color: "#94a3b8" },
      { sector: "TREPS & Cash Equivalents", weight: 1.8, color: "#10b981" },
    ],
    constituents: [
      { symbol: "SILVER", name: "Physical Silver Bullion (99.9% Purity)", weight: 98.2, sector: "Precious Metals" },
      { symbol: "LIQUID", name: "Tri-Party Repo (TREPS) & Overnight Cash", weight: 1.8, sector: "Cash Management" },
    ],
  },

  // ─── JUNIORBEES (NIFTY NEXT 50) ───
  JUNIORBEES: {
    title: "Nippon India ETF Nifty Next 50 Holdings",
    subtitle: "Top 50 Emerging Large-Cap Companies Beyond Nifty 50",
    category: "ETF",
    amc: "Nippon India Mutual Fund",
    benchmark: "Nifty Next 50 Index",
    totalConstituents: 50,
    description: "Represents the next tier of 50 high-potential largecap companies after Nifty 50, with leaders in consumer, fintech, energy, and chemicals.",
    sectors: [
      { sector: "Financials & FinTech", weight: 22.4, color: "#3b82f6" },
      { sector: "Capital Goods & Defense", weight: 18.2, color: "#10b981" },
      { sector: "Consumer & Retail", weight: 16.5, color: "#ec4899" },
      { sector: "Power & Green Energy", weight: 14.8, color: "#f59e0b" },
      { sector: "Healthcare", weight: 12.1, color: "#06b6d4" },
      { sector: "Others", weight: 16.0, color: "#64748b" },
    ],
    constituents: [
      { symbol: "TRENT", name: "Trent Ltd (Westside & Zudio)", weight: 4.8, sector: "Retail & Apparel" },
      { symbol: "BEL", name: "Bharat Electronics Ltd", weight: 4.2, sector: "Defense Electronics" },
      { symbol: "HAL", name: "Hindustan Aeronautics Ltd", weight: 4.0, sector: "Aerospace & Defense" },
      { symbol: "VEDL", name: "Vedanta Ltd", weight: 3.8, sector: "Metals & Mining" },
      { symbol: "VBL", name: "Varun Beverages Ltd (PepsiCo)", weight: 3.6, sector: "Beverages & FMCG" },
      { symbol: "PFC", name: "Power Finance Corporation Ltd", weight: 3.4, sector: "Power NBFC" },
      { symbol: "RECLTD", name: "REC Ltd", weight: 3.2, sector: "Power NBFC" },
      { symbol: "ZOMATO", name: "Zomato Ltd (Blinkit & Delivery)", weight: 3.0, sector: "E-Commerce & Food" },
      { symbol: "JIOFIN", name: "Jio Financial Services Ltd", weight: 2.8, sector: "FinTech & NBFC" },
      { symbol: "CHOLAFIN", name: "Cholamandalam Investment & Finance", weight: 2.6, sector: "Vehicle Finance" },
      { symbol: "POLYCAB", name: "Polycab India Ltd", weight: 2.4, sector: "Wires & Cables" },
    ],
  },
};

// Aliases for mutual fund and ETF tickers
BASKET_DATA["NIFTYBEES"] = BASKET_DATA["^NSEI"];
BASKET_DATA["SETFNIF50"] = BASKET_DATA["^NSEI"];
BASKET_DATA["NIFTYAXIS"] = BASKET_DATA["^NSEI"];
BASKET_DATA["GOLDAXIS"] = BASKET_DATA["GOLDBEES"];
BASKET_DATA["BANKBEES"] = BASKET_DATA["^NSEBANK"];
BASKET_DATA["BANKNIFTY1"] = BASKET_DATA["^NSEBANK"];
BASKET_DATA["ITBEES"] = BASKET_DATA["^CNXIT"];
BASKET_DATA["MIDCAP"] = BASKET_DATA["^CNXFIN"];

/**
 * Returns basket details for an index or mutual fund symbol
 */
export function getBasketDetails(symbol: string): BasketDetails | null {
  if (!symbol) return null;
  const clean = symbol
    .replace(".NS", "")
    .replace(".BO", "")
    .replace(/^NSE_EQ\|/, "")
    .trim()
    .toUpperCase();

  if (BASKET_DATA[clean]) return BASKET_DATA[clean];
  if (BASKET_DATA[symbol]) return BASKET_DATA[symbol];

  // Default fallback for any generic Nifty 50 index / fund
  if (clean.includes("NIFTY") && !clean.includes("BANK") && !clean.includes("IT") && !clean.includes("AUTO")) {
    return BASKET_DATA["^NSEI"];
  }
  if (clean.includes("BANK")) {
    return BASKET_DATA["^NSEBANK"];
  }
  if (clean.includes("IT")) {
    return BASKET_DATA["^CNXIT"];
  }
  if (clean.includes("SENSEX") || clean.includes("BSESN")) {
    return BASKET_DATA["^BSESN"];
  }

  return null;
}
