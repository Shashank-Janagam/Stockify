import express from 'express';
import { getDb } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import requireAuth from '../../Middleware/requireAuth.js';

const router = express.Router();

router.get('/health', (req, res) => {
    res.json({ status: "Algo Studio Backend is up!" });
});

// Save Strategy
router.post('/strategy', requireAuth, async (req, res) => {
    try {
        const db = getDb();
        const collection = db.collection('paperbull_strategies');
        
        const strategyData = req.body;
        strategyData.userId = req.user.uid;
        strategyData.createdAt = new Date();

        const result = await collection.insertOne(strategyData);
        res.status(201).json({ success: true, message: "Strategy saved successfully", id: result.insertedId });
    } catch (error) {
        console.error("Error saving strategy:", error);
        res.status(500).json({ success: false, message: "Failed to save strategy" });
    }
});

// Get User's Strategies
router.get('/strategies', requireAuth, async (req, res) => {
    try {
        const db = getDb();
        const collection = db.collection('paperbull_strategies');
        
        const strategies = await collection.find({ userId: req.user.uid }).sort({ createdAt: -1 }).toArray();
        res.status(200).json(strategies);
    } catch (error) {
        console.error("Error fetching strategies:", error);
        res.status(500).json({ success: false, message: "Failed to fetch strategies" });
    }
});

export default router;
