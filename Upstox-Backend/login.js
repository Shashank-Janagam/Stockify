import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { Token } from "./TokenModel.js";

dotenv.config();

const app = express();
const PORT = process.env.LOGIN_PORT || 3000;

const API_KEY = process.env.UPSTOX_CLIENT_ID;
const API_SECRET = process.env.UPSTOX_CLIENT_SECRET;
const REDIRECT_URI = process.env.UPSTOX_REDIRECT_URI || `http://localhost:${PORT}/callback`;

if (!API_KEY || !API_SECRET) {
  console.error("❌ Missing UPSTOX_CLIENT_ID or UPSTOX_CLIENT_SECRET in .env file.");
  process.exit(1);
}

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ Missing MONGO_URI in .env file.");
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => console.log("📦 Connected to MongoDB"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// Route to initiate the login flow
app.get("/login", (req, res) => {
  const authUrl = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${API_KEY}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
  console.log(`Redirecting to: ${authUrl}`);
  res.redirect(authUrl);
});

// Callback route where Upstox redirects after login
app.get("/callback", async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("Authorization code not found.");
  }

  console.log(`✅ Received authorization code: ${code}`);

  try {
    const data = new URLSearchParams({
      code: code,
      client_id: API_KEY,
      client_secret: API_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    });

    const config = {
      method: 'post',
      url: 'https://api.upstox.com/v2/login/authorization/token',
      headers: { 
        'accept': 'application/json', 
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      data: data.toString()
    };

    const response = await axios(config);
    const accessToken = response.data.access_token;

    console.log(`✅ Access Token obtained successfully!`);
    
    // Save token to MongoDB
    await Token.findOneAndUpdate(
      { name: "upstox_access" },
      { access_token: accessToken, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    console.log(`✅ Access Token saved to MongoDB`);

    res.send(`
      <h1>Login Successful!</h1>
      <p>Your access token has been generated and saved to MongoDB.</p>
      <p>You can now close this window and run <code>websocket.js</code>.</p>
    `);
    
    // Optional: exit process after successful login
    setTimeout(() => {
      console.log("Shutting down login server...");
      process.exit(0);
    }, 2000);

  } catch (error) {
    console.error("❌ Error fetching access token:", error.response ? error.response.data : error.message);
    res.status(500).send(`Error fetching access token: ${JSON.stringify(error.response ? error.response.data : error.message)}`);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Upstox Login server running on port ${PORT}`);
  console.log(`👉 Open http://localhost:${PORT}/login in your browser to authenticate.`);
});
