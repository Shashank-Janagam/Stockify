require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool();
pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'")
  .then(res => console.log(res.rows))
  .catch(console.error)
  .finally(() => pool.end());
