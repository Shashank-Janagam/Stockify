# Stockify – System Architecture

## Overview

Stockify is a full-stack paper-trading platform for Indian equities (NSE). It is composed of three distinct services:

| Service | Technology | Responsibility |
|---|---|---|
| **Stockify-Frontend** | React 19, TypeScript, Vite | Browser UI – charts, trading panel, portfolio |
| **Stockify-Backend** | Node.js, Express 5 | REST + SSE API, business logic, data persistence |
| **AlgoTrading** | Node.js, Express 5 | Automated stop-loss execution engine |

---

## High-Level Architecture

```mermaid
graph TB
    subgraph Client["Browser (User)"]
        FE["Stockify-Frontend\nReact + TypeScript\nDeployed on Vercel"]
    end

    subgraph Backend["Stockify-Backend\n(Node.js / Express)"]
        API["REST API\n:4000"]
        WS["WebSocket Server\n(ws)"]
    end

    subgraph Algo["AlgoTrading\n(Node.js)"]
        SLE["Stop-Loss Engine\n(polls every 5 s)"]
    end

    subgraph ExternalAPIs["External APIs"]
        YF["Yahoo Finance\n(yahoo-finance2)"]
        FB_CLIENT["Firebase Auth\n(Client SDK)"]
        FB_ADMIN["Firebase Admin SDK\n(Session Cookies)"]
        RZP["Razorpay\n(Payment Gateway)"]
    end

    subgraph DataStores["Data Stores"]
        PG["PostgreSQL\n(Neon / Supabase)\nUsers, Wallet, Orders,\nTrades, Positions, Stocks"]
        MONGO["MongoDB Atlas\n(connectMongo)"]
        REDIS["Redis\n(ioredis / redis)\nCache + Pub/Sub"]
    end

    FE -- "HTTPS REST / SSE" --> API
    FE -- "Firebase SDK" --> FB_CLIENT
    FB_CLIENT -- "ID Token (POST /api/login)" --> API
    API -- "Verify Token / Session" --> FB_ADMIN

    API -- "Stock Quotes / History / Search" --> YF
    SLE -- "Price Polling" --> YF

    API -- "Create Order / Verify Payment" --> RZP
    RZP -- "POST /api/webhooks/razorpay" --> API

    API -- "Read / Write" --> PG
    API -- "Read / Write" --> MONGO
    API -- "Cache / Pub" --> REDIS

    SLE -- "Read / Write" --> PG
    SLE -- "Sub NEW_STOPLOSS\nPub STOPLOSS_TRIGGERED" --> REDIS

    API -- "Pub NEW_STOPLOSS\n(on BUY with SL)" --> REDIS
    API -- WS --> FE
```

---

## Frontend Architecture

```mermaid
graph TB
    subgraph FE["Stockify-Frontend (React + TypeScript)"]
        main["main.tsx\n(App Entry)"]
        App["App.tsx\n(BrowserRouter + Routes)"]

        subgraph Auth["Authentication"]
            FirebaseSDK["firebase.ts\n(Firebase Client SDK)"]
            AuthProvider["AuthProvider.tsx\n(useContext)"]
            ProtectedRoute["ProtectedRoute.tsx"]
            loginUtil["auth/login.ts\n(ID token → backend session)"]
        end

        subgraph Pages["Pages (react-router-dom)"]
            HomePage["/  HomePage"]
            Dashboard["/dashboard  Dashboard"]
            StockPage["/indiaSEE/:symbol/:name\nStockPageSSE"]
            FundsPage["/user/balance  FundsPage"]
            PortfolioPage["/portfolio  Portfolio"]
            SetPassword["/set-password  SetPassword"]
        end

        subgraph Components["Shared Components"]
            Navbar["Navbar"]
            LoginModal["LoginModule"]
            SearchOverlay["SearchOverlay"]
            OrderPanel["OrderPanel\n(Buy / Sell)"]
            HoldingsPage["HoldingsPage"]
            Transactions["Transactions"]
            Explore["Explore"]
            Charts["StocksChartIndia\nStockCandleChartIndia\nStocksChartUS"]
            AddMoney["AddMoneyCard\n(Razorpay SDK)"]
            BalanceCard["BalanceCard"]
        end

        subgraph Context["Context (SSE Streams)"]
            ExploreSSE["ExploreSSEProvider\n(persistent multi-stock SSE)"]
        end
    end

    main --> App
    App --> Auth
    App --> Pages
    App --> Components
    App --> Context
```

