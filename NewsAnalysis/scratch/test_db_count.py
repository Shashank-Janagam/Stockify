import asyncio
from database import announcements_collection

async def main():
    total = await announcements_collection.count_documents({})
    print(f"Total documents in announcements collection: {total}")
    
    # Let's list a few documents if any
    cursor = announcements_collection.find({}).limit(5)
    docs = await cursor.to_list(length=5)
    for doc in docs:
        print(f"- Symbol: {doc.get('symbol')}, Company: {doc.get('company_name')}, Headline: {doc.get('headline')}")

if __name__ == "__main__":
    asyncio.run(main())
