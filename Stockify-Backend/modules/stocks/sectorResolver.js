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
  if (!apiKey) {
    console.warn("LLM API key missing for sector classification. Defaulting to 'Others'.");
    return "Others";
  }

  const baseUrl = process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1";
  const modelName = process.env.LLM_MODEL || "llama-3.1-8b-instant";

  const prompt = `
  You are a financial analyst. Classify the following Indian stock into exactly ONE of these standard sectors:
  - Banking
  - IT
  - Energy
  - Consumer
  - Pharma
  - Others

  Stock Symbol: ${symbol}
  Company Name: ${companyName || symbol}

  Respond with ONLY the exact name of the matched sector from the list above. Do not include any explanation or extra text.
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

export async function resolveStockSector(symbol, companyName = "") {
  if (!symbol) return "Others";
  const cleanSymbol = symbol.toUpperCase().trim();

  try {
    const db = getDb();
    const collection = db.collection("stock_sectors");

    // 1. Check MongoDB cache first
    const cached = await collection.findOne({ symbol: cleanSymbol });
    if (cached && cached.sector) {
      return cached.sector;
    }

    // 2. Fetch from Yahoo Finance Summary Profile
    let yfSector = null;
    try {
      const summary = await yahooFinance.quoteSummary(cleanSymbol, { modules: ["summaryProfile"] });
      yfSector = summary?.summaryProfile?.sector;
    } catch (e) {
      // Ignore Yahoo Finance errors
    }

    let sector = mapYahooSector(yfSector);

    // 3. Fallback to LLM if Yahoo Finance didn't provide a sector
    if (!sector || sector === "Others") {
      const llmSector = await classifySectorWithLLM(cleanSymbol, companyName);
      if (llmSector && llmSector !== "Others") {
        sector = llmSector;
      } else {
        sector = sector || "Others";
      }
    }

    // 4. Save to MongoDB cache
    await collection.updateOne(
      { symbol: cleanSymbol },
      { $set: { symbol: cleanSymbol, sector, companyName, updatedAt: new Date() } },
      { upsert: true }
    );

    return sector;
  } catch (err) {
    console.error(`Failed to resolve sector for ${symbol}:`, err);
    return "Others";
  }
}
