import express from "express";
import { getDb } from "../../db/mongo.js";

const router = express.Router();

/* =============================================================================
   1️⃣ GET /api/sectorAlerts
   Fetch latest sector alerts for the main dashboard marquee or alert list.
   ============================================================================= */
router.get("/", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const db = getDb();
    
    const alerts = await db.collection("sector_alerts")
      .find({})
      .sort({ date: -1, stored_at: -1 })
      .limit(limit)
      .toArray();

    return res.json({ success: true, data: alerts });
  } catch (err) {
    console.error("Error fetching sector alerts:", err);
    return res.status(500).json({ error: "Failed to fetch sector alerts", details: err.message });
  }
});

/* =============================================================================
   2️⃣ GET /api/sectorAlerts/stock/:symbol
   Fetch sector alerts affecting a specific stock (mapped by ticker symbol).
   ============================================================================= */
router.get("/stock/:symbol", async (req, res) => {
  try {
    const rawSymbol = req.params.symbol || "";
    // Normalize symbol: convert to uppercase and strip suffixes like .NS, .BO
    const symbol = rawSymbol.split(".")[0].trim().toUpperCase();

    if (!symbol) {
      return res.status(400).json({ error: "Symbol parameter is required" });
    }

    const db = getDb();
    // Query documents where the normalized symbol is present in any sector's tickers array
    const alerts = await db.collection("sector_alerts")
      .find({ "sectors.tickers": symbol })
      .sort({ date: -1, stored_at: -1 })
      .toArray();

    // To make it easy for frontend, filter the specific sector information affecting this stock
    const mappedAlerts = alerts.map(alert => {
      const affectedSector = alert.sectors.find(s => 
        s.tickers.some(t => t.toUpperCase() === symbol)
      );
      return {
        release_id: alert.release_id,
        title: alert.title,
        date: alert.date,
        importance: alert.importance,
        source_url: alert.source_url,
        one_liner: alert.one_liner,
        affected_sector: affectedSector || null,
        stored_at: alert.stored_at
      };
    });

    return res.json({ success: true, data: mappedAlerts });
  } catch (err) {
    console.error("Error fetching stock sector alerts:", err);
    return res.status(500).json({ error: "Failed to fetch stock sector alerts", details: err.message });
  }
});

export default router;
