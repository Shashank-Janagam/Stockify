
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:postgres@localhost:5432/stockify' });
pool.query('SELECT buy_conditions, sell_conditions FROM paperbull_strategies WHERE name = \'TCS\'').then(res => { console.log(JSON.stringify(res.rows[0], null, 2)); process.exit(0); });

