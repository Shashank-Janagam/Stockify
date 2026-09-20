import asyncio
from database import announcements_collection
import yfinance as yf
from datetime import datetime

async def main():
    ticker = yf.Ticker('RELIANCE.NS')
    yf_news = ticker.news
    print(f'Found {len(yf_news)} news')
    new_raw = []
    for item in yf_news:
        content = item.get('content', item)
        title = content.get('title', '')
        news_id = content.get('id', str(hash(title)))
        if not title: continue
        new_raw.append({
            'bse_id': news_id,
            'symbol': 'RELIANCE.NS',
            'headline': title
        })
    print(f'Inserting {len(new_raw)} items')
    for ann in new_raw:
        try:
            await announcements_collection.update_one({'bse_id': ann['bse_id']}, {'$set': ann}, upsert=True)
            print('Inserted', ann['bse_id'])
        except Exception as e:
            print('Insert error:', e)
    
    docs = await announcements_collection.find({'symbol': 'RELIANCE.NS'}).to_list(length=5)
    print(f'DB Count: {len(docs)}')

if __name__ == '__main__':
    asyncio.run(main())
