/**
 * paperbull.routes.js
 * Express routes for PaperBull Strategy Studio — MongoDB CRUD
 * Mounted at: /api/paperbull
 */

import express from "express";
import { getDb } from "../../db/mongo.js";
import { ObjectId } from "mongodb";
import admin from "../../Middleware/admin.js";

const router = express.Router();
const COLLECTION = "paperbull_strategies";

// ── Auth middleware: verify Firebase session cookie ─────────────────────────
async function requireAuth(req, res, next) {
  const sessionCookie = req.cookies?.session || "";
  if (!sessionCookie) return res.status(401).json({ success: false, message: "Unauthorized" });

  try {
    const decoded = await admin.auth().verifySessionCookie(sessionCookie, true);
    req.userId = decoded.uid;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid session" });
  }
}

// ── GET /api/paperbull/strategies ──────────────────────────────────────────
// List all strategies for the logged-in user
router.get("/strategies", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const strategies = await db
      .collection(COLLECTION)
      .find({ userId: req.userId })
      .sort({ updatedAt: -1 })
      .toArray();

    res.json({ success: true, strategies });
  } catch (err) {
    console.error("[PaperBull] List error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/paperbull/strategies/:id ──────────────────────────────────────
// Load a single strategy by ID
router.get("/strategies/:id", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const doc = await db
      .collection(COLLECTION)
      .findOne({ _id: new ObjectId(req.params.id), userId: req.userId });

    if (!doc) return res.status(404).json({ success: false, message: "Strategy not found" });
    res.json({ success: true, strategy: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/paperbull/strategies ─────────────────────────────────────────
// Create a new strategy
router.post("/strategies", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const now = new Date().toISOString();

    const doc = {
      userId: req.userId,
      name: req.body.name || "Untitled Strategy",
      description: req.body.description || "",
      mode: req.body.mode || "visual",       // "visual" | "code"
      config: req.body.config || {},         // Visual builder JSON config
      code: req.body.code || "",             // Python code string (code mode)
      lastBacktest: req.body.lastBacktest || null,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection(COLLECTION).insertOne(doc);
    res.json({ success: true, id: result.insertedId, strategy: { ...doc, _id: result.insertedId } });
  } catch (err) {
    console.error("[PaperBull] Create error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/paperbull/strategies/:id ──────────────────────────────────────
// Update an existing strategy (fields + lastBacktest KPIs)
router.put("/strategies/:id", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const update = {
      ...( req.body.name !== undefined        && { name: req.body.name }),
      ...( req.body.description !== undefined && { description: req.body.description }),
      ...( req.body.mode !== undefined        && { mode: req.body.mode }),
      ...( req.body.config !== undefined      && { config: req.body.config }),
      ...( req.body.code !== undefined        && { code: req.body.code }),
      ...( req.body.lastBacktest !== undefined && { lastBacktest: req.body.lastBacktest }),
      updatedAt: new Date().toISOString(),
    };

    const result = await db.collection(COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(req.params.id), userId: req.userId },
      { $set: update },
      { returnDocument: "after" }
    );

    if (!result) return res.status(404).json({ success: false, message: "Strategy not found" });
    res.json({ success: true, strategy: result });
  } catch (err) {
    console.error("[PaperBull] Update error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/paperbull/strategies/:id ───────────────────────────────────
router.delete("/strategies/:id", requireAuth, async (req, res) => {
  try {
    const db = getDb();
    await db
      .collection(COLLECTION)
      .deleteOne({ _id: new ObjectId(req.params.id), userId: req.userId });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/paperbull/live/execute ───────────────────────────────────────
// Record and execute a live paper/market order triggered by a strategy or auto-trader bot
router.post("/live/execute", async (req, res) => {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    const {
      userId,
      strategyId,
      strategyName,
      symbol,
      action, // "BUY" | "SELL"
      quantity,
      price,
      value,
      signalDetails,
      orderType = "MARKET",
      status = "EXECUTED",
      isAutomated = false,
    } = req.body;

    const resolvedUserId = req.userId || userId || "default_user";

    if (!symbol || !action || !quantity) {
      return res.status(400).json({ success: false, message: "Missing required order parameters" });
    }

    const executionDoc = {
      userId: resolvedUserId,
      strategyId: strategyId || null,
      strategyName: strategyName || "Live Strategy",
      symbol: symbol.toUpperCase(),
      action: action.toUpperCase(),
      quantity: Number(quantity),
      price: Number(price),
      value: Number(value || (quantity * price)),
      signalDetails: signalDetails || {},
      orderType,
      status,
      isAutomated: Boolean(isAutomated),
      executedAt: now,
      createdAt: now,
    };

    const result = await db.collection("paperbull_live_executions").insertOne(executionDoc);

    res.json({
      success: true,
      message: `Live ${action} order executed for ${quantity}x ${symbol} @ ₹${price}`,
      execution: { ...executionDoc, _id: result.insertedId },
    });
  } catch (err) {
    console.error("[PaperBull Live Execute] Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/paperbull/live/executions ─────────────────────────────────────
// Retrieve live execution history
router.get("/live/executions", async (req, res) => {
  try {
    const db = getDb();
    const query = req.userId ? { userId: req.userId } : {};
    const executions = await db
      .collection("paperbull_live_executions")
      .find(query)
      .sort({ executedAt: -1 })
      .limit(100)
      .toArray();

    res.json({ success: true, executions });
  } catch (err) {
    console.error("[PaperBull Live Executions] Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;


