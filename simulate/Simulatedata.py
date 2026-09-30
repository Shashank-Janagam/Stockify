import asyncio
import json
import websockets
import yfinance as yf
import pandas as pd

data_cache = {}

def get_historical_data(symbol="RELIANCE.NS", period="1d", interval="1m"):
    """
    Fetch historical data from Yahoo Finance.
    We cache it to avoid hitting rate limits on reconnects.
    """
    if symbol in data_cache:
        return data_cache[symbol]
        
    print(f"Fetching historical data for {symbol}...")
    ticker = yf.Ticker(symbol)
    hist = ticker.history(period=period, interval=interval)
    hist.reset_index(inplace=True)
    
    # Filter to start from 9:15 AM local time
    if not hist.empty:
        time_col = 'Datetime' if 'Datetime' in hist.columns else 'Date'
        # Extract time and filter >= 09:15
        if pd.api.types.is_datetime64_any_dtype(hist[time_col]):
            hist = hist[hist[time_col].dt.time >= pd.to_datetime('09:15').time()]
            
    data_cache[symbol] = hist
    return hist

async def send_ticks(websocket, symbol):
    """
    Iterates through historical data and sends one row per second 
    to simulate live ticks.
    """
    try:
        import pandas as pd
        hist_data = get_historical_data(symbol)
        if hist_data.empty:
            await websocket.send(json.dumps({"error": f"No data found for {symbol}"}))
            return

        print(f"Streaming data for {symbol} to client {websocket.remote_address}...")
        
        for index, row in hist_data.iterrows():
            timestamp_col = 'Datetime' if 'Datetime' in row else 'Date'
            timestamp = row[timestamp_col].isoformat() if timestamp_col in row else ""

            # Flatten the tick format to match what live_server.py and LiveStudioGraph expect
            close_price = round(row['Close'], 2)
            tick = {
                "event": "market_data",
                "symbol": symbol,
                "timestamp": timestamp,
                "ltp": close_price,
                "price": close_price,
                "open": round(row['Open'], 2),
                "high": round(row['High'], 2),
                "low": round(row['Low'], 2),
                "close": close_price,
                "volume": int(row['Volume'])
            }
            
            await websocket.send(json.dumps(tick))
            
            # Simulate a 1-second delay between ticks
            await asyncio.sleep(0.05)
            
    except websockets.exceptions.ConnectionClosed:
        pass
    except Exception as e:
        print(f"Error streaming to client {websocket.remote_address}: {e}")

async def handler(websocket, *args):
    """
    Handles new websocket connections and incoming messages.
    """
    print(f"Client connected: {websocket.remote_address}")
    
    # We wait for the client to send a subscribe message
    stream_task = None
    
    try:
        # Listen for messages (e.g. subscribe to different symbols)
        async for message in websocket:
            try:
                data = json.loads(message)
                print(f"Received message from client: {data}")
                
                # Subscription logic
                if data.get('action') == 'subscribe':
                    # Extract the first symbol if it's an array, else fallback
                    symbols = data.get('symbols', [])
                    new_symbol = symbols[0] if symbols else data.get('symbol', 'RELIANCE.NS')
                    
                    # Add .NS if not present to fetch from yfinance properly
                    if not new_symbol.endswith('.NS'):
                        new_symbol += '.NS'
                        
                    print(f"Starting stream for client {websocket.remote_address} for {new_symbol}")
                    
                    if stream_task:
                        stream_task.cancel()
                    stream_task = asyncio.create_task(send_ticks(websocket, new_symbol))
                    
            except json.JSONDecodeError:
                print(f"Received non-JSON message: {message}")
                
    except websockets.exceptions.ConnectionClosed:
        print(f"Client disconnected: {websocket.remote_address}")
    finally:
        if stream_task:
            stream_task.cancel()

async def main():
    import pandas as pd
    host = "localhost"
    port = 8765
    
    print(f"Starting Simulated Websocket Server on ws://{host}:{port}")
    
    # Start the server
    async with websockets.serve(handler, host, port):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped.")
