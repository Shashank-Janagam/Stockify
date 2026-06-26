import requests
url = "https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w?strCat=-1&pageno=1&strPrevDate=&strScrip=&strSearch=P&strToDate=&strType=C"
headers = {
    'User-Agent': 'Mozilla/5.0',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://www.bseindia.com/corporates/ann.html'
}
res = requests.get(url, headers=headers)
data = res.json()
table = data.get('Table', [])
print(f"Total overall market announcements: {len(table)}")
if table:
    print(table[0])
