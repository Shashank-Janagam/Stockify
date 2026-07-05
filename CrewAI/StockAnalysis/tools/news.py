import requests
from crewai.tools import BaseTool
class StockNewsTool(BaseTool):
    name: str = "Stock News Tool"
    description: str = "Fetches the latest Stockify news for a stock."

    def _run(self, symbol: str):

        url = f"http://localhost:5001/api/news/stock/{symbol}"

        response = requests.get(url)

        return response.json()