/**
 * DST-säkert: radtider renderas i Europe/Stockholm oavsett klientens tidszon.
 */
import { describe, it, expect } from "vitest";
import { formatStockholmHm } from "@/lib/staff/formatStockholmTime";

describe("formatStockholmHm — Stockholm radtider", () => {
  it("sommartid (CEST, UTC+2): 14:30 UTC → 16:30", () => {
    expect(formatStockholmHm("2026-07-15T14:30:00Z")).toBe("16:30");
  });
  it("vintertid (CET, UTC+1): 14:30 UTC → 15:30", () => {
    expect(formatStockholmHm("2026-01-15T14:30:00Z")).toBe("15:30");
  });
  it("midnatt UTC vintertid → 01:00 Stockholm", () => {
    expect(formatStockholmHm("2026-01-15T00:00:00Z")).toBe("01:00");
  });
});
