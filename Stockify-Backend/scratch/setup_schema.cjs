require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 5,
});

async function setupSchema() {
  try {
    console.log('Cleaning up conflicting legacy e-commerce tables...');
    await db.query(`
      DROP TABLE IF EXISTS order_items CASCADE;
      DROP TABLE IF EXISTS payments CASCADE;
      DROP TABLE IF EXISTS products CASCADE;
      DROP TABLE IF EXISTS orders CASCADE;
    `);

    console.log('Creating stocks table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS stocks (
        id SERIAL PRIMARY KEY,
        symbol VARCHAR(255) UNIQUE NOT NULL,
        stock_name VARCHAR(255),
        exchange VARCHAR(50),
        tick_size NUMERIC DEFAULT 0.05,
        lot_size INTEGER DEFAULT 1
      );
    `);

    console.log('Creating wallet_accounts table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS wallet_accounts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        account_type VARCHAR(50) DEFAULT 'LIVE',
        available_balance NUMERIC DEFAULT 0,
        blocked_balance NUMERIC DEFAULT 0,
        UNIQUE(user_id, account_type)
      );
    `);

    console.log('Creating wallet_transactions table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        reference_type VARCHAR(50),
        reference_id VARCHAR(255),
        transaction_type VARCHAR(50),
        amount NUMERIC,
        balance_after NUMERIC,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('Creating payment_orders table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS payment_orders (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(255),
        user_id INTEGER REFERENCES users(id),
        amount NUMERIC,
        status VARCHAR(50)
      );
    `);

    const createOrdersTable = (tableName) => `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        stock_id INTEGER REFERENCES stocks(id),
        side VARCHAR(10),
        order_type VARCHAR(50),
        quantity INTEGER,
        price NUMERIC,
        stop_trigger_price NUMERIC,
        status VARCHAR(50),
        executed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        sell_type VARCHAR(50),
        category VARCHAR(50),
        replay_session_id INTEGER
      );
    `;

    console.log('Creating orders and sim_orders tables...');
    await db.query(createOrdersTable('orders'));
    await db.query(createOrdersTable('sim_orders'));

    const createTradesTable = (tableName) => `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES ${tableName === 'trades' ? 'orders' : 'sim_orders'}(id),
        user_id INTEGER REFERENCES users(id),
        stock_id INTEGER REFERENCES stocks(id),
        side VARCHAR(10),
        quantity INTEGER,
        price NUMERIC,
        realized_pnl NUMERIC DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        replay_session_id INTEGER
      );
    `;

    console.log('Creating trades and sim_trades tables...');
    await db.query(createTradesTable('trades'));
    await db.query(createTradesTable('sim_trades'));

    const createPositionsTable = (tableName) => `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        stock_id INTEGER REFERENCES stocks(id),
        position_type VARCHAR(10),
        entry_price NUMERIC,
        average_price NUMERIC,
        total_quantity INTEGER,
        remaining_quantity INTEGER,
        status VARCHAR(50),
        stoploss_enabled BOOLEAN DEFAULT FALSE,
        sell_type VARCHAR(50),
        product_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        replay_session_id INTEGER
      );
    `;

    console.log('Creating positions and sim_positions tables...');
    await db.query(createPositionsTable('positions'));
    await db.query(createPositionsTable('sim_positions'));

    console.log('Running migration_replay_sessions.sql...');
    const replaySqlPath = path.join(__dirname, 'db', 'migration_replay_sessions.sql');
    if (fs.existsSync(replaySqlPath)) {
      const replaySql = fs.readFileSync(replaySqlPath, 'utf8');
      await db.query(replaySql);
    }

    console.log('All missing tables recreated successfully!');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

setupSchema();
