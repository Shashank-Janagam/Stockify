import { MongoClient } from "mongodb";

const uri = process.env.MONGO_URI;
if (!uri) {
  throw new Error("❌ MONGO_URI is undefined");
}

const client = new MongoClient(uri);

let _db = null;

export async function connectMongo() {
  if (_db) return _db;

  await client.connect();
  _db = client.db();
  console.log("✅ MongoDB Atlas connected");

  return _db;
}

export function getDb() {
  if (!_db) {
    throw new Error("❌ MongoDB not initialized");
  }
  return _db;
}
