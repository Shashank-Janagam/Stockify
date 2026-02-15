import YahooFinance from "yahoo-finance2";

const yahoo = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export async function monitorPrice(symbols = []) {
    try {
        if (!Array.isArray(symbols) || symbols.length === 0) {
            return {};
        }

        const quotes = await yahoo.quote(symbols);
        const priceMap = {};

        for (const quote of quotes) {
            priceMap[quote.symbol] = quote.regularMarketPrice;
        }

        return priceMap;

    } catch (err) {
        console.log("price monitor error:", err);
        return {};
    }
}
