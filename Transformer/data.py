"""
data.py
-------
Phase 1 – Data Collection.

Downloads historical OHLCV data from Yahoo Finance for a given ticker
and saves it as a CSV file for downstream processing.

Usage (standalone):
    python data.py --ticker TCS.NS --start 2018-01-01 --end 2024-12-31
"""

import argparse
import os

import pandas as pd
import yfinance as yf

import config


# ─────────────────────────────────────────────────────────────────────────────
def download_stock_data(
    ticker: str,
    start: str,
    end: str,
    save_path: str | None = None,
) -> pd.DataFrame:
    """Download daily OHLCV data from Yahoo Finance.

    Parameters
    ----------
    ticker    : Yahoo Finance ticker symbol, e.g. "RELIANCE.NS".
    start     : Start date string in "YYYY-MM-DD" format.
    end       : End date string in "YYYY-MM-DD" format.
    save_path : Optional CSV path to persist the raw data.

    Returns
    -------
    pd.DataFrame with columns Open, High, Low, Close, Volume
    and a DatetimeIndex sorted ascending.
    """
    print(f"[data.py] Downloading {ticker} from {start} to {end} …")
    df: pd.DataFrame = yf.download(
        ticker,
        start=start,
        end=end,
        interval="1d",
        auto_adjust=True,   # adjusts for splits & dividends automatically
        progress=False,
    )

    if df.empty:
        raise ValueError(
            f"No data returned for ticker '{ticker}'. "
            "Check the symbol or the date range."
        )

    # yfinance may return MultiIndex columns when downloading a single ticker
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    # Keep only core OHLCV columns; rename if needed
    core_cols = ["Open", "High", "Low", "Close", "Volume"]
    df = df[core_cols].copy()

    # Ensure the index is a clean DatetimeIndex
    df.index = pd.to_datetime(df.index)
    df.sort_index(inplace=True)
    df.dropna(inplace=True)

    print(f"[data.py] Downloaded {len(df):,} rows  |  "
          f"Range: {df.index[0].date()} -> {df.index[-1].date()}")

    if save_path:
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        df.to_csv(save_path)
        print(f"[data.py] Raw data saved -> {save_path}")

    return df


def load_raw_csv(csv_path: str) -> pd.DataFrame:
    """Load previously saved raw CSV back into a DataFrame.

    Parameters
    ----------
    csv_path : Path to the CSV file written by download_stock_data().

    Returns
    -------
    pd.DataFrame with a DatetimeIndex.
    """
    df = pd.read_csv(csv_path, index_col=0, parse_dates=True)
    df.sort_index(inplace=True)
    return df


# ─────────────────────────────────────────────────────────────────────────────
# CLI entry-point
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Download historical stock data from Yahoo Finance."
    )
    parser.add_argument(
        "--ticker", type=str, default=config.TICKER,
        help="Yahoo Finance ticker symbol (default: %(default)s)"
    )
    parser.add_argument(
        "--start", type=str, default=config.START_DATE,
        help="Start date YYYY-MM-DD (default: %(default)s)"
    )
    parser.add_argument(
        "--end", type=str, default=config.END_DATE,
        help="End date YYYY-MM-DD (default: %(default)s)"
    )
    args = parser.parse_args()

    save_csv = os.path.join(
        config.DATA_DIR,
        f"{args.ticker.replace('.', '_')}_raw.csv"
    )
    df = download_stock_data(args.ticker, args.start, args.end, save_csv)
    print(df.tail())
