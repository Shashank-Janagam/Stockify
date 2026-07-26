const { Client } = require('pg');
const client = new Client({connectionString: 'postgresql://neondb_owner:npg_BjQ92uzimyNV@ep-red-paper-a1alondy-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full'});

client.connect().then(async () => {
    const res = await client.query("SELECT COUNT(*) FROM positions WHERE user_id = 3 AND (status = 'OPEN' OR (status = 'CLOSED' AND updated_at >= CURRENT_DATE AT TIME ZONE 'Asia/Kolkata'));");
    console.log('Open Positions:', res.rows[0].count);
    client.end();
}).catch(console.error);
