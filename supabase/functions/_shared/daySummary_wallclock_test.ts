// Kontrakt: toDaySummary måste exponera workdayStartedAt/EndedAt med samma
// prioritetskedja som StaffDayAttestSection's "Justera dagen"-dialog, annars
// uppstår en ORIMLIG inkonsekvens mellan period-listans "total tid" och
// dialogens "Förslag"-värden.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { toDaySummary } from "./day-snapshot-range.ts";
import type { StaffDaySnapshot } from "./staff-day-status.ts";

function baseSnap(over: Partial<StaffDaySnapshot> = {}): StaffDaySnapshot {
  return {
    staffId: "s1",
    date: "2026-05-17",
    workday: null,
    segments: [],
    timeReports: [],
    travelLogs: [],
    locations: [],
    locationEntries: [],
    flags: [],
    actionsNeeded: [],
    assistantEvents: [],
    activeTimer: null,
    attestation: null,
    rawEvidence: { workdays: [], timeReports: [], travelLogs: [], locationEntries: [], flags: [], assistantEvents: [] },
    debugMeta: {} as any,
    totals: {
      grossWorkdayMinutes: 346, // 5h46m — det "fel" som listan visade
      breakMinutes: 0,
      manualDeductionMinutes: 0,
      payableMinutes: 346,
      projectMinutes: 0,
      warehouseMinutes: 0,
      transportMinutes: 0,
      otherPlaceMinutes: 0,
      gpsGapMinutes: 0,
    } as any,
    ...over,
  } as unknown as StaffDaySnapshot;
}

Deno.test("toDaySummary använder attestation.requestedStart/End när den finns", () => {
  const snap = baseSnap({
    workday: { id: "w1", startedAt: "2026-05-17T08:00:00Z", endedAt: "2026-05-17T13:46:00Z", isOpen: false, approved: false } as any,
    attestation: { status: "attested", requestedStartAt: "2026-05-17T07:56:00Z", requestedEndAt: "2026-05-17T16:37:00Z" } as any,
  });
  const d = toDaySummary(snap);
  assertEquals(d.workdayStartedAt, "2026-05-17T07:56:00Z");
  assertEquals(d.workdayEndedAt, "2026-05-17T16:37:00Z");
});

Deno.test("toDaySummary faller tillbaka till workday.startedAt/endedAt", () => {
  const snap = baseSnap({
    workday: { id: "w1", startedAt: "2026-05-17T08:00:00Z", endedAt: "2026-05-17T16:00:00Z", isOpen: false, approved: false } as any,
  });
  const d = toDaySummary(snap);
  assertEquals(d.workdayStartedAt, "2026-05-17T08:00:00Z");
  assertEquals(d.workdayEndedAt, "2026-05-17T16:00:00Z");
});

Deno.test("toDaySummary returnerar null när varken attestation, workday eller segment finns", () => {
  const snap = baseSnap();
  const d = toDaySummary(snap);
  assertEquals(d.workdayStartedAt, null);
  assertEquals(d.workdayEndedAt, null);
});
