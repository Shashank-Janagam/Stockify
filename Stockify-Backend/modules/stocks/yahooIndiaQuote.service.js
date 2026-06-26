import YahooFinance from "yahoo-finance2";

const yahoo = new YahooFinance({
  suppressNotices: ["yahooSurvey"]
});
export async function getYahooIndiaQuote(symbol) {
  const finalSymbol = (symbol.endsWith(".NS") || symbol.startsWith("^"))
    ? symbol
    : `${symbol}.NS`;

  const quote = await yahoo.quote(finalSymbol);
  // console.log(quote)
  return quote; // 🔒 PASS THROUGH ENTIRE OBJECT
}
