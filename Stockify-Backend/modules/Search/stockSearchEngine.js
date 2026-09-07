import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDb } from "../../db/mongo.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory stock store for sub-millisecond search & typo correction
let memoryStocks = [];
let symbolIndex = new Map(); // uppercase symbol -> stock object

/**
 * Fast Levenshtein edit distance with Damerau-Levenshtein transposition
 * and early exit when distance exceeds maxAllowed.
 */
function fastLevenshtein(a, b, maxAllowed = 2) {
  const an = a.length;
  const bn = b.length;
  if (Math.abs(an - bn) > maxAllowed) return maxAllowed + 1;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix = [];
  for (let i = 0; i <= bn; i++) matrix[i] = [i];
  for (let j = 0; j <= an; j++) matrix[0][j] = j;

  for (let i = 1; i <= bn; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
        // Damerau transposition check
        if (
          i > 1 &&
          j > 1 &&
          b.charAt(i - 1) === a.charAt(j - 2) &&
          b.charAt(i - 2) === a.charAt(j - 1)
        ) {
          matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
        }
      }
      if (matrix[i][j] < rowMin) rowMin = matrix[i][j];
    }
    // If the entire row exceeds maxAllowed + length difference, early exit
    if (rowMin > maxAllowed + 2) return maxAllowed + 1;
  }

  return matrix[bn][an];
}

/**
 * Determine category of the instrument
 */
function classifyCategory(item) {
  const sym = (item.symbol || "").toUpperCase();
  const name = (item.name || "").toUpperCase();
  const key = (item.instrument_key || "").toUpperCase();

  if (name.includes("ETF") || sym.includes("ETF") || name.includes("BEES") || sym.endsWith("BEES") || name.includes("IETF")) {
    return "ETF";
  }
  if (name.includes("MUTUAL FUND") || name.includes("GROWTH FUND") || name.includes("INDEX FUND")) {
    return "Mutual Funds";
  }
  if (key.includes("NSE_INDEX") || key.includes("BSE_INDEX") || sym.startsWith("^") || name.startsWith("NIFTY") || name.startsWith("SENSEX")) {
    return "Indices";
  }
  if (key.includes("NSE_FO") || sym.includes("FUT") || sym.includes("CE") || sym.includes("PE")) {
    return "F&O";
  }
  return "Stocks";
}

/**
 * Find the subscriptions.json file path
 */
