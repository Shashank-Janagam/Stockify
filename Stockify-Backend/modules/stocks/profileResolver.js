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
    let sector = mapYahooSector(yfData?.summaryProfile?.sector) || cached?.sector || "Others";
    let industry = yfData?.summaryProfile?.industry || cached?.industry || "N/A";
    let website = yfData?.summaryProfile?.website || cached?.website || "N/A";
    let summaryText = yfData?.summaryProfile?.longBusinessSummary || cached?.summary_text || "No corporate summary available.";

    let needUpdate = !cached;

    // 3. Fallbacks to LLM
    if (sector === "Others" || sector === "N/A") {
      const llmSector = await classifySectorWithLLM(cleanSymbol, companyName);
      if (llmSector && llmSector !== "Others") {
        sector = llmSector;
        needUpdate = true;
      }
    }

    if (summaryText === "No corporate summary available." || summaryText.trim() === "") {
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
