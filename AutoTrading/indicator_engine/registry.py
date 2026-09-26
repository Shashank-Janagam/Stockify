from typing import Callable, Dict, Any
import pandas as pd
from .indicators import (
    calculate_sma,
    calculate_ema,
    calculate_rsi,
    calculate_macd,
    calculate_bollinger_bands,
    calculate_obi
)

class IndicatorRegistry:
    def __init__(self):
        self._registry: Dict[str, Callable] = {}
        self._register_defaults()

    def _register_defaults(self):
        self.register("SMA", calculate_sma)
        self.register("EMA", calculate_ema)
        self.register("RSI", calculate_rsi)
        self.register("MACD", calculate_macd)
        self.register("BOLLINGER", calculate_bollinger_bands)
        self.register("OBI", calculate_obi)
        self.register("CLOSE", lambda close, **kwargs: close)

    def register(self, name: str, func: Callable):
        self._registry[name.upper()] = func

    def get_indicator(self, name: str) -> Callable:
        name_upper = name.upper()
        if name_upper not in self._registry:
            raise ValueError(f"Indicator '{name}' not found in registry.")
        return self._registry[name_upper]

    def calculate(self, name: str, data: pd.DataFrame, params: Dict[str, Any]) -> Any:
        func = self.get_indicator(name)
        # For simplicity, assuming data contains the necessary columns based on the indicator
        # like 'close', 'bid_volume', 'ask_volume'
        
        # We need to map DataFrame columns to function arguments if necessary, 
        # or just pass data series based on standard names.
        kwargs = {}
        if name.upper() == 'OBI':
            if 'bid_volume' not in data or 'ask_volume' not in data:
                if 'volume' in data.columns and 'close' in data.columns and 'open' in data.columns:
                    # Synthesize pseudo order book data from OHLCV
                    is_bull = data['close'] >= data['open']
                    kwargs['bid_volume'] = data['volume'] * is_bull.astype(float) * 0.7 + data['volume'] * 0.15
                    kwargs['ask_volume'] = data['volume'] * (~is_bull).astype(float) * 0.7 + data['volume'] * 0.15
                else:
                    raise KeyError("Columns 'bid_volume' and 'ask_volume' are required for OBI")
            else:
                kwargs['bid_volume'] = data['bid_volume']
                kwargs['ask_volume'] = data['ask_volume']
        else:
            if 'close' not in data.columns:
                raise KeyError("Column 'close' is required for this indicator")
            kwargs['close'] = data['close']
        
        clean_params = {k: v for k, v in params.items() if k != 'column'}
        kwargs.update(clean_params)
        return func(**kwargs)

# Global registry instance
registry = IndicatorRegistry()
