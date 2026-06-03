// Regression: flap mellan två nära kända platser (ex. FA Warehouse ↔
// Boende - Venngarn när någon sitter i en kantzon) får INTE producera
// 19 mikro-block. Korta stays (<2 min) som ligger mellan två andra stays
// absorberas av föregående stay.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildDayPartition } from "./dayPartition.ts";

function ping(ts: string, lat = 59.6, lng = 17.85) {
  return { id: ts, recorded_at: ts, lat, lng, accuracy: 5 };
}

Deno.test("flap mellan två kända platser kollapsar till en serie stora block", () => {
  const t = (m: number, s: number = 0) => {
    const d = new Date("2026-06-02T13:58:50.000Z");
    d.setUTCMinutes(d.getUTCMinutes() + m, s);
    return d.toISOString();
  };

  // 112 min på FA Warehouse, sen 8 min av flapping mellan FA + Boende,
  // sen 3 min Boende. Pings tillräckligt täta för att inte trigga gps_gap.
  const pings = [];
  for (let m = 0; m <= 120; m++) pings.push(ping(t(m)));

  const visits = [
    {
      start: t(0),
      end: t(112),
      knownSite: { id: "fa", name: "FA Warehouse" },
    },
    // mikro-flaps (varje <1s, mellan dem hoppar GPS över till "boende")
    { start: t(112, 1), end: t(112, 2), knownSite: { id: "venn", name: "Boende - Venngarn" } },
    { start: t(112, 3), end: t(112, 4), knownSite: { id: "fa", name: "FA Warehouse" } },
    { start: t(112, 5), end: t(114), knownSite: { id: "venn", name: "Boende - Venngarn" } },
    { start: t(114, 1), end: t(114, 2), knownSite: { id: "fa", name: "FA Warehouse" } },
    { start: t(114, 3), end: t(117), knownSite: { id: "venn", name: "Boende - Venngarn" } },
    { start: t(117, 1), end: t(117, 2), knownSite: { id: "fa", name: "FA Warehouse" } },
    { start: t(117, 3), end: t(120), knownSite: { id: "venn", name: "Boende - Venngarn" } },
  ];

  const result = buildDayPartition({
    pings,
    visits,
    privateGeofenceIds: ["venn"],
  });

  // Mikro-stays (<2 min) som ligger mellan andra stays ska ha absorberats —
  // resultatet ska vara starkt komprimerat, INTE 19 rader.
  if (result.segments.length > 6) {
    throw new Error(
      `Flap-absorbering misslyckades: ${result.segments.length} segment, förväntade ≤ 6`,
    );
  }

  // Inga 0-min stays kvar
  for (const s of result.segments) {
    if ((s.type === "work" || s.type === "private") && s.minutes === 0) {
      throw new Error(`0-min stay kvar efter absorb: ${JSON.stringify(s)}`);
    }
  }

  // FA Warehouse ska dominera arbete (112 min ≈)
  const work = result.segments
    .filter((s) => s.type === "work" && s.knownSiteId === "fa")
    .reduce((a, s) => a + s.minutes, 0);
  if (work < 110) throw new Error(`FA work för litet: ${work} min`);

  assertEquals(result.windowMin > 110, true);
});
