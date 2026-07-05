import requests
from crewai.tools import BaseTool

class BuyOrderTool(BaseTool):
    name: str = "Execute Buy Order"
    description: str = (
        "Executes a market buy order for a specific quantity of a stock symbol. "
        "Inputs: symbol (str) e.g. 'AAPL' or 'KOTAKBANK', quantity (int)."
    )

    def _run(self, symbol: str, quantity: int) -> str:
        url = "http://localhost:4000/api/orderExecution/buy"
        headers = {
            "Content-Type": "application/json",
            "x-bypass-auth": "true"
        }
        
        # Clean symbol to ensure .NS suffix for Indian market if not already present
        clean_sym = symbol.strip().upper()
        if not clean_sym.endswith(".NS") and not clean_sym.endswith(".BO"):
            clean_sym = f"{clean_sym}.NS"
            
        body = {
            "symbol": clean_sym,
            "quantity": int(quantity),
            "product_type": "Delivery",
            "category": "AI Algo Trading"
        }
        
        try:
            response = requests.post(url, json=body, headers=headers, timeout=30)
            if response.status_code == 200:
                res_data = response.json()
                return (
                    f"Successfully executed BUY order for {quantity} shares of {clean_sym}. "
                    f"Status: {res_data.get('status')}, Price: Rs. {res_data.get('buyPricePerShare')}, "
                    f"Total Cost: Rs. {res_data.get('totalPrice')}."
                )
            else:
                return f"Failed to execute BUY order for {clean_sym}: Status {response.status_code}, Response: {response.text}"
        except Exception as e:
            return f"Error executing BUY order for {clean_sym}: {str(e)}"


class SellOrderTool(BaseTool):
    name: str = "Execute Sell Order"
    description: str = (
        "Executes a market sell order for a specific quantity of a stock symbol. "
        "Inputs: symbol (str) e.g. 'AAPL' or 'KOTAKBANK', quantity (int)."
    )

    def _run(self, symbol: str, quantity: int) -> str:
        url = "http://localhost:4000/api/sellStock/sell"
        headers = {
            "Content-Type": "application/json",
            "x-bypass-auth": "true"
        }
        
        # Clean symbol to ensure .NS suffix for Indian market if not already present
        clean_sym = symbol.strip().upper()
        if not clean_sym.endswith(".NS") and not clean_sym.endswith(".BO"):
            clean_sym = f"{clean_sym}.NS"
            
        body = {
            "symbol": clean_sym,
            "quantity": int(quantity),
            "sl_enabled": False,
            "product_type": "Delivery",
            "category": "AI Algo Trading"
        }
        
        try:
            response = requests.post(url, json=body, headers=headers, timeout=30)
            if response.status_code == 200:
                res_data = response.json()
                return (
                    f"Successfully executed SELL order for {quantity} shares of {clean_sym}. "
                    f"Status: {res_data.get('status')}, Price: Rs. {res_data.get('sellPricePerShare')}, "
                    f"Total Value: Rs. {res_data.get('totalValue')}."
                )
            else:
                return f"Failed to execute SELL order for {clean_sym}: Status {response.status_code}, Response: {response.text}"
        except Exception as e:
            return f"Error executing SELL order for {clean_sym}: {str(e)}"
