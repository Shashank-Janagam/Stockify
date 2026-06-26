import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Load the environment variables from the backend's .env file
load_dotenv('../Stockify-Backend/.env')

MONGO_URI = os.getenv("MONGO_URI")

if not MONGO_URI:
    raise ValueError("MONGO_URI environment variable is not set")

client = AsyncIOMotorClient(MONGO_URI)
db = client["stocks"]  # Using the database name from MONGO_URI or default 'stocks'

# Collections
announcements_collection = db["announcements"]
digest_collection = db["news_digest"]
company_profiles_collection = db["company_profiles"]
sector_mappings_collection = db["sector_mappings"]

async def get_db():
    return db
