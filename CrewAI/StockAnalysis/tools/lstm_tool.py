import requests
from crewai.tools import BaseTool


class LSTMForecastTool(BaseTool):
    name: str = "lstm_price_forecast"
    description: str = (
        "Fetches a 5-day LSTM machine learning price forecast for a given stock symbol. "
        "Input: stock symbol (e.g. RELIANCE, TCS, KOTAKBANK). "
        "Returns predicted prices, direction (bullish/bearish/neutral), confidence score, "
        "risk level, support/resistance levels, and a verdict summary."
    )

    def _run(self, symbol: str):
        """Call the LSTM forecast server and return structured prediction data."""
        clean_symbol = symbol.strip().upper().replace(".NS", "").replace(".BO", "")

        try:
            response = requests.get(
                f"http://localhost:8000/forecast/{clean_symbol}",
                timeout=120  # LSTM training can take up to ~60-90s
            )
            if response.status_code != 200:
                return {
                    "symbol": clean_symbol,
                    "error": f"LSTM server returned status {response.status_code}",
                    "forecast_available": False,
                    "predicted_direction": "neutral",
                    "predicted_change_pct": 0,
                    "confidence": 0,
                }

            data = response.json()

            current_price = data.get("current_price", 0)
            lstm_prices = data.get("lstm_prices", [])
            forecast = data.get("forecast", {})
            adjusted_prices = forecast.get("prices", lstm_prices)
            report = data.get("report", {})

            # Calculate predicted % change (day 5 vs current)
            if adjusted_prices and current_price > 0:
                day5_price = adjusted_prices[-1] if len(adjusted_prices) >= 5 else adjusted_prices[-1]
                predicted_change_pct = round(((day5_price - current_price) / current_price) * 100, 2)
            else:
                predicted_change_pct = 0

            return {
                "symbol": clean_symbol,
                "forecast_available": True,
                "current_price": current_price,
                "lstm_5day_prices": lstm_prices,
                "adjusted_5day_prices": adjusted_prices,
                "predicted_direction": forecast.get("direction", "neutral"),
                "predicted_change_pct": predicted_change_pct,
                "confidence": forecast.get("confidence", 50),
                "risk_level": report.get("risk_level", "medium"),
                "support": report.get("support_level", 0),
                "resistance": report.get("resistance_level", 0),
                "verdict": report.get("verdict", "No verdict available"),
                "bull_case": report.get("bull_case", ""),
                "bear_case": report.get("bear_case", ""),
            }

        except requests.exceptions.ConnectionError:
            return {
                "symbol": clean_symbol,
                "error": "LSTM prediction server not reachable (is it running on port 8000?)",
                "forecast_available": False,
                "predicted_direction": "neutral",
                "predicted_change_pct": 0,
                "confidence": 0,
            }
        except requests.exceptions.Timeout:
            return {
                "symbol": clean_symbol,
                "error": "LSTM prediction server timed out (model training may be slow)",
                "forecast_available": False,
                "predicted_direction": "neutral",
                "predicted_change_pct": 0,
                "confidence": 0,
            }
        except Exception as e:
            return {
                "symbol": clean_symbol,
                "error": f"Unexpected error fetching LSTM forecast: {str(e)}",
                "forecast_available": False,
                "predicted_direction": "neutral",
                "predicted_change_pct": 0,
                "confidence": 0,
            }
