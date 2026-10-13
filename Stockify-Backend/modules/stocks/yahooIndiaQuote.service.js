import YahooFinance from "yahoo-finance2";

const yahoo = new YahooFinance({
  suppressNotices: ["yahooSurvey"]
});

export async function getYahooIndiaQuote(symbol) {
  if (!symbol) return null;

  let s_up = symbol.toUpperCase().replace(".NS", "").replace(".BO", "");
  let finalSymbol = symbol;
  
  if (s_up === "NIFTY 50" || s_up === "NIFTY50" || s_up === "NIFTY" || s_up === "NIFTY_50") {
    finalSymbol = "^NSEI";
  } else if (s_up === "BANKNIFTY" || s_up === "NIFTY BANK" || s_up === "NIFTYBANK") {
    finalSymbol = "^NSEBANK";
  } else if (s_up === "SENSEX" || s_up === "BSE SENSEX" || s_up === "BSESN") {
    finalSymbol = "^BSESN";
  } else if (s_up === "FINNIFTY" || s_up === "NIFTY FIN SERVICE") {
    finalSymbol = "^CNXFIN";
  } else if (!finalSymbol.endsWith(".NS") && !finalSymbol.endsWith(".BO") && !finalSymbol.startsWith("^")) {
    finalSymbol = `${finalSymbol}.NS`;
  }

  try {
    const quote = await yahoo.quote(finalSymbol);
    return quote;
  } catch (err) {
    // If NSE failed, attempt BSE fallback
    if (!symbol.startsWith("^") && !symbol.endsWith(".BO")) {
      const bseSymbol = symbol.replace(/\.NS$/, "") + ".BO";
      try {
        const quote = await yahoo.quote(bseSymbol);
        return quote;
      } catch (_) {}
    }
    console.warn(`[YahooQuote] Quote not available for ${symbol} (${err.message})`);
    return null;
  }
}
