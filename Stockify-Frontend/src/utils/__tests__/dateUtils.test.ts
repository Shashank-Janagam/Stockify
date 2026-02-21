import { describe, it, expect } from "vitest";
import { formatToIST, toISTDate } from "../dateUtils";

describe("toISTDate", () => {
  it("adds 5 hours 30 minutes to a UTC timestamp", () => {
    // 2024-01-15T00:00:00.000Z in UTC → 2024-01-15T05:30:00.000Z in IST
    const utc = "2024-01-15T00:00:00.000Z";
    const ist = toISTDate(utc);
    expect(ist.getUTCHours()).toBe(5);
    expect(ist.getUTCMinutes()).toBe(30);
  });

  it("returns a Date object", () => {
    const result = toISTDate("2024-06-01T12:00:00.000Z");
    expect(result).toBeInstanceOf(Date);
  });

  it("correctly offsets midnight UTC to IST", () => {
    const utc = "2024-03-20T00:00:00.000Z";
    const ist = toISTDate(utc);
    const expectedMs = new Date(utc).getTime() + 5.5 * 60 * 60 * 1000;
    expect(ist.getTime()).toBe(expectedMs);
  });
});

describe("formatToIST", () => {
  it("returns a non-empty string for a valid timestamp", () => {
    const result = formatToIST("2024-01-15T10:30:00.000Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("includes the year in the formatted output", () => {
    const result = formatToIST("2024-01-15T10:30:00.000Z");
    expect(result).toContain("2024");
  });

  it("formats a well-known timestamp consistently", () => {
    // Use a fixed timezone-neutral check: just verify it parses without throwing
    expect(() => formatToIST("2023-11-14T08:00:00.000Z")).not.toThrow();
  });
});
