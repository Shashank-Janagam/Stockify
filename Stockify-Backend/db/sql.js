import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";
dotenv.config();
// Create connection pool
// console.log("DB URL:", process.env.DATABASE_URL);

export const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});
