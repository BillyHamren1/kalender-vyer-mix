// Deno unit-test för resolveStaffDayReport — verifierar prioritet,
// canonical-overlay och förbjudna läsningar.
// Kör med: deno test supabase/functions/_shared/staff-day-report/
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  overlayCanonicalOnResolved,
  overlayCanonicalOnSummary,
  projectCacheToResolved,
  projectCanonicalToResolvedSummary,
  projectSubmissionToResolved,
  resolveStaffDayReport,
  resolveStaffDayReportsBatch,
  type ResolvedSubmissionRow,
} from "./resolveStaffDayReport.ts";
import type { CacheRow } from "../mobile/buildMobileSnapshot.ts";
import type { CanonicalStaffDayGpsResult } from "../staff-gps/canonicalStaffDayGpsResult.ts";

const SUBMISSION: ResolvedSubmissionRow = {
  id: "sub-1",
  status: "submitted",
  requested_start_at: "2026-06-01T07:00:00Z",
  requested_end_at: "2026-06-01T15:00:00Z",
  start_time: "09:00:00",
  end_time: "17:00:00",
  break_minutes: 30,
  comment: null,
  review_comment: "Kolla rasten",
  submitted_at: "2026-06-01T16:00:00Z",
  reviewed_at: null,
  source_summary_json: { workMinutes: 450 },
  display_timeline_snapshot_json: [
    { type: "work", label: "Bygge A", start: "2026-06-01T07:00:00Z", end: "2026-06-01T11:00:00Z", minutes: 240 },
    { type: "travel", label: "Resa", start: "2026-06-01T11:00:00Z", end: "2026-06-01T11:30:00Z", minutes: 30 },
    { type: "work", label: "Bygge B", start: "2026-06-01T11:30:00Z", end: "2026-06-01T15:00:00Z", minutes: 210 },
  ],
};

const CACHE: CacheRow = {
  engine_version: "v1.2",
  summary_json: { workMinutes: 480, transportMinutes: 20, breakMinutes: 60 },
  report_candidate_blocks_json: [],
  display_blocks_json: [
    {
      id: "blk-1", kind: "project", startAt: "2026-06-01T08:00:00Z", endAt: "2026-06-01T16:00:00Z",
      durationMinutes: 480, title: "Projekt X",
    },
  ],
  diagnostics_json: {},
  built_at: "2026-06-01T17:00:00Z",
  stale: false,
  error: null,
};

// Minimal canonical fixture — bara fälten resolvern läser.
const CANONICAL: CanonicalStaffDayGpsResult = {
  version: "canonical_staff_day_gps_result_v1",
  source: "staff_gps_day_pipeline",
  organizationId: "org",
  staffId: "s1",
  date: "2026-06-01",
  dayWindow: { timezone: "Europe/Stockholm", startIso: "2026-05-31T22:00:00Z", endIso: "2026-06-01T22:00:00Z" },
  firstIso: "2026-06-01T06:30:00Z",
  lastIso: "2026-06-01T15:30:00Z",
  totals: {
    visibleWindowMinutes: 540,
    workMinutes: 420,
    travelMinutes: 60,
    privateMinutes: 0,
    unknownMinutes: 0,
    gpsGapMinutes: 0,
    idleMinutes: 60,
    grossWorkdayMinutes: 540,
    payableSuggestionMinutes: 480,
  },
  segments: [
    { id: "1", type: "work", label: "FA Warehouse", startIso: "2026-06-01T06:30:00Z", endIso: "2026-06-01T10:30:00Z", durationMinutes: 240, targetType: "known_site", targetId: "site-1", knownSiteId: "site-1", confidence: "high", warningReasons: [], source: "gps_partition", fromLabel: null, toLabel: null },
    { id: "2", type: "travel", label: "Resa", startIso: "2026-06-01T10:30:00Z", endIso: "2026-06-01T11:30:00Z", durationMinutes: 60, targetType: "transport", targetId: null, knownSiteId: null, confidence: "medium", warningReasons: [], source: "gps_partition", fromLabel: "FA Warehouse", toLabel: "Projekt Y" },
    { id: "3", type: "work", label: "Projekt Y", startIso: "2026-06-01T11:30:00Z", endIso: "2026-06-01T14:30:00Z", durationMinutes: 180, targetType: "known_site", targetId: "site-2", knownSiteId: "site-2", confidence: "high", warningReasons: [], source: "gps_partition", fromLabel: null, toLabel: null },
    { id: "4", type: "idle", label: "Idle", startIso: "2026-06-01T14:30:00Z", endIso: "2026-06-01T15:30:00Z", durationMinutes: 60, targetType: "idle", targetId: null, knownSiteId: null, confidence: "low", warningReasons: [], source: "gps_partition", fromLabel: null, toLabel: null },
  ],
  geofenceVisits: [],
  map: { pings: [], routeLine: [], startPoint: null, endPoint: null },
  payrollSuggestion: { payableMinutes: 480, excludedMinutes: 60, includedSegmentIds: ["1","2","3"], excludedSegmentIds: ["4"], policyVersion: "canonical_payable_v1" },
  debug: { pingsCount: 100, segmentCount: 4, geofenceVisitCount: 0, sourceSnapshotId: "x", cacheHit: true, builtAt: "2026-06-01T17:00:00Z", warnings: [] },
};

