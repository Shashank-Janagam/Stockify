import YahooFinance from "yahoo-finance2";
import { getDb } from "../../db/mongo.js";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const STANDARD_SECTORS = {
  banking: "Banking",
  it: "IT",
  energy: "Energy",
  consumer: "Consumer",
  pharma: "Pharma",
  others: "Others"
};

// Map Yahoo Finance sectors to standard frontend sectors
function mapYahooSector(yfSector) {
  if (!yfSector) return null;
  const s = yfSector.toLowerCase();
  if (s.includes("financial") || s.includes("bank") || s.includes("insurance")) return "Banking";
  if (s.includes("technology") || s.includes("software") || s.includes("it")) return "IT";
  if (s.includes("energy") || s.includes("utilities") || s.includes("oil") || s.includes("gas") || s.includes("power")) return "Energy";
  if (s.includes("consumer") || s.includes("automotive") || s.includes("retail") || s.includes("food") || s.includes("beverage")) return "Consumer";
  if (s.includes("healthcare") || s.includes("pharma") || s.includes("medical") || s.includes("biotech")) return "Pharma";
  return "Others";
}

async function classifySectorWithLLM(symbol, companyName) {
  const apiKey = process.env.GROK_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) return "Others";

  const baseUrl = process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1";
  const modelName = process.env.LLM_MODEL || "llama-3.1-8b-instant";

  const prompt = `
  Analyze the company name and stock symbol below, and classify it into exactly ONE of the following standard sectors:
  - Banking
  - IT
  - Energy
  - Consumer
  - Pharma
  - Others
  
  Stock Symbol: ${symbol}
  Company Name: ${companyName || symbol}
  
  Respond ONLY with the name of the matched sector (e.g. "Banking" or "IT"). Do not write any other text.
  `;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: "system", content: "You output only the sector name." },
          { role: "user", content: prompt }
        ],
        temperature: 0.0,
        max_tokens: 15
      })
    });

    if (response.ok) {
      const data = await response.json();
      const resText = data.choices[0].message.content.trim().replace(/[".']/g, "");
      const matched = Object.values(STANDARD_SECTORS).find(
        s => s.toLowerCase() === resText.toLowerCase()
      );
      return matched || "Others";
    }
  } catch (err) {
    console.error(`LLM sector classification failed for ${symbol}:`, err.message);
  }
  return "Others";
}

async function generateSummaryWithLLM(companyName, sector) {
  const apiKey = process.env.GROK_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) return "No corporate summary available.";

  const baseUrl = process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1";
  const modelName = process.env.LLM_MODEL || "llama-3.1-8b-instant";

  const prompt = `
  Write a concise, professional 3-4 sentence business summary for the company named "${companyName}", which operates in the {sector} sector.
  Explain what the company primarily does, its key business model or products, and its importance in the market.
  
  Output ONLY the summary paragraph. Do not include any conversational prefix, suffix, or headers.
  `;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: "system", content: "You are a concise financial analyst assistant that generates complete, professional business summaries." },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 250
      })
    });

    if (response.ok) {
      const data = await response.json();
      return data.choices[0].message.content.trim();
    }
  } catch (err) {
    console.error(`LLM summary generation failed:`, err.message);
  }
  return "No corporate summary available.";
}

