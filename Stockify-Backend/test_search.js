import "dotenv/config";
import { initStockSearchEngine, searchStocks } from "./modules/Search/stockSearchEngine.js";

async function runTests() {
  console.log("🚀 Starting Search Engine Unit & Benchmark Tests...");

  await initStockSearchEngine();

  const testCases = [
    { query: "TCS", expected: "TCS", type: "Exact Symbol" },
    { query: "REL", expected: "RELIANCE", type: "Prefix Symbol" },
    { query: "MARUTI", expected: "MARUTI", type: "Exact Symbol" },
    { query: "relaince", expected: "RELIANCE", type: "Typo in Reliance" },
    { query: "tatamtr", expected: "TATAMOTORS", type: "Typo / Abbrev in Tata Motors" },
    { query: "hdfc bnk", expected: "HDFCBANK", type: "Typo / Partial in HDFC Bank" },
    { query: "infosis", expected: "INFY", type: "Typo / Phonetic in Infosys" },
    { query: "zomto", expected: "ZOMATO", type: "Typo in Zomato" },
    { query: "wipor", expected: "WIPRO", type: "Transposition Typo in Wipro" },
    { query: "suzuky", expected: "MARUTI", type: "Typo in Suzuki" },
    { query: "smallietf", expected: "SMALLIETF", type: "ETF search" }
  ];

  let passed = 0;

  for (const tc of testCases) {
    const res = searchStocks(tc.query);
    const topSymbols = res.results.map(r => r.symbol);
    const topNames = res.results.map(r => r.name);
    const found = topSymbols.includes(tc.expected) || topNames.some(n => n.toUpperCase().includes(tc.expected));

    console.log(`\n🔎 Query: "${tc.query}" (${tc.type})`);
    console.log(`   Top 3 Results: ${res.results.slice(0, 3).map(r => `${r.symbol} (${r.name}) [${r.matchType}]`).join(", ")}`);
    if (res.didYouMean) {
      console.log(`   💡 Did You Mean: "${res.didYouMean}"`);
    }

    if (found) {
      console.log(`   ✅ PASS: Found "${tc.expected}" in top results`);
      passed++;
    } else {
      console.log(`   ⚠️ NOTICE: "${tc.expected}" not in top results (${topSymbols.slice(0, 5).join(", ")})`);
    }
  }

  // Benchmark speed
  console.log("\n⚡ Running Speed Benchmark (1,000 search queries)...");
  const start = performance.now();
  const benchQueries = ["tcs", "relaince", "hdfc", "marooti", "infosis", "zomato", "wipor", "tatamtr"];
  for (let i = 0; i < 1000; i++) {
    const q = benchQueries[i % benchQueries.length];
    searchStocks(q);
  }
  const duration = performance.now() - start;
  console.log(`⚡ 1,000 searches completed in ${duration.toFixed(2)}ms (${(duration / 1000).toFixed(4)}ms / query)`);

  console.log(`\n🎉 Test Summary: ${passed}/${testCases.length} tests matched expected outputs.`);
}

runTests().catch(console.error);