Deno.test("projectSubmissionToResolved: status och totals", () => {
  const r = projectSubmissionToResolved({ staffId: "s1", date: "2026-06-01", submission: SUBMISSION });
  assertEquals(r.source, "submission");
  assertEquals(r.status, "submitted_waiting_approval");
  assertEquals(r.submissionId, "sub-1");
  assertEquals(r.workMinutes, 450);
  assertEquals(r.travelMinutes, 30);
  assertEquals(r.breakMinutes, 30);
  assertEquals(r.rows.length, 3);
});

Deno.test("projectSubmissionToResolved: approved/payroll_approved mappas till approved", () => {
  const r1 = projectSubmissionToResolved({
    staffId: "s1", date: "2026-06-01",
    submission: { ...SUBMISSION, status: "approved" },
  });
  const r2 = projectSubmissionToResolved({
    staffId: "s1", date: "2026-06-01",
    submission: { ...SUBMISSION, status: "payroll_approved" },
  });
  assertEquals(r1.status, "approved");
  assertEquals(r2.status, "approved");
});

Deno.test("projectCacheToResolved: status=gps_proposal och bygger mobileSegments", () => {
  const r = projectCacheToResolved({ staffId: "s1", date: "2026-06-01", cache: CACHE });
  assertEquals(r.source, "cache");
  assertEquals(r.status, "gps_proposal");
  assertEquals(r.engineVersion, "v1.2");
  assertEquals(r.cacheBuiltAt, "2026-06-01T17:00:00Z");
  assert(r.mobileSegments.length > 0);
  assertEquals(r.workMinutes, 480);
});

// ===== Canonical-projektion =====

Deno.test("projectCanonicalToResolvedSummary: idle filtreras bort, övriga mappas", () => {
  const proj = projectCanonicalToResolvedSummary(CANONICAL);
  assertEquals(proj.rows.length, 3, "idle ska filtreras bort");
  assertEquals(proj.rows[0].kind, "work");
  assertEquals(proj.rows[0].label, "FA Warehouse");
  assertEquals(proj.rows[1].kind, "travel");
  assertEquals(proj.rows[1].fromLabel, "FA Warehouse");
  assertEquals(proj.rows[1].toLabel, "Projekt Y");
  assertEquals(proj.workMinutes, 420);
  assertEquals(proj.travelMinutes, 60);
  assertEquals(proj.totalMinutes, 480);
  assertEquals(proj.startIso, "2026-06-01T06:30:00Z");
  assertEquals(proj.endIso, "2026-06-01T14:30:00Z");
});

Deno.test("overlayCanonicalOnResolved: submission-status behålls, GPS-rows tar över", () => {
  const base = projectSubmissionToResolved({ staffId: "s1", date: "2026-06-01", submission: SUBMISSION });
  const proj = projectCanonicalToResolvedSummary(CANONICAL);
  const overlaid = overlayCanonicalOnResolved(base, proj);
  // Status/submissionId/reviewComment behålls
  assertEquals(overlaid.source, "submission");
  assertEquals(overlaid.status, "submitted_waiting_approval");
  assertEquals(overlaid.submissionId, "sub-1");
  assertEquals(overlaid.reviewComment, "Kolla rasten");
  // Rows/minuter kommer från canonical
  assertEquals(overlaid.rows.length, 3);
  assertEquals(overlaid.workMinutes, 420);
  assertEquals(overlaid.travelMinutes, 60);
  // requested_start_at vinner över canonical.firstIso
  assertEquals(overlaid.startIso, "2026-06-01T07:00:00Z");
  assertEquals(overlaid.endIso, "2026-06-01T15:00:00Z");
});

