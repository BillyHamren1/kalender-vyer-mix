import { describe, it, expect } from "vitest";
import {
  calculateWorkTimeBuckets,
  splitWorkIntervalByRule,
  stockholmMinuteOfDay,
} from "@/lib/staffTimeFlow/workTimeBuckets";

/**
 * Konstruera en ISO-sträng som ger önskad Stockholm-wallclock-tid på
 * ett vinter-datum (CET, UTC+1). Vintertid undviker DST-fallgropar
 * och gör testerna deterministiska oavsett klientens tidszon.
 */
function stoIso(dateYmd: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  // Vintertid (jan): Stockholm = UTC+1 → subtrahera 1h för UTC.
  const utcH = h - 1;
  const sign = utcH < 0 ? "-" : "+";
  // Hantera negativ utcH (t.ex. 00:xx Sthlm → 23:xx UTC dagen innan).
  if (utcH < 0) {
    // Använd föregående datum.
    const d = new Date(`${dateYmd}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    const prev = d.toISOString().slice(0, 10);
    const realH = 24 + utcH;
    return `${prev}T${String(realH).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;
  }
  return `${dateYmd}T${String(utcH).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;
}

describe("stockholmMinuteOfDay", () => {
  it("vintertid: 09:00 lokal", () => {
    expect(stockholmMinuteOfDay(new Date("2026-01-15T08:00:00Z"))).toBe(9 * 60);
  });
  it("sommartid: 09:00 lokal", () => {
    expect(stockholmMinuteOfDay(new Date("2026-07-15T07:00:00Z"))).toBe(9 * 60);
  });
});

describe("splitWorkIntervalByRule", () => {
  it("07:00–17:00 → 600 normal, 0 övertid", () => {
    const { normal, overtime } = splitWorkIntervalByRule(stoIso("2026-01-15", "07:00"), stoIso("2026-01-15", "17:00"));
    expect(normal).toBe(600);
    expect(overtime).toBe(0);
  });
  it("09:00–21:00 → 8h normal, 4h övertid", () => {
    const { normal, overtime } = splitWorkIntervalByRule(stoIso("2026-01-15", "09:00"), stoIso("2026-01-15", "21:00"));
    expect(normal).toBe(8 * 60);
    expect(overtime).toBe(4 * 60);
  });
  it("04:00–12:00 → 5h normal, 3h övertid", () => {
    const { normal, overtime } = splitWorkIntervalByRule(stoIso("2026-01-15", "04:00"), stoIso("2026-01-15", "12:00"));
    expect(normal).toBe(5 * 60);
    expect(overtime).toBe(3 * 60);
  });
  it("20:00–03:00 (över midnatt) → 0h normal, 7h övertid", () => {
    const { normal, overtime } = splitWorkIntervalByRule(stoIso("2026-01-15", "20:00"), stoIso("2026-01-16", "03:00"));
    expect(normal).toBe(0);
    expect(overtime).toBe(7 * 60);
  });
  it("16:00–18:00 → 1h normal, 1h övertid", () => {
    const { normal, overtime } = splitWorkIntervalByRule(stoIso("2026-01-15", "16:00"), stoIso("2026-01-15", "18:00"));
    expect(normal).toBe(60);
    expect(overtime).toBe(60);
  });
  it("06:00–08:00 → 1h normal, 1h övertid", () => {
    const { normal, overtime } = splitWorkIntervalByRule(stoIso("2026-01-15", "06:00"), stoIso("2026-01-15", "08:00"));
    expect(normal).toBe(60);
    expect(overtime).toBe(60);
  });
  it("sommartid (CEST): 09:00–17:00 → 8h normal", () => {
    // 09:00 CEST = 07:00 UTC, 17:00 CEST = 15:00 UTC
    const { normal, overtime } = splitWorkIntervalByRule("2026-07-15T07:00:00Z", "2026-07-15T15:00:00Z");
    expect(normal).toBe(8 * 60);
    expect(overtime).toBe(0);
  });
});

describe("calculateWorkTimeBuckets — rader och rast", () => {
  it("arbetsrad + travelrad: travel räknas separat", () => {
    const buckets = calculateWorkTimeBuckets([
      { kind: "work", startIso: stoIso("2026-01-15", "09:00"), endIso: stoIso("2026-01-15", "17:00"), minutes: 480 },
      { kind: "travel", startIso: stoIso("2026-01-15", "17:00"), endIso: stoIso("2026-01-15", "18:00"), minutes: 60 },
    ]);
    expect(buckets.normalMinutes).toBe(480);
    expect(buckets.overtimeMinutes).toBe(0);
    expect(buckets.travelMinutes).toBe(60);
    expect(buckets.totalWorkMinutes).toBe(480);
  });

  it("Break 30m utan exakt position dras från normalMinutes först", () => {
    const buckets = calculateWorkTimeBuckets(
      [{ kind: "work", startIso: stoIso("2026-01-15", "09:00"), endIso: stoIso("2026-01-15", "19:00"), minutes: 600 }],
      { breakMinutes: 30 },
    );
    // 09–19: 8h normal + 2h övertid → minus 30m rast från normal
    expect(buckets.normalMinutes).toBe(8 * 60 - 30);
    expect(buckets.overtimeMinutes).toBe(2 * 60);
    expect(buckets.totalWorkMinutes).toBe(10 * 60 - 30);
  });

  it("Stor rast spiller över från normal till overtime", () => {
    const buckets = calculateWorkTimeBuckets(
      // Endast 1h normal (16–17) + 3h övertid (17–20). Rast 90m → 60m + 30m.
      [{ kind: "work", startIso: stoIso("2026-01-15", "16:00"), endIso: stoIso("2026-01-15", "20:00"), minutes: 240 }],
      { breakMinutes: 90 },
    );
    expect(buckets.normalMinutes).toBe(0);
    expect(buckets.overtimeMinutes).toBe(3 * 60 - 30);
  });

  it("private/unknown/gap räknas varken som normal eller övertid", () => {
    const buckets = calculateWorkTimeBuckets([
      { kind: "private", startIso: stoIso("2026-01-15", "09:00"), endIso: stoIso("2026-01-15", "17:00"), minutes: 480 },
      { kind: "unknown_place", startIso: stoIso("2026-01-15", "09:00"), endIso: stoIso("2026-01-15", "17:00"), minutes: 480 },
      { kind: "gps_gap", startIso: stoIso("2026-01-15", "09:00"), endIso: stoIso("2026-01-15", "17:00"), minutes: 480 },
    ]);
    expect(buckets.normalMinutes).toBe(0);
    expect(buckets.overtimeMinutes).toBe(0);
    expect(buckets.travelMinutes).toBe(0);
  });
});
