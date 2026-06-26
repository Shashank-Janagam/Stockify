import requests
from bs4 import BeautifulSoup
import json
import re

def fetch_all_screener_data(ticker_symbol):
    """
    Extracts the entire data suite for an Indian stock from Screener.in.
    Combines static DOM parsing with direct internal API requests to fetch
    dynamic lists of news, announcements, and corporate documents.
    """
    clean_symbol = ticker_symbol.replace(".NS", "").replace(".BO", "").replace(".BOM", "").upper()
    
    # Base URLs
    base_url = f"https://www.screener.in/company/{clean_symbol}/"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest" # Signals to their backend that we are hitting internal fragments
    }
    
    print(f"Executing Deep Extraction for: {clean_symbol}...")
    
    try:
        # --- PHASE 1: STATIC DATA EXTRACTION (Profile, Top Ratios, Financial Tables) ---
        response = requests.get(base_url, headers=headers, timeout=15)
        if response.status_code != 200:
            print(f"[-] Asset '{clean_symbol}' not found on core route.")
            return None
            
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Get the internal Company ID needed to query their document/news APIs
        # Screener stores this in a data attribute (e.g., data-company-id="1234")
        company_id_tag = soup.find("div", id="company-info")
        if not company_id_tag:
            # Fallback check inside HTML body text if the main container differs
            meta_match = re.search(r"data-company-id=\"(\d+)\"", response.text)
            company_id = meta_match.group(1) if meta_match else None
        else:
            company_id = company_info_attr.get("data-company-id") if (company_info_attr := company_id_tag.find(attrs={"data-company-id": True})) else None

        # Ultimate fallback extraction check via common layout attributes
        if not company_id:
            for tag in soup.find_all(attrs={"data-company-id": True}):
                company_id = tag["data-company-id"]
                break

        master_data = {
            "Symbol": clean_symbol,
            "Company_ID": company_id,
            "Core_Profile": "",
            "Top_Ratios": {},
            "Sentiment_Analysis": {"Pros": [], "Cons": []},
            "Financial_Tables": {},
            "Corporate_Documents": [],
            "Recent_News_Announcements": []
        }
        
        # Parse Profile Summary Text
        about_div = soup.find("div", class_="about")
        if about_div:
            master_data["Core_Profile"] = re.sub(r'\s+', ' ', about_div.get_text().replace("About", "")).strip()

        # Parse Headline Ratios Matrix
        top_ratios = soup.find("ul", id="top-ratios")
        if top_ratios:
            for li in top_ratios.find_all("li"):
                name = li.find("span", class_="name")
                val = li.find("span", class_="number")
                if name and val:
                    master_data["Top_Ratios"][name.get_text().strip()] = val.get_text().strip()

        # Parse Pros and Cons
        pros_div = soup.find("div", class_="pros")
        cons_div = soup.find("div", class_="cons")
        if pros_div: master_data["Sentiment_Analysis"]["Pros"] = [li.get_text().strip() for li in pros_div.find_all("li")]
        if cons_div: master_data["Sentiment_Analysis"]["Cons"] = [li.get_text().strip() for li in cons_div.find_all("li")]

        # Core Financial Tables Sheet Processing Matrix
        sections = {
            "quarters": "Quarterly_Results",
            "profit-loss": "Profit_And_Loss_Annually",
            "balance-sheet": "Balance_Sheet",
            "cash-flow": "Cash_Flow_Statement",
            "ratios": "Key_Financial_Ratios",
            "shareholding": "Shareholding_Pattern"
        }
        for sect_id, json_key in sections.items():
            section = soup.find("section", id=sect_id)
            if section and (table := section.find("table")):
                thead = table.find("thead")
                headers_list = [th.get_text().strip() for th in thead.find_all("th") if th.get_text().strip()] if thead else []
                
                row_matrix = {}
                tbody = table.find("tbody")
                if tbody:
                    for row in tbody.find_all("tr"):
                        cells = row.find_all(["td", "th"])
                        if cells:
                            row_title = cells[0].get_text().strip().replace("+", "").strip()
                            values = [c.get_text().strip() for c in cells[1:]]
                            
                            time_map = {}
                            for idx, val in enumerate(values):
                                col = headers_list[idx+1] if (idx+1) < len(headers_list) else f"Period_{idx+1}"
                                time_map[col] = val
                            row_matrix[row_title] = time_map
                master_data["Financial_Tables"][json_key] = row_matrix

        # --- PHASE 2: DYNAMIC DATA EXTRACTION (Bypassing JavaScript Blocks) ---
        if company_id:
            # 1. Fetch Corporate Documents (Concalls, Annual Reports)
            doc_api_url = f"https://www.screener.in/api/company/{company_id}/documents/"
            doc_res = requests.get(doc_api_url, headers=headers, timeout=10)
            if doc_res.status_code == 200:
                doc_soup = BeautifulSoup(doc_res.text, 'html.parser')
                for link in doc_soup.find_all("a"):
                    href = link.get("href")
                    if href:
                        master_data["Corporate_Documents"].append({
                            "Document_Name": " ".join(link.get_text().split()),
                            "Download_URL": href if href.startswith("http") else f"https://www.screener.in{href}"
                        })

            # 2. Fetch Recent News / Exchange Announcements Feed
            news_api_url = f"https://www.screener.in/api/company/{company_id}/announcements/"
            news_res = requests.get(news_api_url, headers=headers, timeout=10)
            if news_res.status_code == 200:
                news_soup = BeautifulSoup(news_res.text, 'html.parser')
                for item in news_soup.find_all("div", class_="announcement-item"):
                    title_tag = item.find("p", class_="announcement-title")
                    date_tag = item.find("span", class_="date")
                    link_tag = item.find("a")
                    if title_tag:
                        master_data["Recent_News_Announcements"].append({
                            "Headline": title_tag.get_text().strip(),
                            "Date": date_tag.get_text().strip() if date_tag else "Recent",
                            "Source_URL": f"https://www.screener.in{link_tag.get('href')}" if link_tag else "N/A"
                        })
        else:
            print("[!] Warning: Could not locate Company ID token. Skipping Dynamic API extraction tracks.")

        return master_data

    except Exception as e:
        print(f"[-] Execution failure: {e}")
        return None

if __name__ == "__main__":
    TARGET_STOCK = "RELIANCE"
    complete_dataset = fetch_all_screener_data(TARGET_STOCK)
    
    if complete_dataset:
        output_filename = f"{TARGET_STOCK.lower()}_complete_data.json"
        with open(output_filename, "w", encoding="utf-8") as f:
            json.dump(complete_dataset, f, indent=4, ensure_ascii=False)
            
        print("\n================== EXTRACTION SUMMARY ==================\n")
        print(f"[+] Core Tables Processed: {list(complete_dataset['Financial_Tables'].keys())}")
        print(f"[+] Discovered Corporate Documents: {len(complete_dataset['Corporate_Documents'])}")
        print(f"[+] Discovered Exchange Announcements: {len(complete_dataset['Recent_News_Announcements'])}")
        print(f"[+] Output verified and saved to file: {output_filename}")