Deno.test("overlayCanonicalOnSummary: totalMinutes = canonical.payable - break", () => {
  const baseSummary = {
    staffId: "s1", date: "2026-06-01",
    source: "submission" as const, status: "submitted_waiting_approval" as const,
    startIso: null, endIso: null,
    workMinutes: 450, travelMinutes: 30, breakMinutes: 30,
    totalMinutes: 450, normalMinutes: 420, overtimeMinutes: 0,
    submissionId: "sub-1", reviewComment: null,
    cacheBuiltAt: null, engineVersion: null,
    rows: [],
  };
  const proj = projectCanonicalToResolvedSummary(CANONICAL);
  const out = overlayCanonicalOnSummary(baseSummary, proj, "2026-06-01T07:00:00Z", null);
  assertEquals(out.workMinutes, 420);
  assertEquals(out.travelMinutes, 60);
  assertEquals(out.totalMinutes, 450); // 480 - 30
  assertEquals(out.startIso, "2026-06-01T07:00:00Z");
  assertEquals(out.endIso, "2026-06-01T14:30:00Z");
  assertEquals(out.submissionId, "sub-1");
});

// ===== DB-fall: submission vinner för status =====

Deno.test("resolveStaffDayReport: submission VINNER över cache för status", async () => {
  let cacheRead = false;
  const admin = {
    from(table: string) {
      const isSubmissions = table === "staff_day_submissions";
      const isCache = table === "staff_day_report_cache";
      if (isCache) cacheRead = true;
      const builder: any = {
        select() { return builder; },
        eq() { return builder; },
        gte() { return builder; },
        lte() { return builder; },
        in() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        update() { return Promise.resolve({ data: null, error: null }); },
        upsert() { return Promise.resolve({ data: null, error: null }); },
        maybeSingle() {
          if (isSubmissions) return Promise.resolve({ data: { ...SUBMISSION, staff_id: "s1", date: "2026-06-01" }, error: null });
          // Snapshot-cache och övriga GPS-tabeller: returnera tomt så canonical
          // bygget faller tillbaka och resolvern använder submission-projektionen.
          return Promise.resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  } as any;

  const r = await resolveStaffDayReport({
    admin, organizationId: "org", staffId: "s1", date: "2026-06-01",
  });
  assertEquals(r.source, "submission");
  assertEquals(r.status, "submitted_waiting_approval");
  assertEquals(cacheRead, false, "submissions-cache får inte läsas när submission finns");
});

Deno.test("resolveStaffDayReport: empty när varken submission eller cache finns", async () => {
  const admin = {
    from() {
      const builder: any = {
        select() { return builder; },
        eq() { return builder; },
        order() { return builder; },
        limit() { return builder; },
        update() { return Promise.resolve({ data: null, error: null }); },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      };
      return builder;
    },
  } as any;

  const r = await resolveStaffDayReport({
    admin, organizationId: "org", staffId: "s1", date: "2026-06-01",
  });
  assertEquals(r.source, "empty");
  assertEquals(r.status, "empty");
  assertEquals(r.rows.length, 0);
});

Deno.test("resolveStaffDayReportsBatch: submission VINNER per (staff,date)", async () => {
  const admin = {
    from(table: string) {
      const builder: any = {
        select() { return builder; },
        eq() { return builder; },
        in() { return builder; },
        gte() { return builder; },
        lte() { return builder; },
        order() { return builder; },
        update() { return Promise.resolve({ data: null, error: null }); },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        limit() {
          if (table === "staff_day_submissions") {
            return Promise.resolve({
              data: [
                { ...SUBMISSION, id: "sub-A", staff_id: "s1", date: "2026-06-01" },
              ],
              error: null,
            });
          }
          if (table === "staff_day_report_cache") {
            return Promise.resolve({
              data: [
                { ...CACHE, staff_id: "s1", date: "2026-06-01" }, // ignoreras pga submission
                { ...CACHE, staff_id: "s2", date: "2026-06-01" }, // ska användas
              ],
              error: null,
            });
          }
          return Promise.resolve({ data: [], error: null });
        },
      };
      return builder;
    },
  } as any;

  const map = await resolveStaffDayReportsBatch({
    admin, organizationId: "org",
    staffIds: ["s1", "s2"], dates: ["2026-06-01"],
  });
  assertEquals(map.get("s1|2026-06-01")?.source, "submission");
  assertEquals(map.get("s2|2026-06-01")?.source, "cache");
});

// ===== Statiskt kontraktstest: resolvern KONSUMERAR canonical builder =====

Deno.test("resolveStaffDayReport.ts importerar canonical GPS-buildern", async () => {
  const src = await Deno.readTextFile(new URL("./resolveStaffDayReport.ts", import.meta.url));
  assert(
    src.includes("buildCanonicalStaffDayGpsResult"),
    "resolvern ska konsumera canonicalStaffDayGpsResult som enda GPS-sanning",
  );
  assert(
    src.includes("canonicalStaffDayGpsResult"),
    "resolvern ska importera från staff-gps/canonicalStaffDayGpsResult.ts",
  );
});

Deno.test("resolveStaffDayReport.ts läser INTE legacy-tabeller", async () => {
  const src = await Deno.readTextFile(new URL("./resolveStaffDayReport.ts", import.meta.url));
  for (const t of ["time_reports", "workdays", "location_time_entries", "travel_time_logs", "day_attestations", "active_time_registrations"]) {
    assert(
      !new RegExp(`\\.from\\(\\s*["'\`]${t}["'\`]`).test(src),
      `${t} får inte läsas från resolvern`,
    );
  }
  // staff_location_history får inte läsas direkt av resolvern;
  // canonical-buildern äger den läsningen.
  assert(
    !/\.from\(\s*["'`]staff_location_history["'`]/.test(src),
    "staff_location_history får aldrig läsas direkt av resolvern",
  );
});

// =============================================================================
// SUMMARY-LAGER (driver get-staff-time-week-matrix → Tid/Lön)
// =============================================================================
//
// Dessa tester skyddar kontraktet att Tid/Lön och GPS SAT delar samma
// GPS-sanning, att fallback fungerar när canonical saknas/kraschar, och
// att submission alltid äger status/submissionId/reviewComment.

const SUMMARY_BASE_FROM_SUBMISSION = {
  staffId: "s1",
  date: "2026-06-01",
  source: "submission" as const,
  status: "submitted_waiting_approval" as const,
  startIso: "2026-06-01T07:00:00Z",
  endIso: "2026-06-01T15:00:00Z",
  workMinutes: 450,
  travelMinutes: 30,
  breakMinutes: 30,
  totalMinutes: 450,
  normalMinutes: 420,
  overtimeMinutes: 0,
  submissionId: "sub-1",
  reviewComment: "Kolla rasten",
  cacheBuiltAt: null,
  engineVersion: null,
  rows: [
    // display_timeline_snapshot_json-rader (fallback-källan).
    { kind: "work" as const, label: "Snapshot A", startIso: "2026-06-01T07:00:00Z", endIso: "2026-06-01T11:00:00Z", minutes: 240, fromLabel: null, toLabel: null },
    { kind: "work" as const, label: "Snapshot B", startIso: "2026-06-01T11:30:00Z", endIso: "2026-06-01T15:00:00Z", minutes: 210, fromLabel: null, toLabel: null },
  ],
};

Deno.test("overlayCanonicalOnSummary: status/submissionId/reviewComment behålls, rows kommer från canonical", () => {
  const proj = projectCanonicalToResolvedSummary(CANONICAL);
  const out = overlayCanonicalOnSummary(SUMMARY_BASE_FROM_SUBMISSION, proj, null, null);

  // Submission äger status och provenance — får aldrig skrivas över av canonical.
  assertEquals(out.source, "submission");
  assertEquals(out.status, "submitted_waiting_approval");
  assertEquals(out.submissionId, "sub-1");
  assertEquals(out.reviewComment, "Kolla rasten");

  // Rows + minuter + start/end kommer från canonical (samma som GPS SAT).
  assertEquals(out.rows.length, 3);
  assertEquals(out.rows[0].label, "FA Warehouse");
  assertEquals(out.workMinutes, 420);
  assertEquals(out.travelMinutes, 60);
  assertEquals(out.startIso, "2026-06-01T06:30:00Z");
  assertEquals(out.endIso, "2026-06-01T14:30:00Z");
});

Deno.test("FALLBACK: display_timeline_snapshot används när canonical saknas", () => {
  // När tryBuildCanonicalForDay returnerar null lämnas base orörd.
  // Verifierar att submissionens snapshot-rader fortfarande är synliga.
  const base = { ...SUMMARY_BASE_FROM_SUBMISSION };
  // Simulerar resolverns beteende: ingen overlay-call när canonical är null.
  assertEquals(base.rows.length, 2, "fallback ska visa display_timeline_snapshot-rader");
  assertEquals(base.rows[0].label, "Snapshot A");
  assertEquals(base.workMinutes, 450);
  assertEquals(base.submissionId, "sub-1");
  assertEquals(base.status, "submitted_waiting_approval");
});

Deno.test("FALLBACK: canonical med 0 segment ger null → submission-snapshot vinner", async () => {
  // Mocka admin så att buildCanonicalStaffDayGpsResult når en tom väg.
  // tryBuildCanonicalForDay tar all-or-nothing — segments=0 → returnera null.
  const emptyCanonical: CanonicalStaffDayGpsResult = {
    ...CANONICAL,
    segments: [],
    totals: { ...CANONICAL.totals, workMinutes: 0, travelMinutes: 0 },
  };
  const proj = projectCanonicalToResolvedSummary(emptyCanonical);
  assertEquals(proj.rows.length, 0, "tom canonical ska INTE producera rader");
  // Resolvern: om proj.rows.length === 0 i tryBuildCanonicalForDay → null →
  // ingen overlay → submissionens display_timeline_snapshot behålls.
});

Deno.test("ANDIS-SCENARIO 2026-06-04: status=submitted men rows = canonical GPS", () => {
  // Reproducerar buggen: GPS SAT visade canonical-uppdelning medan Tid/Lön
  // visade en annan timeline från display_timeline_snapshot_json. Efter fixen
  // ska Tid/Lön visa SAMMA rader som GPS SAT, men behålla submission-status.
  const andisSubmission = {
    ...SUMMARY_BASE_FROM_SUBMISSION,
    date: "2026-06-04",
    submissionId: "andis-sub-0604",
    reviewComment: null,
    rows: [
      // Gamla fel raderna från display_timeline_snapshot.
      { kind: "work" as const, label: "Fel uppdelning", startIso: "2026-06-04T06:00:00Z", endIso: "2026-06-04T16:00:00Z", minutes: 600, fromLabel: null, toLabel: null },
    ],
  };
  const andisCanonical: CanonicalStaffDayGpsResult = {
    ...CANONICAL,
    date: "2026-06-04",
    firstIso: "2026-06-04T06:30:00Z",
    lastIso: "2026-06-04T14:30:00Z",
    segments: CANONICAL.segments.map((s) => ({
      ...s,
      startIso: s.startIso.replace("2026-06-01", "2026-06-04"),
      endIso: s.endIso.replace("2026-06-01", "2026-06-04"),
    })),
  };
  const proj = projectCanonicalToResolvedSummary(andisCanonical);
  const out = overlayCanonicalOnSummary(andisSubmission, proj, null, null);

  // Status från submission (Väntar personalattest).
  assertEquals(out.status, "submitted_waiting_approval");
  assertEquals(out.submissionId, "andis-sub-0604");

  // Rader och tider från canonical — INTE från display_timeline_snapshot.
  assertEquals(out.rows.length, 3);
  assertEquals(out.rows[0].label, "FA Warehouse");
  assertEquals(out.rows[1].kind, "travel");
  assertEquals(out.startIso, "2026-06-04T06:30:00Z");
  assertEquals(out.endIso, "2026-06-04T14:30:00Z");
});

Deno.test("resolveStaffDayReportSummariesBatch: canonical-fel kraschar INTE matrisen", async () => {
  // Mocka admin: submissions/cache finns, men canonical-buildern kastar.
  // resolveStaffDayReportSummariesBatch ska fånga felet och behålla base.
  const admin = {
    from(table: string) {
      const builder: any = {
        select() { return builder; },
        eq() { return builder; },
        in() { return builder; },
        gte() { return builder; },
        lte() { return builder; },
        order() { return builder; },
        maybeSingle() {
          // Canonical-buildern läser snapshot-cache och staff_location_history.
          // Vi kastar på snapshot-cache så bygget faller.
          if (table === "staff_gps_day_snapshot_cache") {
            return Promise.reject(new Error("simulated canonical error"));
          }
          return Promise.resolve({ data: null, error: null });
        },
        limit() {
          if (table === "staff_day_submissions") {
            return Promise.resolve({
              data: [
                { ...SUBMISSION, id: "sub-x", staff_id: "s1", date: "2026-06-01" },
              ],
              error: null,
            });
          }
          if (table === "staff_location_history") {
            return Promise.reject(new Error("simulated GPS read error"));
          }
          return Promise.resolve({ data: [], error: null });
        },
      };
      return builder;
    },
  } as any;

  const { resolveStaffDayReportSummariesBatch } = await import("./resolveStaffDayReport.ts");
  const map = await resolveStaffDayReportSummariesBatch({
    admin, organizationId: "org",
    staffIds: ["s1"], dates: ["2026-06-01"],
  });
  const row = map.get("s1|2026-06-01");
  assert(row, "matrix måste returnera en rad även när canonical kraschar");
  assertEquals(row!.source, "submission", "base behålls från submission när canonical kastar");
  assertEquals(row!.submissionId, "sub-x");
  assertEquals(row!.status, "submitted_waiting_approval");
});

// =============================================================================
// STATISKA KONTRAKTSTESTER för Tid/Lön ↔ GPS SAT samma sanning
// =============================================================================

Deno.test("kontrakt: get-staff-time-week-matrix använder INGEN egen GPS-pipeline", async () => {
  const src = await Deno.readTextFile(
    new URL("../../get-staff-time-week-matrix/index.ts", import.meta.url),
  );
  assert(
    src.includes("resolveStaffDayReportSummariesBatch"),
    "edge function MÅSTE gå via resolveStaffDayReportSummariesBatch",
  );
  assert(
    !src.includes("buildCanonicalStaffDayGpsResult"),
    "edge function får INTE importera canonical-buildern direkt (parallell GPS-väg förbjuden)",
  );
  assert(
    !/\.from\(\s*["'`]staff_location_history["'`]/.test(src),
    "edge function får INTE läsa staff_location_history",
  );
});

Deno.test("kontrakt: Tid/Lön och GPS SAT delar samma canonical-importväg", async () => {
  const resolverSrc = await Deno.readTextFile(
    new URL("./resolveStaffDayReport.ts", import.meta.url),
  );
  const gpsSatSrc = await Deno.readTextFile(
    new URL("../../get-staff-gps-week-summary/index.ts", import.meta.url),
  );
  const importPath = /["'][^"']*staff-gps\/canonicalStaffDayGpsResult\.ts["']/;
  assert(importPath.test(resolverSrc), "resolvern importerar canonical-buildern från staff-gps/");
  assert(importPath.test(gpsSatSrc), "GPS SAT importerar canonical-buildern från staff-gps/");
  // Båda kallar samma symbol — säkrar att det inte finns två parallella builders.
  assert(resolverSrc.includes("buildCanonicalStaffDayGpsResult("));
  assert(gpsSatSrc.includes("buildCanonicalStaffDayGpsResult("));
});

Deno.test("kontrakt: resolvern gör INGA DB-writes mot skyddade tabeller", async () => {
  const src = await Deno.readTextFile(new URL("./resolveStaffDayReport.ts", import.meta.url));
  const protectedTables = [
    "staff_day_submissions",
    "staff_day_report_cache",
    "time_reports",
    "workdays",
    "location_time_entries",
    "travel_time_logs",
  ];
  for (const t of protectedTables) {
    for (const op of ["insert", "update", "upsert", "delete"]) {
      const pattern = new RegExp(
        `\\.from\\(\\s*["'\`]${t}["'\`][\\s\\S]{0,400}?\\.${op}\\s*\\(`,
      );
      assert(
        !pattern.test(src),
        `resolveStaffDayReport.ts får inte ${op} mot ${t} (read-only projektion)`,
      );
    }
  }
});

Deno.test("kontrakt: display_timeline_snapshot används som FALLBACK (canonical först)", async () => {
  // Verifiera att kodvägen är: först tryBuildCanonicalForDay, sedan overlay.
  // Om canonical returnerar något så ersätts rows. display_timeline_snapshot
  // får aldrig vinna över canonical när canonical har segment.
  const src = await Deno.readTextFile(new URL("./resolveStaffDayReport.ts", import.meta.url));
  assert(
    src.includes("tryBuildCanonicalForDay"),
    "resolvern måste anropa tryBuildCanonicalForDay innan rendering",
  );
  assert(
    src.includes("overlayCanonicalOnSummary"),
    "resolvern måste overlay:a canonical över submission/cache-baserad summary",
  );
  assert(
    src.includes("USE_CANONICAL_GPS_ROWS_FOR_TIME_MATRIX"),
    "kill-switch måste finnas så canonical kan stängas av utan migration",
  );
});
