import { db } from './db/sql.js';

async function createTable() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        uid VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        email VARCHAR(255) UNIQUE,
        "Mobile" VARCHAR(20)
      );
    `);
    console.log('users table created successfully');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

createTable();