### Frontend Routes

| Path | Page | Auth Required |
|---|---|---|
| `/` | `HomePage` | No |
| `/indiaSEE/:symbol/:name` | `StockPageSSE` | No |
| `/user/balance` | `FundsPage` | ✅ Yes |
| `/portfolio` | `Portfolio` | ✅ Yes |
| `/set-password` | `SetPassword` | ✅ Yes |
| `/dashboard` | `Dashboard` | ✅ Yes |

---

## Backend Architecture

```mermaid
graph TB
    subgraph SB["Stockify-Backend (Express 5)"]
        Server["server.js\n(HTTP + WebSocket)"]

        subgraph MW["Middleware"]
            CORS["CORS\n(localhost, Vercel, ngrok)"]
            CP["cookie-parser"]
            Auth["requireAuth.js\n(Firebase session cookie)"]
            AdminJS["admin.js\n(Firebase Admin SDK)"]
        end

        subgraph Routes["API Routes"]
            Login["/api/login\n(POST login / logout / status)"]
            IndiaSEE["/api/indiaSEE/:symbol\n(SSE stream / history / quote)"]
            Search["/api/search\n/api/searchUpdates"]
            Explore["/api/explore\n(multi-stock SSE)"]
            Balance["/api/getBalance"]
            Payments["/api/payments\n(create-order / verify)"]
            Webhooks["/api/webhooks/razorpay"]
            Transactions["/api/transactions"]
            BuyStock["/api/orderExecution (buy)"]
            SellStock["/api/sellStock"]
            Holdings["/api/holdings"]
            Portfolio["/api/portfolio\n(summary / history)"]
        end

        subgraph DB["Database Layer"]
            Mongo["db/mongo.js\n(MongoDB Atlas)"]
            SQL["db/sql.js\n(PostgreSQL Pool)"]
        end

        subgraph Cache["Cache Layer"]
            RedisClient["cache/redisClient.js\n(ioredis)"]
            SearchCache["cache/searchCache.js"]
        end

        subgraph Services["External Service Wrappers"]
            YahooHistory["yahooIndiaHistory.service.js"]
            YahooQuote["yahooIndiaQuote.service.js"]
            YahooSearch["yahooSearch.js"]
            RazorpaySDK["razorpay.js\n(Razorpay SDK instance)"]
            Orders["payments/orders.js\n(createOrderRecord)"]
            DBUtils["modules/dbUtils.js\n(getUserId)"]
        end
    end

    Server --> MW
    Server --> Routes
    Routes --> DB
    Routes --> Cache
    Routes --> Services
```

### PostgreSQL Schema (Key Tables)

| Table | Purpose |
|---|---|
| `users` | Firebase UID → internal integer ID, name, email |
| `wallet_accounts` | Per-user cash balance (`available_balance`, `blocked_balance`) |
| `payment_orders` | Razorpay order records |
| `stocks` | Stock master: symbol, name, exchange, tick size |
| `orders` | Buy/sell orders (side, type, quantity, price, status) |
| `trades` | Executed trades with `realized_pnl` |
| `positions` | Open long positions with stop-loss metadata |
| `wallet_transactions` | Ledger of every debit/credit linked to trades or deposits |

### API Endpoint Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/login` | No | Exchange Firebase ID token for session cookie |
| `POST` | `/api/login/logout` | No | Clear session cookie |
| `GET` | `/api/login/status` | No | Verify active session |
| `GET` | `/api/indiaSEE/:symbol/stream` | No | SSE live price stream |
| `GET` | `/api/indiaSEE/:symbol/history` | No | OHLCV history |
| `GET` | `/api/indiaSEE/:symbol/quote` | No | Latest quote |
| `GET` | `/api/search` | No | Yahoo Finance symbol search |
| `GET` | `/api/searchUpdates` | No | Cached bulk quote updates |
| `GET` | `/api/explore` | No | Multi-stock SSE stream |
| `GET` | `/api/getBalance/getBalance` | ✅ | Wallet balance (Redis-cached) |
| `POST` | `/api/payments/create-order` | ✅ | Create Razorpay order |
| `POST` | `/api/payments/verify` | ✅ | Verify Razorpay signature |
| `POST` | `/api/webhooks/razorpay` | No | Razorpay payment webhook |
| `GET` | `/api/transactions` | ✅ | Wallet transaction history |
| `POST` | `/api/orderExecution/buy` | ✅ | Market buy order |
| `POST` | `/api/sellStock` | ✅ | Market sell order |
| `GET` | `/api/holdings` | ✅ | Current open positions |
| `GET` | `/api/portfolio/summary` | ✅ | Portfolio P&L + holdings |
| `GET` | `/api/portfolio/history` | ✅ | Order/trade history |