export async function resolveStockProfile(symbol) {
  if (!symbol) return null;
  const cleanSymbol = symbol.toUpperCase().trim();

  // Dedicated Index Profiles — avoid querying equity company profiles for market indices
  const INDEX_PROFILES = {
    "^NSEI": {
      symbol: "^NSEI",
      company_name: "NIFTY 50",
      sector: "Index",
      industry: "Broad Market Index",
      website: "https://www.nseindia.com",
      summary_text: "The NIFTY 50 is the benchmark Indian stock market index representing the weighted average of 50 of the largest Indian companies listed on the National Stock Exchange."
    },
    "^BSESN": {
      symbol: "^BSESN",
      company_name: "BSE SENSEX",
      sector: "Index",
      industry: "Broad Market Index",
      website: "https://www.bseindia.com",
      summary_text: "The S&P BSE SENSEX is the benchmark index of the Bombay Stock Exchange (BSE), comprising 30 prominent and financially sound companies representing key sectors."
    },
    "^NSEBANK": {
      symbol: "^NSEBANK",
      company_name: "NIFTY BANK",
      sector: "Banking",
      industry: "Banking Sector Index",
      website: "https://www.nseindia.com",
      summary_text: "The NIFTY Bank Index comprises the most liquid and large Indian banking stocks from both private and public sectors listed on the NSE."
    },
    "^CNXIT": {
      symbol: "^CNXIT",
      company_name: "NIFTY IT",
      sector: "IT",
      industry: "Information Technology Index",
      website: "https://www.nseindia.com",
      summary_text: "The NIFTY IT Index captures the performance of leading Indian IT companies providing software, consulting, and technology services."
    },
    "^CNXFIN": {
      symbol: "^CNXFIN",
      company_name: "NIFTY FINANCIAL SERVICES",
      sector: "Banking",
      industry: "Financial Services Index",
      website: "https://www.nseindia.com",
      summary_text: "The NIFTY Financial Services Index tracks the performance of banks, financial institutions, housing finance, insurance, and NBFC companies."
    }
  };

  INDEX_PROFILES["NSE"] = INDEX_PROFILES["^NSEI"];
  INDEX_PROFILES["NIFTY"] = INDEX_PROFILES["^NSEI"];
  INDEX_PROFILES["NIFTY50"] = INDEX_PROFILES["^NSEI"];
  INDEX_PROFILES["NIFTY 50"] = INDEX_PROFILES["^NSEI"];
  INDEX_PROFILES["BANKNIFTY"] = INDEX_PROFILES["^NSEBANK"];
  INDEX_PROFILES["SENSEX"] = INDEX_PROFILES["^BSESN"];

  if (INDEX_PROFILES[cleanSymbol]) {
    return INDEX_PROFILES[cleanSymbol];
  }

  if (cleanSymbol.startsWith("^")) {
    return {
      symbol: cleanSymbol,
      company_name: cleanSymbol,
      sector: "Index",
      industry: "Market Index",
      website: "https://www.nseindia.com",
      summary_text: "Market index tracking performance of constituent Indian securities."
    };
  }

  const rawSymbol = cleanSymbol.endsWith(".NS") || cleanSymbol.endsWith(".BO") ? cleanSymbol : `${cleanSymbol}.NS`;

  try {
    const db = getDb();
    const collection = db.collection("stock_profiles");

    // 1. Check MongoDB cache first
    let cached = await collection.findOne({ symbol: cleanSymbol });
    if (!cached) {
      cached = await collection.findOne({ symbol: rawSymbol });
    }

    const hasNoSummary = !cached || !cached.summary_text || cached.summary_text === "No corporate summary available." || cached.summary_text.trim() === "";
    const hasNoSector = !cached || !cached.sector || cached.sector === "N/A" || cached.sector === "Others";

    if (cached && !hasNoSummary && !hasNoSector) {
      return cached;
    }

    // 2. Fetch from Yahoo Finance
    let yfData = null;
    try {
      yfData = await yahooFinance.quoteSummary(rawSymbol, { modules: ["summaryProfile", "price"] });
    } catch (e) {
      console.warn(`Yahoo Finance quoteSummary failed for ${rawSymbol}:`, e.message);
    }

    const companyName = yfData?.price?.longName || yfData?.price?.shortName || cached?.company_name || cleanSymbol;
    const isFund = cleanSymbol.includes("BEES") || cleanSymbol.includes("ETF") || cleanSymbol.includes("FUND") || companyName.toUpperCase().includes("AMC") || companyName.toUpperCase().includes("ETF") || cleanSymbol.startsWith("^");

    let sector = mapYahooSector(yfData?.summaryProfile?.sector) || cached?.sector || (isFund ? (cleanSymbol.startsWith("^") ? "Indices" : "Mutual Funds & ETFs") : "Others");
    let industry = yfData?.summaryProfile?.industry || cached?.industry || (isFund ? (cleanSymbol.startsWith("^") ? "Market Index" : "Asset Management") : "N/A");
    let website = yfData?.summaryProfile?.website || cached?.website || "N/A";
    let summaryText = yfData?.summaryProfile?.longBusinessSummary || cached?.summary_text || "";

    if (!summaryText && isFund) {
      if (cleanSymbol.startsWith("^")) {
        summaryText = `${companyName} is a major benchmark Indian stock market index tracking the top constituent companies by market capitalization and liquidity.`;
      } else {
        summaryText = `${companyName} is an exchange-traded index fund and mutual fund scheme listed on Indian markets, tracking benchmark indices and asset baskets with high liquidity and low expense ratios.`;
      }
    } else if (!summaryText) {
      summaryText = "No corporate summary available.";
    }

    let needUpdate = !cached;

    // 3. Fallbacks to LLM
    if ((sector === "Others" || sector === "N/A") && !isFund) {
      const llmSector = await classifySectorWithLLM(cleanSymbol, companyName);
      if (llmSector && llmSector !== "Others") {
        sector = llmSector;
        needUpdate = true;
      }
    }

    if ((summaryText === "No corporate summary available." || summaryText.trim() === "") && !isFund) {
      const llmSummary = await generateSummaryWithLLM(companyName, sector);
      if (llmSummary && llmSummary !== "No corporate summary available.") {
        summaryText = llmSummary;
        needUpdate = true;
      }
    }

    const profileData = {
      symbol: cleanSymbol,
      company_name: companyName,
      sector,
      industry,
      website,
      summary_text: summaryText,
      updatedAt: new Date()
    };

    await collection.updateOne(
      { symbol: cleanSymbol },
      { $set: profileData },
      { upsert: true }
    );

    return profileData;
  } catch (err) {
    console.error(`Failed to resolve profile for ${symbol}:`, err);
    return null;
  }
}

