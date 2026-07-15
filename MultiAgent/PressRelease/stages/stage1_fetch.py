"""
stages/stage1_fetch.py
======================
Stage 1 – FETCH

Scrapes new press releases from RBI RSS feeds or the PIB mobile listing page
and appends them to press_releases_raw.jsonl.

  • Skips URLs already recorded in checkpoint.json["seen_urls"].
  • Politely rate-limits HTTP requests via a configurable delay.
  • Returns the list of newly-fetched records so Stage 2 can process them
    immediately without re-reading the file.

Run standalone (for debugging):
    python -m stages.stage1_fetch --source rbi --limit 5
"""

import time
from datetime import datetime, timezone

import requests
import feedparser
from bs4 import BeautifulSoup

from .common import (
    HEADERS, RBI_RSS_FEEDS, PIB_LISTING_URL,
    append_raw_record, load_checkpoint, save_checkpoint, banner,
)


# =============================================================================
#  RBI RSS SCRAPER
# =============================================================================

def _fetch_rbi(feed_key: str, limit: int, state: dict, delay: float) -> list:
    """Fetch up to `limit` new entries from a single RBI RSS feed."""
    url = RBI_RSS_FEEDS[feed_key]
    print(f"\n  Fetching RSS: {url}")
    parsed = feedparser.parse(url)

    newly_fetched = []
    count = 0
    for entry in parsed.entries:
        if count >= limit:
            break
        link = entry.get("link", "")
        if not link or link in state["seen_urls"]:
            continue

        time.sleep(delay)
        try:
            resp = requests.get(link, headers=HEADERS, timeout=15)
            resp.raise_for_status()
            body = BeautifulSoup(resp.text, "html.parser").get_text(separator=" ", strip=True)
        except Exception as e:
            print(f"  ! failed {link}: {e}")
            continue

        record = {
            "title":             entry.get("title", "").strip(),
            "source":            "Reserve Bank of India",
            "release_date":      entry.get("published", ""),
            "category":          feed_key,
            "url":               link,
            "raw_press_release": body[:5000],
            "fetched_at":        datetime.now(timezone.utc).isoformat(),
        }
        append_raw_record(record)
        state["seen_urls"].append(link)
        newly_fetched.append(record)
        count += 1
        print(f"  + saved: {record['title'][:70]}")

    return newly_fetched


# =============================================================================
#  PIB WEB SCRAPER
# =============================================================================

def _fetch_pib(limit: int, state: dict, delay: float) -> list:
    """Fetch today's releases from the PIB mobile listing page."""
    session = requests.Session()
    session.headers.update(HEADERS)
    session.headers.update({"Referer": "https://www.pib.gov.in/index.aspx"})

    print(f"\n  Fetching PIB listing: {PIB_LISTING_URL}")
    try:
        resp = session.get(PIB_LISTING_URL, timeout=15)
        resp.raise_for_status()
    except Exception as e:
        print(f"  ! failed to fetch PIB listing: {e}")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    links = soup.find_all("a", href=lambda h: h and "PressReleseDetailm.aspx?PRID=" in h)

    newly_fetched = []
    count = 0
    for a in links:
        if count >= limit:
            break
        href = a.get("href", "")
        if not href.startswith("http"):
            href = "https://www.pib.gov.in/" + href.lstrip("/")
        if href in state["seen_urls"]:
            continue

        title = a.get_text(strip=True)
        ministry_tag = a.find_previous("h3")
        ministry = ministry_tag.get_text(strip=True) if ministry_tag else "Unknown"

        time.sleep(delay)
        try:
            dr = session.get(href, timeout=15)
            dr.raise_for_status()
            body = BeautifulSoup(dr.text, "html.parser").get_text(separator=" ", strip=True)
        except Exception as e:
            print(f"  ! failed {href}: {e}")
            continue

        record = {
            "title":             title,
            "source":            "Press Information Bureau",
            "ministry":          ministry,
            "release_date":      datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "category":          "PIB",
            "url":               href,
            "raw_press_release": body[:5000],
            "fetched_at":        datetime.now(timezone.utc).isoformat(),
        }
        append_raw_record(record)
        state["seen_urls"].append(href)
        newly_fetched.append(record)
        count += 1
        print(f"  + saved [{ministry}]: {title[:60]}")

    return newly_fetched


# =============================================================================
#  PUBLIC STAGE ENTRY POINT
# =============================================================================

def run(args, state: dict) -> list:
    """
    Execute Stage 1.

    Args:
        args: parsed argparse namespace with .source, .feed, .limit, .delay
        state: shared checkpoint dict (mutated in-place)

    Returns:
        List of newly-fetched record dicts for Stage 2 to consume.
    """
    banner("STAGE 1  FETCH  -  Scraping new press releases")
    newly_fetched = []

    if args.source == "rbi":
        feeds = list(RBI_RSS_FEEDS.keys()) if args.feed == "all" else [args.feed]
        for feed_key in feeds:
            newly_fetched.extend(_fetch_rbi(feed_key, args.limit, state, args.delay))

    elif args.source == "pib":
        newly_fetched.extend(_fetch_pib(args.limit, state, args.delay))

    save_checkpoint(state)
    print(f"\n  Fetch complete. {len(newly_fetched)} new records this run.")
    return newly_fetched


# =============================================================================
#  STANDALONE DEBUG ENTRY POINT
# =============================================================================

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Stage 1: Fetch press releases")
    parser.add_argument("--source", choices=["rbi", "pib"], default="rbi")
    parser.add_argument("--feed", choices=list(RBI_RSS_FEEDS.keys()) + ["all"],
                        default="press_releases")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--delay", type=float, default=2.0)
    _args = parser.parse_args()
    _state = load_checkpoint()
    run(_args, _state)
