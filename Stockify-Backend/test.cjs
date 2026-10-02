const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_BjQ92uzimyNV@ep-red-paper-a1alondy-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full' });
pool.query("SELECT buy_conditions, sell_conditions FROM paperbull_strategies WHERE name = 'TCS'").then(res => { console.log(JSON.stringify(res.rows[0], null, 2)); process.exit(0); });
