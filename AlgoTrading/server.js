import express from "express"
import cors from "cors"
import "dotenv/config";
import "./intradaySquareOff.js";

const app = express();
app.use(cors({ origin: "*" }));

const PORT = 4001; // Avoid common 3000/3001
app.get("/health", (req, res) => res.json({ status: "ALGO_TRADING_RUNNING" }));
app.listen(PORT, () => {
    console.log(`🚀 AlgoTrading Server is active on port ${PORT}`);
});
