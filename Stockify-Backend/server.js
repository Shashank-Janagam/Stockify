import "dotenv/config";

import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";
import cookieParser from "cookie-parser";
import { connectMongo } from "./db/mongo.js";
import { WebSocketManager } from "./modules/websocket/wsManager.js";
import { upstoxFeedService } from "./modules/websocket/upstoxFeed.service.js";
import { initStockSearchEngine } from "./modules/Search/stockSearchEngine.js";

import indiaLiveRoutes from "./modules/stocks/indiaLive.routes.js"
import searchResults from "./modules/Search/searchResults.js";
import searchUpdates from "./modules/Search/searchUpdates.js"
import getBalance from "./modules/payments/getBalance.js"
import payments from "./modules/payments/payment.js";
import walletTopup from "./modules/payments/walletTopup.js";
import transactions from "./modules/payments/transactions.js"
import webhooks from "./modules/payments/razorpayWeb.js";
import multiStocks from "./modules/stocks/multiStream.routes.js"
import OrderExecution from "./modules/OrderExecution/buyStock.js";
import sellStock from "./modules/OrderExecution/sellStock.js";
import * as holdings from "./modules/OrderExecution/holdings.js";
import portfolioRoutes from "./modules/portfolio/portfolio.routes.js";
import aiRoutes from "./modules/ai/ai.routes.js";
import newsRoutes from "./modules/news/news.routes.js";
import userRoutes from "./modules/user/user.routes.js";
import sectorAlertsRoutes from "./modules/sectorAlerts/sectorAlerts.routes.js";
import algoRoutes from "./modules/algo/algo.routes.js";
import paperbullRoutes from "./modules/paperbull/paperbull.routes.js";
import { spawn } from "child_process";
import path from "path";
import { initTelegramBot } from "./modules/telegram/bot.js";

import login from "./Middleware/login.js"
import rateLimit from "express-rate-limit";

// Initialize Telegram Bot
initTelegramBot();

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
});

const app = express();
const PORT = process.env.PORT || 4000;
app.use("/api/webhooks/razorpay", express.raw({ type: "application/json" })
);
app.use(
  cors({
    origin: ["http://localhost:5173","http://10.65.168:5173", "http://localhost:5174", "https://wardless-postmyxedematous-jeneva.ngrok-free.dev",
      "https://www.stockifyindia.app","https://stockify-india.vercel.app","https://stockifyindia.app"],
    // ✅ exact origin
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  }),
);
app.use(cookieParser()); // ⭐ THIS FIXES YOUR ERROR

app.use(express.json());
app.set("trust proxy", true);
app.use("/api/login", login);
app.use("/api/stocks", indiaLiveRoutes);
app.use("/api/search", searchResults);
app.use("/api/searchUpdates", searchUpdates);
app.use("/api/getBalance", getBalance);
app.use("/api/payments", payments);
app.use("/api/payments", walletTopup);
app.use("/api/transactions", transactions);
app.use("/api/webhooks", webhooks)
app.use("/api/explore", multiStocks)
app.use("/api/orderExecution", OrderExecution)
app.use("/api/sellStock", sellStock);
app.use("/api/holdings", holdings.default);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/ai", aiRoutes, limiter);
app.use("/api/news", newsRoutes);
app.use("/api/user", userRoutes);
app.use("/api/sectorAlerts", sectorAlertsRoutes);
app.use("/api/algo", algoRoutes);
app.use("/api/paperbull", paperbullRoutes);

// --- ALGO TRADING & BACKTEST APIS ---
app.get("/api/algo/capabilities", async (req, res) => {
  try {
    const pythonApiUrl = process.env.VITE_PYTHON_API_URL || "http://127.0.0.1:5001";
    const response = await fetch(`${pythonApiUrl}/schema/capabilities`);
    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error("Failed to fetch algo capabilities:", err);
    return res.status(500).json({ error: "Failed to connect to backtest engine", details: err.message });
  }
});

app.post("/api/algo/indicators/preview", async (req, res) => {
  try {
    const pythonApiUrl = process.env.VITE_PYTHON_API_URL || "http://127.0.0.1:5001";
    const response = await fetch(`${pythonApiUrl}/indicators/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error("Failed to preview indicator:", err);
    return res.status(500).json({ error: "Failed to connect to backtest engine", details: err.message });
  }
});

app.post("/api/algo/backtest", async (req, res) => {
  const { symbol, period, strategy, config, strategy_config, start_date, end_date } = req.body;
  if (!symbol) return res.status(400).json({ error: "Missing symbol" });
  
  try {
    const pythonApiUrl = process.env.VITE_PYTHON_API_URL || "http://127.0.0.1:5001";
    const response = await fetch(`${pythonApiUrl}/backtest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ symbol, period, strategy, config, strategy_config, start_date, end_date })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Python backtest API returned status ${response.status}:`, errorText);
      return res.status(response.status).json({ error: "Backtest API error", details: errorText });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error("Failed to call Python backtest API:", err);
    return res.status(500).json({ error: "Failed to connect to backtest engine", details: err.message });
  }
});

app.post("/api/algo/backtest/all", async (req, res) => {
  const { symbol, period, start_date, end_date } = req.body;
  if (!symbol) return res.status(400).json({ error: "Missing symbol" });
  
  try {
    const pythonApiUrl = process.env.VITE_PYTHON_API_URL || "http://127.0.0.1:5001";
    const response = await fetch(`${pythonApiUrl}/backtest/all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ symbol, period, start_date, end_date })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Python backtest/all API returned status ${response.status}:`, errorText);
      return res.status(response.status).json({ error: "Backtest API error", details: errorText });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error("Failed to call Python backtest/all API:", err);
    return res.status(500).json({ error: "Failed to connect to backtest engine", details: err.message });
  }
});

// app.use("/api/stocks",indiaReplay);

app.get("api/health", (req, res) => {
  res.status(200).send("OK");
});

const wsManager = { current: null };
async function startServer() {
  try {
    await connectMongo();
    await initStockSearchEngine();

    upstoxFeedService.connect();
    const server = http.createServer(app);
    wsManager.current = new WebSocketManager(server);
    import("./modules/websocket/wsManager.js").then(m => m.setHoldingsService(holdings));



    server.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

startServer();
