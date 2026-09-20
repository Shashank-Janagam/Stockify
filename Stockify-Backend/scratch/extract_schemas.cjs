const fs = require('fs');
const files = [
  'modules/simulation/simBuyStock.js',
  'modules/simulation/simSellStock.js',
  'modules/OrderExecution/buyStock.js',
  'modules/OrderExecution/sellStock.js',
  'modules/payments/orders.js',
  'modules/dbUtils.js',
  'db/migration_replay_sessions.sql'
];
files.forEach(f => {
  try {
    const text = fs.readFileSync(f, 'utf8');
    const matches = [...text.matchAll(/INSERT INTO[\s\S]*?(?=\bVALUES\b)/gi)];
    if(matches.length) {
      console.log('---', f, '---');
      matches.forEach(m => console.log(m[0].trim().replace(/\n/g, ' ')));
    }
  } catch(e) {}
});
