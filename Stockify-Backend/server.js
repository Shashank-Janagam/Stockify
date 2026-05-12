import "dotenv/config";

import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";
import cookieParser from "cookie-parser";
import { connectMongo } from "./db/mongo.js";
import { WebSocketManager } from "./modules/websocket/wsManager.js";

import indiaLiveRoutes from "./modules/stocks/indiaLive.routes.js"
import searchResults from "./modules/Search/searchResults.js";
import searchUpdates from "./modules/Search/searchUpdates.js"
import getBalance from "./modules/payments/getBalance.js"
import payments from "./modules/payments/payment.js";
import transactions from "./modules/payments/transactions.js"
import webhooks from "./modules/payments/razorpayWeb.js";
import multiStocks from "./modules/stocks/multiStream.routes.js"
import OrderExecution from "./modules/OrderExecution/buyStock.js";
import sellStock from "./modules/OrderExecution/sellStock.js";
import * as holdings from "./modules/OrderExecution/holdings.js";
import portfolioRoutes from "./modules/portfolio/portfolio.routes.js";
import aiRoutes from "./modules/ai/ai.routes.js";
import login from "./Middleware/login.js"
import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10, 
});

const app = express();
const PORT = process.env.PORT || 4000;
app.use( "/api/webhooks/razorpay", express.raw({ type: "application/json" })
);
app.use(
  cors({
    origin: ["http://localhost:5173","https://wardless-postmyxedematous-jeneva.ngrok-free.dev","https://stockify-india.vercel.app",
            "https://stockifyindia.shop","https://www.stockifyindia.shop"  ],
     // ✅ exact origin
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS","PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
  }),
);
app.use(cookieParser()); // ⭐ THIS FIXES YOUR ERROR

app.use(express.json());
app.set("trust proxy", true);
app.use("/api/login",login);
app.use("/api/indiaSEE", indiaLiveRoutes);
app.use("/api/search", searchResults);
app.use("/api/searchUpdates", searchUpdates);
app.use("/api/getBalance",getBalance);
app.use("/api/payments",payments);
app.use("/api/transactions", transactions);
app.use("/api/webhooks",webhooks)
app.use("/api/explore",multiStocks)
app.use("/api/orderExecution",OrderExecution)
app.use("/api/sellStock",sellStock);
app.use("/api/holdings", holdings.default);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/ai", aiRoutes,limiter);

// app.use("/api/indiaSEE",indiaReplay);

app.get("api/health", (req, res) => {
  res.status(200).send("OK");
});

const wsManager = { current: null };
async function startServer() {
  try {
    await connectMongo();

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
