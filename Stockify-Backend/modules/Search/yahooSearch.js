// export async function yahooSearch(query) {
//   const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
//     query
//   )}&quotesCount=10&newsCount=0`;

//   const res = await fetch(url);
//   const data = await res.json();

//   if (!data.quotes) return [];

//   return data.quotes
//     .filter((q) => q.symbol && q.shortname)
//     .map((q) => ({
//       name: q.shortname,
//       symbol: q.symbol,
//       exchange: q.exchange,
//       type: q.quoteType,
//       source: "yahoo",
//       popularity: 1,
//       updatedAt: new Date()
//     }));
// }

export async function yahooSearch(query) {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    query
  )}&quotesCount=20&newsCount=0`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.quotes) return [];

  return data.quotes
    .filter(q =>
      q.symbol &&
      q.shortname &&
      q.quoteType === "EQUITY" &&
      q.symbol.endsWith(".NS") // ✅ ONLY NSE
    )
    .map(q => ({
      name: q.shortname,
      symbol: q.symbol,
      exchange: "NSE",
      type: q.quoteType,
      source: "yahoo",
      popularity: 1,
      updatedAt: new Date()
    }));
}
