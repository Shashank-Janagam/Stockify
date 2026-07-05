import yfinance as yf
from crewai.tools import BaseTool


class FinancialTool(BaseTool):
    name: str = "Financial Data Tool"
    description: str = (
        "Fetches financial information of a publicly traded company."
    )

    def _run(self, symbol: str):

        if not symbol.endswith(".NS"):
            symbol += ".NS"

        ticker = yf.Ticker(symbol)

        info = ticker.info

        financials = ticker.financials
        balance = ticker.balance_sheet
        cashflow = ticker.cashflow

        return {
            "company": info.get("longName"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),

            "market_cap": info.get("marketCap"),
            "enterprise_value": info.get("enterpriseValue"),

            "current_price": info.get("currentPrice"),

            "pe": info.get("trailingPE"),
            "forward_pe": info.get("forwardPE"),

            "eps": info.get("trailingEps"),

            "book_value": info.get("bookValue"),

            "price_to_book": info.get("priceToBook"),

            "roe": info.get("returnOnEquity"),

            "roa": info.get("returnOnAssets"),

            "profit_margin": info.get("profitMargins"),

            "operating_margin": info.get("operatingMargins"),

            "revenue_growth": info.get("revenueGrowth"),

            "earnings_growth": info.get("earningsGrowth"),

            "debt_to_equity": info.get("debtToEquity"),

            "current_ratio": info.get("currentRatio"),

            "quick_ratio": info.get("quickRatio"),

            "free_cash_flow": info.get("freeCashflow"),

            "operating_cash_flow": info.get("operatingCashflow"),

            "dividend_yield": info.get("dividendYield"),

            "beta": info.get("beta"),

            "52_week_high": info.get("fiftyTwoWeekHigh"),

            "52_week_low": info.get("fiftyTwoWeekLow"),
        }