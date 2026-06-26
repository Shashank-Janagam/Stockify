import requests
import re
import io
import pdfplumber

# Optional OCR fallback
from pdf2image import convert_from_bytes
import pytesseract

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Referer": "https://www.bseindia.com/"
}

# ==========================================================
# SEARCH COMPANY → SCRIP CODE
# ==========================================================

def search_company(query):
    url = (
        "https://api.bseindia.com/Msource/1D/"
        f"getQouteSearch.aspx?Type=EQ&text={query}&flag=site"
    )

    r = requests.get(url, headers=HEADERS, timeout=20)
    r.raise_for_status()

    codes = re.findall(r"/(\d{6})/", r.text)
    return codes


def get_first_scrip_code(query):
    codes = search_company(query)
    return codes[0] if codes else None


# ==========================================================
# FETCH ANNOUNCEMENTS
# ==========================================================

def get_announcements(scrip_code):
    url = (
        "https://api.bseindia.com/BseIndiaAPI/api/"
        f"AnnSubCategoryGetData/w?"
        f"strCat=-1&pageno=1&strPrevDate="
        f"&strScrip={scrip_code}"
        f"&strSearch=P&strToDate=&strType=C"
    )

    headers = {
        **HEADERS,
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://www.bseindia.com/corporates/ann.html"
    }

    r = requests.get(url, headers=headers, timeout=30)
    r.raise_for_status()

    return r.json().get("Table", [])


# ==========================================================
# PDF TEXT EXTRACTION (WITH OCR FALLBACK)
# ==========================================================

def extract_pdf_text(attachment_name):
    if not attachment_name:
        return None

    pdf_url = f"https://www.bseindia.com/xml-data/corpfiling/AttachLive/{attachment_name}"

    try:
        print(f"\n[+] Downloading PDF: {attachment_name}")

        r = requests.get(pdf_url, headers=HEADERS, timeout=60)
        r.raise_for_status()

        # ---- Try normal extraction ----
        with pdfplumber.open(io.BytesIO(r.content)) as pdf:
            text = ""
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    text += t + "\n"

        if text.strip():
            print("[+] Extracted using pdfplumber")
            return text

        # ---- OCR fallback ----
        print("[!] Using OCR fallback...")

        images = convert_from_bytes(r.content)

        ocr_text = ""
        for img in images:
            ocr_text += pytesseract.image_to_string(img)

        return ocr_text

    except Exception as e:
        print("PDF extraction error:", e)
        return None


# ==========================================================
# MAIN
# ==========================================================

if __name__ == "__main__":

    query = input(
        "Enter company name or symbol "
        "(TCS / RELIANCE / INFY / Tata Consultancy): "
    )

    scrip = get_first_scrip_code(query)

    if not scrip:
        print("No company found")
        exit()

    print(f"\n[+] BSE Scrip Code: {scrip}")

    news = get_announcements(scrip)

    print(f"\nTotal Announcements: {len(news)}")

    # Show announcements
    for i, item in enumerate(news[:5], 1):
        print("\n" + "-" * 80)
        print(f"{i}. Date:", item.get("NEWS_DT"))
        print("Headline:", item.get("HEADLINE"))
        print("Attachment:", item.get("ATTACHMENTNAME"))

    # Ask for PDF extraction
    choice = input("\nExtract latest PDF text? (y/n): ")

    if choice.lower() == "y" and news:
        attachment = news[0].get("ATTACHMENTNAME")

        if attachment:
            text = extract_pdf_text(attachment)

            if text:
                print("\n" + "=" * 80)
                print("PDF CONTENT PREVIEW")
                print("=" * 80)

                print(text[:1500])  # preview first 1500 chars

                # Save full text
                with open("latest_filing.txt", "w", encoding="utf-8") as f:
                    f.write(text)

                print("\n[+] Saved full text → latest_filing.txt")

        else:
            print("No PDF attached.")