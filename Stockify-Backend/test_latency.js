import 'dotenv/config';
import { db } from './db/sql.js';
import YahooFinance from 'yahoo-finance2';
import { resolveStockSector } from './modules/stocks/sectorResolver.js';
import { connectMongo } from './db/mongo.js';

async function test() {
    await connectMongo();
    console.time('Full Fresh');
    const userId = 3;
    const posRes = await db.query(
      `SELECT s.symbol, s.stock_name as name, p.remaining_quantity, p.entry_price 
       FROM positions p
       JOIN stocks s ON p.stock_id = s.id
       WHERE p.user_id = $1 
         AND (p.status = 'OPEN' OR (p.status = 'CLOSED' AND p.updated_at >= CURRENT_DATE AT TIME ZONE 'Asia/Kolkata'))`,
      [userId]
    );

    const { rows: tradesToday } = await db.query(
      `SELECT s.symbol, t.side, t.quantity, t.price
       FROM trades t
       JOIN stocks s ON t.stock_id = s.id
       WHERE t.user_id = $1 AND t.created_at >= CURRENT_DATE AT TIME ZONE 'Asia/Kolkata'`,
      [userId]
    );

    const tradesMap = {};
    tradesToday.forEach(t => {
      if (!tradesMap[t.symbol]) tradesMap[t.symbol] = { boughtQty: 0, boughtValue: 0, soldQty: 0, soldValue: 0 };
    });

    const allSymbols = [...new Set([...posRes.rows.map(r => r.symbol), ...Object.keys(tradesMap)])];
    console.log('Total symbols:', allSymbols.length);

    console.time('Yahoo Quote');
    let quoteMap = {};
    if (allSymbols.length > 0) {
      try {
        const quotes = await YahooFinance.quote(allSymbols.map(s => s.endsWith(".NS") ? s : `${s}.NS`));
      } catch (e) { console.error(e.message); }
    }
    console.timeEnd('Yahoo Quote');

    console.time('Sectors');
    let sectorMap = {};
    try {
      const sectorPromises = allSymbols.map(async (symbol) => {
        const sectorName = await resolveStockSector(symbol, "");
        return { symbol, sector: sectorName };
      });
      const sectorResults = await Promise.all(sectorPromises);
    } catch (e) {
      console.error(e.message);
    }
    console.timeEnd('Sectors');
    
    console.timeEnd('Full Fresh');
    process.exit(0);
}
test();
