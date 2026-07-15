import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv('../Stockify-Backend/.env')
MONGO_URI = os.getenv("MONGO_URI")
client = AsyncIOMotorClient(MONGO_URI)
db = client["stocks"]
profiles_coll = db["company_profiles"]

async def main():
    # Find profile with N/A sector
    na_profiles = await profiles_coll.find({"sector": "N/A"}).to_list(length=10)
    print("N/A Sector Profiles:", [p["symbol"] for p in na_profiles])
    
    # Find any profile to see a sample
    any_profiles = await profiles_coll.find({}).to_list(length=5)
    print("Sample Profiles:")
    for p in any_profiles:
        print(f"Symbol: {p['symbol']}, Sector: {p.get('sector')}")
        
    client.close()

asyncio.run(main())