export async function getSimilarStocks(symbol, sector) {
  try {
    const cleanSymbol = symbol.toUpperCase().trim();

    // If it's an index, return other major market indices
    if (cleanSymbol.startsWith("^") || sector === "Index") {
      const indexList = [
        { symbol: "^NSEI", company_name: "NIFTY 50" },
        { symbol: "^BSESN", company_name: "BSE SENSEX" },
        { symbol: "^NSEBANK", company_name: "NIFTY BANK" },
        { symbol: "^CNXIT", company_name: "NIFTY IT" },
        { symbol: "^CNXFIN", company_name: "NIFTY FINANCIAL SERVICES" },
      ];
      return indexList.filter(idx => idx.symbol !== cleanSymbol).slice(0, 4);
    }

    const db = getDb();
    const collection = db.collection("stock_profiles");

    // Get up to 4 stocks from the same sector excluding the current one
    const similar = await collection
      .find({ sector, symbol: { $ne: cleanSymbol } })
      .limit(4)
      .toArray();

    // Map to the expected format
    let result = similar.map(s => ({
      symbol: s.symbol,
      company_name: s.company_name
    }));

    // If we have fewer than 2 similar stocks, return defaults based on the sector to make it look rich
    if (result.length < 2) {
      const defaults = {
        "Banking": [
          { symbol: "HDFCBANK.NS", company_name: "HDFC Bank Limited" },
          { symbol: "ICICIBANK.NS", company_name: "ICICI Bank Limited" },
          { symbol: "SBIN.NS", company_name: "State Bank of India" },
          { symbol: "KOTAKBANK.NS", company_name: "Kotak Mahindra Bank Limited" }
        ],
        "IT": [
          { symbol: "TCS.NS", company_name: "Tata Consultancy Services Limited" },
          { symbol: "INFY.NS", company_name: "Infosys Limited" },
          { symbol: "WIPRO.NS", company_name: "Wipro Limited" },
          { symbol: "HCLTECH.NS", company_name: "HCL Technologies Limited" }
        ],
        "Energy": [
          { symbol: "RELIANCE.NS", company_name: "Reliance Industries Limited" },
          { symbol: "ONGC.NS", company_name: "Oil and Natural Gas Corporation Limited" },
          { symbol: "NTPC.NS", company_name: "NTPC Limited" },
          { symbol: "POWERGRID.NS", company_name: "Power Grid Corporation of India Limited" }
        ],
        "Consumer": [
          { symbol: "ITC.NS", company_name: "ITC Limited" },
          { symbol: "HINDUNILVR.NS", company_name: "Hindustan Unilever Limited" },
          { symbol: "MARUTI.NS", company_name: "Maruti Suzuki India Limited" },
          { symbol: "TATAMOTORS.NS", company_name: "Tata Motors Limited" }
        ],
        "Pharma": [
          { symbol: "SUNPHARMA.NS", company_name: "Sun Pharmaceutical Industries Limited" },
          { symbol: "CIPLA.NS", company_name: "Cipla Limited" },
          { symbol: "DRREDDY.NS", company_name: "Dr. Reddy's Laboratories Limited" },
          { symbol: "DIVISLAB.NS", company_name: "Divi's Laboratories Limited" }
        ]
      };

      const sectorDefaults = defaults[sector] || defaults["IT"];
      const filteredDefaults = sectorDefaults.filter(d => d.symbol !== cleanSymbol);
      
      // Combine and filter duplicates
      const seen = new Set(result.map(r => r.symbol));
      for (const d of filteredDefaults) {
        if (!seen.has(d.symbol) && result.length < 4) {
          result.push(d);
          seen.add(d.symbol);
        }
      }
    }

    return result;
  } catch (err) {
    console.error(`Failed to fetch similar stocks for ${symbol}:`, err);
    return [];
  }
}
