import express from 'express';
import { getDb } from '../../db/mongo.js';
import { ObjectId } from 'mongodb';
import requireAuth from '../../Middleware/requireAuth.js';

const router = express.Router();

router.get('/health', (req, res) => {
    res.json({ status: "Algo Studio Backend is up!" });
});

// Create New Strategy
router.post('/strategy', requireAuth, async (req, res) => {
    try {
        const db = getDb();
        const collection = db.collection('paperbull_strategies');
        
        const strategyData = req.body;
        
        // Ensure name is unique for user
        const existing = await collection.findOne({ userId: req.user.uid, name: strategyData.name });
        if (existing) {
            return res.status(400).json({ success: false, message: "A strategy with this name already exists." });
        }
        
        strategyData.userId = req.user.uid;
        strategyData.createdAt = new Date();

        const result = await collection.insertOne(strategyData);
        res.status(201).json({ success: true, message: "Strategy saved successfully", id: result.insertedId });
    } catch (error) {
        console.error("Error saving strategy:", error);
        res.status(500).json({ success: false, message: "Failed to save strategy" });
    }
});

// Update Existing Strategy
router.put('/strategy/:id', requireAuth, async (req, res) => {
    try {
        const db = getDb();
        const collection = db.collection('paperbull_strategies');
        
        const strategyData = req.body;
        // Don't update userId or createdAt
        delete strategyData.userId;
        delete strategyData.createdAt;
        delete strategyData._id;

        // Ensure name is unique for user (if name is being changed)
        if (strategyData.name) {
            const existing = await collection.findOne({ userId: req.user.uid, name: strategyData.name, _id: { $ne: new ObjectId(req.params.id) } });
            if (existing) {
                return res.status(400).json({ success: false, message: "A strategy with this name already exists." });
            }
        }

        const result = await collection.updateOne(
            { _id: new ObjectId(req.params.id), userId: req.user.uid },
            { $set: strategyData }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, message: "Strategy not found or unauthorized" });
        }

        res.status(200).json({ success: true, message: "Strategy updated successfully" });
    } catch (error) {
        console.error("Error updating strategy:", error);
        res.status(500).json({ success: false, message: "Failed to update strategy" });
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
