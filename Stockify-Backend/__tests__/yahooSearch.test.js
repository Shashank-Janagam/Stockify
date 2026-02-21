import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// yahooSearch imports and uses global `fetch`
const { yahooSearch } = await import("../modules/Search/yahooSearch.js");

const mockQuotes = [
  {
    symbol: "RELIANCE.NS",
    shortname: "Reliance Industries",
    quoteType: "EQUITY",
    exchange: "NSI",
  },
  {
    symbol: "TCS.NS",
    shortname: "Tata Consultancy Services",
    quoteType: "EQUITY",
    exchange: "NSI",
  },
  // Should be filtered out: not .NS
  {
    symbol: "AAPL",
    shortname: "Apple Inc",
    quoteType: "EQUITY",
    exchange: "NMS",
  },
  // Should be filtered out: not EQUITY
  {
    symbol: "NIFTY50.NS",
    shortname: "Nifty 50",
    quoteType: "INDEX",
    exchange: "NSI",
  },
  // Should be filtered out: missing shortname
  {
    symbol: "XYZ.NS",
    shortname: undefined,
    quoteType: "EQUITY",
    exchange: "NSI",
  },
];

describe("yahooSearch", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ quotes: mockQuotes }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns only NSE EQUITY stocks", async () => {
    const results = await yahooSearch("reliance");
    expect(results.length).toBe(2);
    expect(results.every((r) => r.symbol.endsWith(".NS"))).toBe(true);
    expect(results.every((r) => r.exchange === "NSE")).toBe(true);
  });

  it("maps results to the expected shape", async () => {
    const results = await yahooSearch("reliance");
    const reliance = results.find((r) => r.symbol === "RELIANCE.NS");
    expect(reliance).toMatchObject({
      symbol: "RELIANCE.NS",
      name: "Reliance Industries",
      exchange: "NSE",
      type: "EQUITY",
      source: "yahoo",
      popularity: 1,
    });
    expect(reliance.updatedAt).toBeInstanceOf(Date);
  });

  it("returns empty array when quotes is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({}),
      })
    );
    const results = await yahooSearch("anything");
    expect(results).toEqual([]);
  });

  it("builds the correct fetch URL with encoded query", async () => {
    await yahooSearch("tata motors");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining("tata%20motors")
    );
  });
});
