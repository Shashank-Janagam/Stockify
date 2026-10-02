import os
from pymongo import MongoClient
import json
from dotenv import load_dotenv
load_dotenv('c:/Users/shash/OneDrive/Documents/IOMP/Stockify/Stockify-Backend/.env')
uri = os.environ.get('MONGO_URI')
client = MongoClient(uri)
db = client.get_database('test')
strategy = db['paperbull_strategies'].find_one({'name': 'TCS'})
print(strategy['buyDsl'])
