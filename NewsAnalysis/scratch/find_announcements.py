import asyncio
from database import announcements_collection

async def main():
    for symbol in ["TCS.NS", "HDFCBANK.NS"]:
        count = await announcements_collection.count_documents({"symbol": symbol})
        print(f"Total {symbol} announcements in MongoDB: {count}")
        cursor = announcements_collection.find({"symbol": symbol}).limit(3)
        docs = await cursor.to_list(length=3)
        for doc in docs:
            print(f"  - bse_id: {doc.get('bse_id')}, headline: {doc.get('headline')[:50]}, announced_at: {doc.get('announced_at')}")

if __name__ == "__main__":
    asyncio.run(main())