---

## AlgoTrading – Stop-Loss Engine

```mermaid
graph LR
    subgraph SLE["AlgoTrading / stoploss-engine"]
        Loader["loadActiveStops()\n(on startup from DB)"]
        RedisSubscriber["Redis SUBSCRIBER\n'NEW_STOPLOSS' channel"]
        MemStore["In-Memory Map\nsymbol → positions[]"]
        PricePoller["setInterval 5 s\ncheckPrices()"]
        PriceMonitor["priceMonitor.js\n(Yahoo Finance batch quote)"]
        Executor["executeStopLoss()\nsellStock.js"]
        RedisPublisher["Redis PUBLISHER\n'STOPLOSS_TRIGGERED'"]
    end

    PG_SL[("PostgreSQL\npositions + trades")]
    REDIS_SL[("Redis")]

    Loader -- "SELECT open positions\nwhere stoploss_enabled" --> PG_SL
    Loader --> MemStore
    RedisSubscriber -- "sub NEW_STOPLOSS" --> REDIS_SL
    RedisSubscriber --> MemStore
    PricePoller --> PriceMonitor
    PriceMonitor -- "yahoo-finance2 quote" --> YF2["Yahoo Finance"]
    PricePoller --> Executor
    Executor -- "UPDATE positions, INSERT trades" --> PG_SL
    Executor --> RedisPublisher
    RedisPublisher -- "pub STOPLOSS_TRIGGERED" --> REDIS_SL
```

**Flow:**
1. On startup the engine loads all open positions with stop-loss enabled from PostgreSQL into an in-memory `Map`.
2. The engine subscribes to the Redis `NEW_STOPLOSS` channel; when the backend processes a new buy order with a stop-loss price it publishes to this channel and the engine registers it instantly.
3. Every 5 seconds it fetches live prices from Yahoo Finance for all watched symbols.
4. If a price falls to or below a registered stop-loss level the position is closed via a direct PostgreSQL transaction (mirrors the sell endpoint logic) and a `STOPLOSS_TRIGGERED` event is published on Redis.

---

## Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant FirebaseAuth as Firebase Auth (Google)
    participant Backend
    participant FirebaseAdmin as Firebase Admin SDK

    User->>Frontend: Click "Login"
    Frontend->>FirebaseAuth: signInWithPopup / signInWithEmailAndPassword
    FirebaseAuth-->>Frontend: Firebase User + ID Token
    Frontend->>Backend: POST /api/login  { token }
    Backend->>FirebaseAdmin: createSessionCookie(token, expiresIn)
    FirebaseAdmin-->>Backend: sessionCookie (JWT)
    Backend-->>Frontend: Set-Cookie: session (httpOnly, secure)
    Note over Frontend,Backend: All subsequent requests carry session cookie
    Backend->>FirebaseAdmin: verifySessionCookie(cookie) on every protected route
    FirebaseAdmin-->>Backend: Decoded claims (uid, email, name)
```

---

## Payment Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Razorpay

    User->>Frontend: Enter amount, click "Add Funds"
    Frontend->>Backend: POST /api/payments/create-order { amount }
    Backend->>Razorpay: razorpay.orders.create(amount, INR)
    Razorpay-->>Backend: order { id, amount }
    Backend->>PostgreSQL: INSERT payment_orders
    Backend-->>Frontend: order details
    Frontend->>Razorpay: Open Razorpay Checkout (order id)
    User->>Razorpay: Complete payment
    Razorpay-->>Frontend: razorpay_order_id, payment_id, signature
    Frontend->>Backend: POST /api/payments/verify
    Backend->>Backend: HMAC-SHA256 signature check
    Backend-->>Frontend: { success: true }
    Razorpay-->>Backend: POST /api/webhooks/razorpay (payment.captured)
    Backend->>PostgreSQL: UPDATE wallet_accounts (credit balance)
```

