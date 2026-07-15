import requests

def fetch_overall_market_announcements():
    """Fetches recent news and corporate filings for the overall market (last 50 announcements)."""
    url = "https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?strCat=-1&pageno=1&strPrevDate=&strScrip=&strSearch=P&strToDate=&strType=C"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.bseindia.com/corporates/ann.html'
    }
    
    try:
        res = requests.get(url, headers=headers, timeout=10)
        data = res.json()
        raw_news = data.get('Table', []) if isinstance(data, dict) else []
    except Exception as e:
        print(f"[-] Error getting overall market announcements: {e}")
        return []

    announcements = []
    for item in raw_news:
        try:
            date_str = item.get('NEWS_DT')
            pdf_link = item.get('ATTACHMENTNAME')
            pdf_url = f"https://www.bseindia.com/xml-data/corpfiling/AttachLive/{pdf_link}" if pdf_link else None
            
            # Try to extract the symbol from NSURL if possible
            nsurl = item.get('NSURL', '')
            symbol = ""
            if nsurl and "/" in nsurl:
                parts = [p for p in nsurl.split('/') if p]
                if len(parts) >= 2:
                    symbol = parts[-2].upper()
            
            company_name = item.get('SLONGNAME', '')
            if not symbol:
                symbol = company_name

            announcements.append({
                "bse_id": str(item.get('NEWSID')),
                "scrip_code": str(item.get('SCRIP_CD', '')),
                "symbol": symbol,
                "company_name": company_name,
                "headline": item.get('HEADLINE', ''),
                "summary": item.get('NEWSSUB', ''),
                "pdf_url": pdf_url,
                "announced_at": date_str,
                "category": "other",  
                "sentiment": "neutral" 
            })
        except Exception as e:
            print(f"Error parsing market announcement {item}: {e}")

    return announcements
