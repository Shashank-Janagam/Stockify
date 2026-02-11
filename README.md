# Stockify

Stockify is a full-stack stock market web application with a React + TypeScript frontend and a Node.js + Express backend.

## Project Structure

- `Stockify-Frontend/` – Vite-based React client.
- `Stockify-Backend/` – Express API server and data integrations.

## Prerequisites

- Node.js 18+
- npm

## Setup

### 1) Install dependencies

From the repository root:

```bash
cd Stockify-Backend && npm install
cd ../Stockify-Frontend && npm install
```

### 2) Configure environment variables

Create `.env` files in the backend and frontend directories based on the variables your deployment requires (API keys, Firebase config, database connection strings, payment keys, etc.).

## Run Locally

Open two terminals.

### Terminal 1: Start backend

```bash
cd Stockify-Backend
npm start
```

### Terminal 2: Start frontend

```bash
cd Stockify-Frontend
npm run dev
```

Then open the frontend URL shown by Vite (usually `http://localhost:5173`).

## Available Scripts

### Frontend (`Stockify-Frontend`)

- `npm run dev` – Run development server.
- `npm run build` – Type-check and build production bundle.
- `npm run lint` – Run ESLint.
- `npm run preview` – Preview production build.

### Backend (`Stockify-Backend`)

- `npm start` – Start API server.

## Notes

- This repository currently includes sub-project specific README/documentation inside app folders where applicable.
- Ensure required external services (databases, caches, market data providers) are configured before testing full functionality.