---

## Order Execution Flow (Buy)

```mermaid
sequenceDiagram
    participant Frontend
    participant Backend
    participant YahooFinance
    participant PostgreSQL
    participant Redis

    Frontend->>Backend: POST /api/orderExecution/buy { symbol, quantity, sl_enabled, sl_price }
    Backend->>Backend: requireAuth → resolve userId
    Backend->>YahooFinance: quote(symbol.NS) → live price
    Backend->>PostgreSQL: BEGIN transaction
    Backend->>PostgreSQL: SELECT wallet (FOR UPDATE)
    alt Insufficient Balance
        Backend-->>Frontend: 400 Insufficient balance
    else
        Backend->>PostgreSQL: UPDATE wallet (debit)
        Backend->>PostgreSQL: INSERT orders (BUY, MARKET, EXECUTED)
        Backend->>PostgreSQL: INSERT trades
        Backend->>PostgreSQL: INSERT wallet_transactions (DEBIT)
        Backend->>PostgreSQL: INSERT positions (LONG, OPEN)
        Backend->>PostgreSQL: COMMIT
        Backend->>Redis: DEL wallet:balance:{uid}
        alt Stop-Loss Enabled
            Backend->>Redis: PUBLISH NEW_STOPLOSS
        end
        Backend-->>Frontend: { status: EXECUTED, price, balance }
    end
```

---

## Technology Stack Summary

### Frontend
| Category | Library / Tool |
|---|---|
| Framework | React 19 + TypeScript |
| Build Tool | Vite 7 |
| Routing | React Router DOM 7 |
| Charts | Chart.js 4, react-chartjs-2, chartjs-chart-financial |
| Auth | Firebase 12 (client SDK) |
| HTTP | Axios |
| Real-time | SSE (EventSource) |
| Payments | Razorpay Checkout JS |
| Deployment | Vercel |

### Backend
| Category | Library / Tool |
|---|---|
| Runtime | Node.js 18+ (ESM) |
| Framework | Express 5 |
| Auth | Firebase Admin SDK 13 |
| Databases | MongoDB (mongodb 7), PostgreSQL (pg 8) |
| Cache / PubSub | Redis (ioredis 5) |
| Stock Data | yahoo-finance2 3 |
| Payments | Razorpay SDK 2 |
| Real-time | SSE + WebSocket (ws 8) |

### AlgoTrading
| Category | Library / Tool |
|---|---|
| Runtime | Node.js 18+ (ESM) |
| Framework | Express 5 |
| Database | PostgreSQL (pg 8) |
| Cache / PubSub | Redis (ioredis 5, redis 5) |
| Stock Data | yahoo-finance2 3 |

---

## Deployment Topology

```
┌─────────────────────────────────────────────────────┐
│                    Internet                          │
└──────┬──────────────────────────┬───────────────────┘
       │                          │
┌──────▼──────┐           ┌───────▼────────┐
│   Vercel    │           │  Razorpay CDN  │
│  (Frontend) │           │  checkout.js   │
└──────┬──────┘           └───────┬────────┘
       │ HTTPS REST/SSE           │ webhooks
┌──────▼──────────────────────────▼────────┐
│         Stockify-Backend                 │
│         (Node.js / Express :4000)        │
└──────┬──────────┬──────────┬─────────────┘
       │          │          │
┌──────▼───┐ ┌───▼────┐ ┌───▼──────────────┐
│ MongoDB  │ │  PG    │ │     Redis         │
│  Atlas   │ │(Neon / │ │  (Redis Cloud)    │
│          │ │Supabase│ │  Cache + Pub/Sub  │
└──────────┘ └────────┘ └───────┬───────────┘
                                │ NEW_STOPLOSS
                        ┌───────▼────────────┐
                        │  AlgoTrading       │
                        │  Stop-Loss Engine  │
                        └────────────────────┘
```