function getSubscriptionsPath() {
  const potentialPaths = [
    path.resolve(__dirname, "../../../Upstox-Backend/subscriptions.json"),
    path.resolve(__dirname, "../../data/subscriptions.json"),
    path.resolve(process.cwd(), "../Upstox-Backend/subscriptions.json"),
    path.resolve(process.cwd(), "subscriptions.json")
  ];

  for (const p of potentialPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

/**
 * Load raw data from subscriptions.json
 */
function loadSubscriptionsData() {
  const subPath = getSubscriptionsPath();
  if (!subPath) {
    console.warn("⚠️ subscriptions.json not found in potential paths, checking fallback");
    return [];
  }

  try {
    const raw = fs.readFileSync(subPath, "utf-8");
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : (parsed.instruments || parsed.stocks || []);
    return list.map(item => ({
      symbol: (item.symbol || "").trim().toUpperCase(),
      name: (item.name || item.symbol || "").trim(),
      instrument_key: item.instrument_key || `NSE_EQ|${item.symbol}`,
      exchange: "NSE",
      category: classifyCategory(item),
      popularity: item.popularity || 0
    })).filter(s => s.symbol);
  } catch (err) {
    console.error("❌ Error reading subscriptions.json:", err.message);
    return [];
  }
}

/**
 * Helper to generate acronyms from company name (e.g. "Tata Consultancy Services" -> "TCS")
 */
function getAcronym(name) {
  return (name || "")
    .split(/[\s&,-]+/)
    .filter(Boolean)
    .map(w => w[0])
    .join("")
    .toLowerCase();
}

/**
 * Initializes and syncs search engine with MongoDB & in-memory store
 */
export async function initStockSearchEngine() {
  try {
    console.log("🔍 Initializing Stock Search Engine from subscriptions.json...");
    const rawStocks = loadSubscriptionsData();

    if (!rawStocks.length) {
      console.warn("⚠️ No stocks loaded from subscriptions.json");
    }

    let db;
    try {
      db = getDb();
    } catch (e) {
      console.warn("⚠️ Mongo not ready yet for search engine seeding");
    }

    if (db && rawStocks.length > 0) {
      const collection = db.collection("stocks");

      // Ensure indexes for high performance
      await collection.createIndex({ symbol: 1 }, { unique: true, background: true }).catch(() => {});
      await collection.createIndex({ popularity: -1 }, { background: true }).catch(() => {});
      await collection.createIndex({ name: "text", symbol: "text" }, { background: true }).catch(() => {});

      // Bulk upsert into MongoDB to preserve popularity and maintain sync
      const bulkOps = rawStocks.map(stock => ({
        updateOne: {
          filter: { symbol: stock.symbol },
          update: {
            $set: {
              name: stock.name,
              instrument_key: stock.instrument_key,
              exchange: "NSE",
              category: stock.category,
              updatedAt: new Date()
            },
            $setOnInsert: {
              popularity: 0
            }
          },
          upsert: true
        }
      }));

      if (bulkOps.length > 0) {
        await collection.bulkWrite(bulkOps, { ordered: false });
        console.log(`📦 Synced ${bulkOps.length} stocks from subscriptions.json to MongoDB`);
      }

      // Fetch all stocks with their updated popularity from MongoDB
      const mongoDocs = await collection.find({}).toArray();
      memoryStocks = mongoDocs.map(doc => ({
        symbol: doc.symbol,
        name: doc.name,
        instrument_key: doc.instrument_key,
        exchange: doc.exchange || "NSE",
        category: doc.category || classifyCategory(doc),
        popularity: doc.popularity || 0,
        // Pre-computed lowercase tokens for instant search
        _cleanSymbol: doc.symbol.toLowerCase().replace(/[^a-z0-9]/g, ""),
        _cleanName: doc.name.toLowerCase().replace(/[^a-z0-9\s]/g, ""),
        _nameTokens: doc.name.toLowerCase().split(/[\s,.-]+/).filter(Boolean),
        _acronym: getAcronym(doc.name)
      }));
    } else {
      // Use rawStocks in-memory if DB isn't available
      memoryStocks = rawStocks.map(doc => ({
        ...doc,
        _cleanSymbol: doc.symbol.toLowerCase().replace(/[^a-z0-9]/g, ""),
        _cleanName: doc.name.toLowerCase().replace(/[^a-z0-9\s]/g, ""),
        _nameTokens: doc.name.toLowerCase().split(/[\s,.-]+/).filter(Boolean),
        _acronym: getAcronym(doc.name)
      }));
    }

    // Populate symbol index map
    symbolIndex.clear();
    for (const s of memoryStocks) {
      symbolIndex.set(s.symbol, s);
    }

    console.log(`⚡ Stock Search Engine ready with ${memoryStocks.length} stocks indexed in memory`);
  } catch (err) {
    console.error("❌ Failed to initialize stock search engine:", err);
  }
}

/**
 * Searches stocks with multi-tiered fuzzy search, typo correction, acronyms, and category filters.
 *
 * @param {string} query Search query string
 * @param {Object} options Options: category, limit
 * @returns {Object} { results, didYouMean, total, query }
 */
export function searchStocks(query = "", options = {}) {
  const cleanQ = query.trim().toLowerCase();
  const rawQ = query.trim().toUpperCase();
  const limit = options.limit || 15;
  const categoryFilter = options.category && options.category !== "All" ? options.category : null;

  if (!cleanQ || cleanQ.length < 1) {
    return { results: [], didYouMean: null, total: 0, query };
  }

  const queryNoSpace = cleanQ.replace(/[^a-z0-9]/g, "");
  const queryTokens = cleanQ.split(/[\s,.-]+/).filter(Boolean);

  let scoredResults = [];
  let bestTypoCorrection = null;
  let minTypoDist = 999;

  for (let i = 0; i < memoryStocks.length; i++) {
    const stock = memoryStocks[i];

    // Filter category if specified
    if (categoryFilter) {
      if (categoryFilter === "MTF") {
        if (stock.category !== "Stocks") continue;
      } else if (stock.category !== categoryFilter) {
        continue;
      }
    }

    let score = 0;
    let matchType = null;
    const sym = stock.symbol;
    const cleanSym = stock._cleanSymbol;
    const cleanName = stock._cleanName;

    // 1️⃣ EXACT SYMBOL MATCH (Maximum score)
    if (sym === rawQ || cleanSym === queryNoSpace) {
      score = 1000 + (stock.popularity || 0);
      matchType = "exact_symbol";
    }
    // 2️⃣ SYMBOL STARTS WITH (Very High)
    else if (cleanSym.startsWith(queryNoSpace)) {
      score = 800 - (cleanSym.length - queryNoSpace.length) * 5 + (stock.popularity || 0);
      matchType = "prefix_symbol";
    }
    // 3️⃣ ACRONYM MATCH (e.g. "TCS" -> "Tata Consultancy Services")
    else if (stock._acronym === queryNoSpace) {
      score = 750 + (stock.popularity || 0);
      matchType = "acronym";
    }
    // 4️⃣ EXACT NAME WORD MATCH OR PREFIX OF ANY TOKEN IN NAME
    else if (stock._nameTokens.some(t => t === queryNoSpace)) {
      score = 700 + (stock.popularity || 0);
      matchType = "exact_name_token";
    }
    else if (stock._nameTokens.some(t => t.startsWith(queryNoSpace))) {
      score = 600 - (cleanName.length - queryNoSpace.length) + (stock.popularity || 0);
      matchType = "prefix_name_token";
    }
    // 5️⃣ SUBSTRING IN SYMBOL OR NAME
    else if (cleanSym.includes(queryNoSpace)) {
      score = 500 - cleanSym.indexOf(queryNoSpace) * 10 + (stock.popularity || 0);
      matchType = "sub_symbol";
    }
    else if (cleanName.includes(queryNoSpace)) {
      score = 400 - cleanName.indexOf(queryNoSpace) * 2 + (stock.popularity || 0);
      matchType = "sub_name";
    }
    // 6️⃣ MULTI-TOKEN ALL MATCH (e.g. "tata motor")
    else if (queryTokens.length > 1 && queryTokens.every(qT => cleanName.includes(qT) || cleanSym.includes(qT))) {
      score = 350 + (stock.popularity || 0);
      matchType = "multi_token";
    }
    // 7️⃣ TYPO CORRECTION / FUZZY MATCHING (Fast Damerau-Levenshtein Distance)
    else if (queryNoSpace.length >= 3) {
      const maxAllowedDist = queryNoSpace.length <= 4 ? 1 : 2;

      // Symbol typo distance
      const symDist = fastLevenshtein(queryNoSpace, cleanSym, maxAllowedDist);

      if (symDist <= maxAllowedDist) {
        score = 280 - symDist * 60 + (stock.popularity || 0);
        matchType = "fuzzy_symbol";
        if (symDist < minTypoDist) {
          minTypoDist = symDist;
          bestTypoCorrection = stock.symbol;
        }
      } else {
        // Name tokens typo distance
        let bestTokenDist = 999;
        let matchedToken = "";

        for (let tIdx = 0; tIdx < stock._nameTokens.length; tIdx++) {
          const token = stock._nameTokens[tIdx];
          if (token.length >= 3) {
            const tokenDist = fastLevenshtein(queryNoSpace, token, maxAllowedDist);
            if (tokenDist < bestTokenDist) {
              bestTokenDist = tokenDist;
              matchedToken = token;
            }
          }
        }

        if (bestTokenDist <= maxAllowedDist) {
          score = 220 - bestTokenDist * 50 + (stock.popularity || 0);
          matchType = "fuzzy_name";
          if (bestTokenDist < minTypoDist) {
            minTypoDist = bestTokenDist;
            bestTypoCorrection = stock.name.split(/[\s,.-]+/)[0] || stock.symbol;
          }
        }
      }
    }

    if (score > 0) {
      scoredResults.push({
        stock,
        score,
        matchType
      });
    }
  }

  // Sort by score descending
  scoredResults.sort((a, b) => b.score - a.score);

  const topResults = scoredResults.slice(0, limit).map(({ stock, matchType }) => ({
    symbol: stock.symbol,
    name: stock.name,
    instrument_key: stock.instrument_key,
    exchange: stock.exchange,
    category: stock.category,
    popularity: stock.popularity || 0,
    matchType
  }));

  // Suggest didYouMean if the primary top match was a fuzzy typo match
  const isTypoMatch = topResults.length > 0 && topResults[0].matchType?.startsWith("fuzzy");
  const didYouMean = isTypoMatch && bestTypoCorrection && bestTypoCorrection.toLowerCase() !== cleanQ
    ? bestTypoCorrection
    : null;

  return {
    results: topResults,
    didYouMean,
    total: scoredResults.length,
    query
  };
}

/**
 * Increment stock popularity in memory and MongoDB
 */
export async function incrementStockPopularity(symbol) {
  if (!symbol) return;
  const cleanSym = symbol.trim().toUpperCase().replace(".NS", "");

  const stock = symbolIndex.get(cleanSym);
  if (stock) {
    stock.popularity = (stock.popularity || 0) + 1;
  }

  try {
    const db = getDb();
    if (db) {
      await db.collection("stocks").updateOne(
        { symbol: cleanSym },
        { $inc: { popularity: 1 } }
      );
    }
  } catch (err) {
    console.error("Failed to update stock popularity in DB:", err.message);
  }
}

/**
 * Get all indexed stocks
 */
export function getAllIndexedStocks() {
  return memoryStocks;
}
