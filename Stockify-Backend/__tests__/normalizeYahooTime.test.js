import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to stub the module dependencies before importing buyStock
vi.mock("../db/sql.js", () => ({ db: {} }));
vi.mock("../cache/redisClient.js", () => ({ default: {} }));
vi.mock("../Middleware/requireAuth.js", () => ({ default: vi.fn() }));
vi.mock("yahoo-finance2", () => ({
  default: class {
    constructor() {}
    quote() { return Promise.resolve({}); }
  }
}));

const { normalizeYahooTime } = await import(
  "../modules/OrderExecution/buyStock.js"
);

describe("normalizeYahooTime", () => {
  it("returns ISO string for a valid ISO date string", () => {
    const input = "2024-01-15T10:30:00.000Z";
    const result = normalizeYahooTime(input);
    expect(result).toBe(new Date(input).toISOString());
  });

  it("converts a Unix timestamp in seconds (< 1e12) to ISO string", () => {
    const secondsTs = 1700000000; // Nov 2023
    const result = normalizeYahooTime(secondsTs);
    expect(result).toBe(new Date(secondsTs * 1000).toISOString());
  });

  it("converts a Unix timestamp in milliseconds (>= 1e12) to ISO string", () => {
    const msTs = 1700000000000;
    const result = normalizeYahooTime(msTs);
    expect(result).toBe(new Date(msTs).toISOString());
  });

  it("returns a fallback ISO string for an invalid string", () => {
    const before = Date.now();
    const result = normalizeYahooTime("not-a-date");
    const after = Date.now();
    const resultTime = new Date(result).getTime();
    expect(resultTime).toBeGreaterThanOrEqual(before);
    expect(resultTime).toBeLessThanOrEqual(after);
  });

  it("returns a fallback ISO string for null/undefined input", () => {
    const before = Date.now();
    const result = normalizeYahooTime(null);
    const after = Date.now();
    const resultTime = new Date(result).getTime();
    expect(resultTime).toBeGreaterThanOrEqual(before);
    expect(resultTime).toBeLessThanOrEqual(after);
  });
});
