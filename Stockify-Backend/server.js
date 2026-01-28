import "dotenv/config";

import express from "express";
import cors from "cors";
import http from "http";
import { WebSocketServer } from "ws";

import { connectMongo } from "./db/mongo.js";

import indiaLiveRoutes from "./modules/stocks/indiaLive.routes.js"
import searchResults from "./modules/Search/searchResults.js";
import searchUpdates from "./modules/Search/searchUpdates.js"
import getBalance from "./modules/payments/getBalance.js"
import payments from "./modules/payments/payment.js";
import transactions from "./modules/payments/transactions.js"
import webhooks from "./modules/payments/razorpayWeb.js";
import multiStocks from "./modules/stocks/multiStream.routes.js"


const app = express();
const PORT = 4000;
app.use(
  "/api/webhooks/razorpay",
  express.raw({ type: "application/json" })
);
app.use(
  cors({
    origin: ["http://localhost:5173","https://wardless-postmyxedematous-jeneva.ngrok-free.dev","https://stockify-india.vercel.app"],
     // ✅ exact origin
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
  }),
);

app.use(express.json());
app.set("trust proxy", true);

app.use("/api/indiaSEE", indiaLiveRoutes);
app.use("/api/search", searchResults);
app.use("/api/searchUpdates", searchUpdates);
app.use("/api/getBalance",getBalance);
app.use("/api/payments",payments);
app.use("/api/transactions", transactions);
app.use("/api/webhooks",webhooks)
app.use("/api/explore",multiStocks)

// app.use("/api/indiaSEE",indiaReplay);
async function startServer() {
  try {
    await connectMongo();

    const server = http.createServer(app);
    const wss = new WebSocketServer({ server });

    wss.on("connection", (ws) => {
      console.log("🟢 WS client connected");
    });

    server.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

startServer();
