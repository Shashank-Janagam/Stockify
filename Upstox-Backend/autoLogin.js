/**
 * autoLogin.js — Automated Daily Upstox Authentication
 *
 * Automates 2FA login every morning before market opens using:
 *  - Mobile Number
 *  - Automated 6-digit TOTP (via built-in crypto RFC 6238)
 *  - 6-digit PIN
 *
 * Saves daily access_token directly to MongoDB (`upstox_access`).
 *
 * Usage:
 *  - One-time run: node autoLogin.js
 *  - Scheduled cron: node autoLogin.js --cron
 */

import axios from "axios";
import dotenv from "dotenv";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { Token } from "./TokenModel.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Multi-candidate .env discovery
const envCandidates = [
  path.join(__dirname, ".env"),
  path.join(__dirname, "../Stockify-Backend/.env"),
  path.join(__dirname, "../../Stockify-Backend/.env"),
  path.join(__dirname, "../.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "Upstox-Backend/.env"),
  path.resolve(process.cwd(), "Stockify-Backend/.env"),
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

// ─── Environment Configuration ──────────────────────────────
const CLIENT_ID     = process.env.UPSTOX_CLIENT_ID;
const CLIENT_SECRET = process.env.UPSTOX_CLIENT_SECRET;
const REDIRECT_URI  = process.env.UPSTOX_REDIRECT_URI || "http://localhost:3000/callback";
const MONGO_URI     = process.env.MONGO_URI;

const MOBILE_NUMBER = process.env.UPSTOX_MOBILE;
const PIN           = process.env.UPSTOX_PIN;
const TOTP_SECRET   = process.env.UPSTOX_TOTP_KEY;

// ─── Built-in RFC 6238 TOTP Generator (Zero extra dependencies) ───
function base32ToBuffer(base32) {
  const clean = base32.replace(/[\s=-]/g, "").toUpperCase();
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const output = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = alphabet.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function generateTOTP(secret, timeStep = 30) {
  if (!secret) throw new Error("TOTP secret key is missing");
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / timeStep);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const keyBuffer = base32ToBuffer(secret);
  const hmac = crypto.createHmac("sha1", keyBuffer).update(counterBuffer).digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(code % 1000000).padStart(6, "0");
}

// ─── Automated Headless Login Function ──────────────────────
export async function runAutoLogin() {
  const CLIENT_ID     = process.env.UPSTOX_CLIENT_ID;
  const CLIENT_SECRET = process.env.UPSTOX_CLIENT_SECRET;
  const REDIRECT_URI  = process.env.UPSTOX_REDIRECT_URI || "http://localhost:3000/callback";
  const MONGO_URI     = process.env.MONGO_URI || "mongodb+srv://shashijanagam2004_db_user:hg00fvxTmkNkOdj8@stocks.ugz3urv.mongodb.net/?appName=stocks";

  const MOBILE_NUMBER = process.env.UPSTOX_MOBILE;
  const PIN           = process.env.UPSTOX_PIN;
  const TOTP_SECRET   = process.env.UPSTOX_TOTP_KEY;

  console.log(`\n======================================================`);
  console.log(`🚀 [Upstox Auto-Login] Starting login sequence at ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`);
  console.log(`======================================================`);

  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("❌ Missing UPSTOX_CLIENT_ID or UPSTOX_CLIENT_SECRET in .env");
    return false;
  }

  if (!MOBILE_NUMBER || !PIN || !TOTP_SECRET) {
    console.error("❌ Missing required auto-login credentials in .env:");
    console.error("   - UPSTOX_MOBILE : Registered 10-digit mobile number");
    console.error("   - UPSTOX_PIN    : 6-digit Upstox PIN");
    console.error("   - UPSTOX_TOTP_KEY: TOTP secret key from Upstox 2FA setup");
    return false;
  }

  if (!MONGO_URI) {
    console.error("❌ Missing MONGO_URI in .env");
    return false;
  }

  // Dynamically load puppeteer to fail gracefully if not installed
  let puppeteer;
  try {
    puppeteer = (await import("puppeteer")).default;
  } catch (_) {
    console.error("❌ 'puppeteer' package is not installed.");
    console.error("   Please install it by running: npm install puppeteer");
    return false;
  }

  let browser = null;
  try {
    console.log("🌐 Launching headless browser...");
    const launchOptions = {
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-extensions",
      ],
    };

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    let authCode = null;

    // 🎯 Instant Code Interceptor:
    // Captures ?code= the millisecond Upstox issues the 302 redirect.
    // This eliminates the need to run ngrok.exe or an Express server on port 3000!
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const reqUrl = req.url();
      if (reqUrl.includes("code=") && !authCode) {
        try {
          const parsed = new URL(reqUrl);
          const c = parsed.searchParams.get("code");
          if (c) {
            authCode = c;
            console.log(`🎯 Intercepted redirect callback with code: ${authCode}`);
            req.abort().catch(() => {});
            return;
          }
        } catch (_) {}
      }
      req.continue().catch(() => {});
    });

    page.on("framenavigated", (frame) => {
      const frameUrl = frame.url();
      if (frameUrl.includes("code=") && !authCode) {
        try {
          const parsed = new URL(frameUrl);
          const c = parsed.searchParams.get("code");
          if (c) authCode = c;
        } catch (_) {}
      }
    });

    const authUrl = `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
      REDIRECT_URI
    )}`;

    console.log(`🔗 Navigating to Upstox login dialog...`);
    await page.goto(authUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Step 1: Mobile Number
    console.log("📱 Entering Mobile Number...");
    const mobileInputSelector = 'input[type="tel"], input#mobileNum, input[name="mobileNumber"]';
    await page.waitForSelector(mobileInputSelector, { timeout: 15000 });
    await page.type(mobileInputSelector, MOBILE_NUMBER);

    // Click Get OTP / Continue
    const continueBtnSelector = 'button[type="submit"], button#getOtp, button.button--primary';
    await page.waitForSelector(continueBtnSelector, { timeout: 10000 });
    await page.click(continueBtnSelector);

    // Step 2: TOTP Entry
    console.log("🔑 Generating 6-digit TOTP code...");
    const totpCode = generateTOTP(TOTP_SECRET);
    console.log(`   Generated TOTP: ${totpCode}`);

    const otpInputSelector = 'input#otpNum, input[name="otp"], input[type="text"][maxlength="6"], input[pattern="[0-9]*"]';
    await page.waitForSelector(otpInputSelector, { timeout: 15000 });
    await page.type(otpInputSelector, totpCode);

    // Submit OTP
    await page.keyboard.press("Enter");

    // Step 3: Enter 6-digit PIN
    console.log("🔒 Entering 6-digit PIN...");
    const pinInputSelector = 'input#pinCode, input[type="password"], input[name="pin"]';
    await page.waitForSelector(pinInputSelector, { timeout: 15000 });
    await page.type(pinInputSelector, PIN);

    // Submit PIN
    await page.keyboard.press("Enter");

    // Step 4: Wait for redirect and extract ?code=
    console.log("⏳ Waiting for authorization redirect...");

    // Wait up to 15 seconds for authCode to be intercepted if not already set
    const startTime = Date.now();
    while (!authCode && Date.now() - startTime < 15000) {
      const currentUrl = page.url();
      if (currentUrl.includes("code=")) {
        try {
          const parsedUrl = new URL(currentUrl);
          authCode = parsedUrl.searchParams.get("code");
          if (authCode) break;
        } catch (_) {}
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    if (!authCode) {
      throw new Error(`Failed to extract code from redirect URL. Last URL: ${page.url()}`);
    }

    console.log(`✅ Authorization code extracted: ${authCode}`);

    await browser.close();
    browser = null;

    // Step 5: Exchange authorization code for daily access_token
    console.log("🔄 Exchanging code for daily access token...");
    const tokenResponse = await axios.post(
      "https://api.upstox.com/v2/login/authorization/token",
      new URLSearchParams({
        code: authCode,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }).toString(),
      {
        headers: {
          accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) {
      throw new Error("No access_token returned by Upstox API");
    }

    console.log("✅ Access token received from Upstox API!");

    // Step 6: Save Access Token to MongoDB
    console.log("📦 Connecting to MongoDB...");
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGO_URI);
    }

    await Token.findOneAndUpdate(
      { name: "upstox_access" },
      { access_token: accessToken, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    console.log(`✅ [Upstox Auto-Login] Daily access token successfully persisted to MongoDB!`);
    console.log(`🎉 Upstox feed service is now authenticated and ready for trading.\n`);
    return true;
  } catch (err) {
    console.error(`❌ [Upstox Auto-Login] Failed:`, err.message);
    return false;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ─── Direct Execution & Cron Scheduling ─────────────────────
const isCronMode = process.argv.includes("--cron");

if (isCronMode) {
  // Built-in interval-based daily scheduler at 08:45 AM IST (03:15 UTC)
  console.log("⏰ Daily Upstox Login Scheduler started.");
  console.log("   Target Time: Every Monday-Friday at 08:45 AM IST");

  setInterval(async () => {
    const now = new Date();
    // Convert to IST
    const istTimeStr = now.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata" });
    const istDay = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).getDay();

    // Check if weekday (Mon=1 ... Fri=5) and time is 08:45
    if (istDay >= 1 && istDay <= 5 && istTimeStr.startsWith("08:45:")) {
      console.log(`[Scheduler] ⏰ Morning bell trigger at ${istTimeStr} IST.`);
      await runAutoLogin();
    }
  }, 30000); // Check every 30s
} else if (process.argv[1]?.endsWith("autoLogin.js")) {
  runAutoLogin().then((success) => {
    process.exit(success ? 0 : 1);
  });
}
