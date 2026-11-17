/**
 * api.ts — Dynamic Environment & API URL Resolver
 *
 * Automatically resolves whether to use Local or Production URLs based on:
 * 1. Current browser hostname (localhost / 127.0.0.1 vs remote production)
 * 2. Vite environment mode (.env.development vs .env.production)
 */

export const isLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "0.0.0.0");

export function getHostAddress(): string {
  if (isLocalhost) {
    return (
      import.meta.env.VITE_LOCAL_HOST_ADDRESS ||
      import.meta.env.VITE_HOST_ADDRESS ||
      "http://localhost:4000"
    ).replace(/\/$/, "");
  }
  return (
    import.meta.env.VITE_PROD_HOST_ADDRESS ||
    import.meta.env.VITE_HOST_ADDRESS ||
    "https://api.stockifyindia.app"
  ).replace(/\/$/, "");
}

export function getPythonApiUrl(): string {
  if (isLocalhost) {
    return (
      import.meta.env.VITE_LOCAL_PYTHON_API_URL ||
      import.meta.env.VITE_PYTHON_API_URL ||
      "http://localhost:5001"
    ).replace(/\/$/, "");
  }
  return (
    import.meta.env.VITE_PROD_PYTHON_API_URL ||
    import.meta.env.VITE_PYTHON_API_URL ||
    "https://api.stockifyindia.app/news"
  ).replace(/\/$/, "");
}

export function getAlgoApiUrl(): string {
  if (isLocalhost) {
    return (
      import.meta.env.VITE_LOCAL_ALGO_API_URL ||
      import.meta.env.VITE_ALGO_API_URL ||
      "http://localhost:8000"
    ).replace(/\/$/, "");
  }
  return (
    import.meta.env.VITE_PROD_ALGO_API_URL ||
    import.meta.env.VITE_ALGO_API_URL ||
    "https://api.stockifyindia.app/api/autotrading"
  ).replace(/\/$/, "");
}

export function getAlgoWsUrl(): string {
  if (isLocalhost) {
    return (
      import.meta.env.VITE_LOCAL_ALGO_WS_URL ||
      import.meta.env.VITE_ALGO_WS_URL ||
      "ws://localhost:8000/live"
    );
  }
  return (
    import.meta.env.VITE_PROD_ALGO_WS_URL ||
    import.meta.env.VITE_ALGO_WS_URL ||
    "wss://api.stockifyindia.app/api/autotrading/live"
  );
}

export const HOST = getHostAddress();
export const PYTHON_HOST = getPythonApiUrl();
export const ALGO_HOST = getAlgoApiUrl();
export const ALGO_WS = getAlgoWsUrl();
