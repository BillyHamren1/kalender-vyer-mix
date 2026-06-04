// resolveStaffDayReport — SINGLE resolver för hela tidrapportsflödet.
// =====================================================================
//
// Detta är ENDA platsen i hela systemet som avgör vilken dag som ska visas
// för en (staff, date). Alla konsumenter — Tid & Lön, Time Approvals,
// mobilen, projektens tidsvisning, framtida löneunderlag — MÅSTE gå via
// denna resolver. Ingen vy får implementera egen fallback-logik.
//
// PRIORITET (orubblig) för STATUS/PROVENANCE:
//   1. staff_day_submissions  → source: 'submission'
//   2. staff_day_report_cache → source: 'cache'
//   3. annars                  → source: 'empty'
//
// Submission vinner ALLTID över cache för status/submissionId/reviewComment.
//
// === GPS-SANNING ===
// Tid/Lön får ALDRIG bygga egen timeline. GPS-baserade rows kommer från
// `buildCanonicalStaffDayGpsResult` (samma som GPS SAT använder). När
// canonical har segments för dagen ersätter vi rows/start/end/work/travel/
// total i den projicerade dagen — men STATUS, submissionId och reviewComment
// kommer fortfarande från submission/cache. När canonical saknar pings/
// segment faller vi tillbaka till submissionens display_timeline_snapshot
// eller cachens display_blocks (för manuella rapporter utan GPS).
//
// FÖRBJUDET:
//   - Resolvern får ALDRIG läsa staff_location_history själv. Den får och
//     ska konsumera `canonicalStaffDayGpsResult` som enda GPS-sanning.
//   - LÄS aldrig time_reports / workdays / location_time_entries /
//     travel_time_logs / day_attestations / active_time_registrations.
//
// Resolvern är ren projektion: DB → normaliserad ResolvedStaffDay.
// Den gör inga skrivningar.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  mapReportBlocksToSegments,
  selectCacheBlockSource,
} from "../mobile/mapReportBlocksToSegments.ts";
import type { CacheRow } from "../mobile/buildMobileSnapshot.ts";
import type { MobileSegment } from "../mobile/types.ts";
import {
  buildCanonicalStaffDayGpsResult,
  type CanonicalStaffDayGpsResult,
} from "../staff-gps/canonicalStaffDayGpsResult.ts";

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE FLAG — Tid/Lön canonical GPS overlay
// ─────────────────────────────────────────────────────────────────────────────
// Tid/Lön får INTE bygga en separat GPS-timeline. För GPS-baserade dagar ska
// rows/minuter komma från canonicalStaffDayGpsResult — exakt samma källa som
// GPS SAT. Submission/cache används endast för STATUS och som FALLBACK när
// canonical saknas / är tom / kraschar.
//
// Sätt denna konstant till `false` för att omedelbart återgå till tidigare
// beteende (rader från submission.display_timeline_snapshot_json eller
// cache.display_blocks_json). Inga DB-skrivningar, ingen migration krävs.
//
// Påverkar ENDAST resolveStaffDayReportSummariesBatch (driver
// get-staff-time-week-matrix → admin Tid/Lön + Time Approvals). Påverkar
// INTE: GPS SAT, mobilappen, submit-flödet, attestflödet, cache-writers
// eller backfill.
const USE_CANONICAL_GPS_ROWS_FOR_TIME_MATRIX = true;

// ---------- Public types ----------

export type ResolvedDaySource = "submission" | "cache" | "empty";

export type ResolvedDayStatus =
  | "submitted_waiting_approval"
  | "correction_requested"
  | "approved"
  | "gps_proposal"
  | "empty";

export interface ResolvedDayRow {
  kind: "work" | "travel" | "private" | "unknown_place" | "gps_gap" | "needs_review" | "other";
  label: string;
  startIso: string | null;
  endIso: string | null;
  minutes: number;
  fromLabel: string | null;
  toLabel: string | null;
}

export interface ResolvedSubmissionRow {
  id: string;
  status: string;
  requested_start_at: string | null;
  requested_end_at: string | null;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number | null;
  comment: string | null;
  review_comment: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  source_summary_json: any;
  display_timeline_snapshot_json: any;
}

export interface ResolvedStaffDay {
  staffId: string;
  date: string;

  /** Var datan kommer ifrån — den enda fallback-logiken i systemet. */
  source: ResolvedDaySource;
  /** Användarvänlig statusklassning (samma vokabulär i app + admin). */
  status: ResolvedDayStatus;

  /** Normaliserade fält — identisk shape oavsett källa. */
  startIso: string | null;
  endIso: string | null;
  workMinutes: number;
  travelMinutes: number;
  breakMinutes: number;
  rows: ResolvedDayRow[];

  /** Mobile-segments byggda via shared mapper (för app + admin Gantt-paritet). */
  mobileSegments: MobileSegment[];

  /** Provenance / refs. */
  submissionId: string | null;
  reviewComment: string | null;
  cacheBuiltAt: string | null;
  engineVersion: string | null;

  /** Rådata kvar för konsumenter som behöver bygga rikare vyer ovanpå. */
  rawSubmission: ResolvedSubmissionRow | null;
  rawCache: CacheRow | null;
}

export interface ResolvedStaffDaySummary {
  staffId: string;
  date: string;
  source: ResolvedDaySource;
  status: ResolvedDayStatus;
  startIso: string | null;
  endIso: string | null;
  workMinutes: number;
  travelMinutes: number;
  breakMinutes: number;
  totalMinutes: number;
  normalMinutes: number;
  overtimeMinutes: number;
  submissionId: string | null;
  reviewComment: string | null;
  cacheBuiltAt: string | null;
  engineVersion: string | null;
  /** Tidslinje-rader (samma kontrakt som ResolvedDayRow). Från cachens
   *  display_blocks_json / report_candidate_blocks_json eller submissionens
   *  display_timeline_snapshot_json. Veckomatrisens detaljvy renderar dessa
   *  direkt — INGEN parallell GPS-bygg ska behövas. */
  rows: ResolvedDayRow[];
}

// ---------- Status mapping ----------

export function mapSubmissionStatus(dbStatus: string): Exclude<ResolvedDayStatus, "empty" | "gps_proposal"> {
  if (dbStatus === "approved" || dbStatus === "payroll_approved") return "approved";
  if (dbStatus === "correction_requested") return "correction_requested";
  return "submitted_waiting_approval";
}

// ---------- Row projections ----------

function rowsFromSubmissionSnapshot(snapshot: unknown): ResolvedDayRow[] {
  if (!Array.isArray(snapshot)) return [];
  return snapshot.map((entry) => {
    const raw = entry as Record<string, any>;
    // allocationType (submission v2 snapshot) räknas också som arbete.
    const t = String(raw.type ?? raw.kind ?? raw.classification ?? raw.allocationType ?? "work");
    const kind: ResolvedDayRow["kind"] =
      t === "manual_work" || t === "work" || t === "project" || t === "booking" ||
      t === "large_project" || t === "warehouse" || t === "location"
        ? "work"
        : t === "travel" ? "travel"
        : t === "private" || t === "break" ? "private"
        : t === "unknown_place" || t === "unknown" ? "unknown_place"
        : t === "gps_gap" ? "gps_gap"
        : t === "needs_review" ? "needs_review"
        : "other";
    // Snapshotens fältnamn varierar mellan versioner: start/startedAt/startAt/startAtIso
    // (samma för end). Plocka första som finns.
    const startIso = (raw.startAtIso ?? raw.startIso ?? raw.start ?? raw.startedAt ?? raw.startAt ?? null) as string | null;
    const endIso = (raw.endAtIso ?? raw.endIso ?? raw.end ?? raw.endedAt ?? raw.endAt ?? null) as string | null;
    let minutes = Math.max(0, Math.round(Number(raw.minutes ?? raw.durationMinutes ?? 0)) || 0);
    if (minutes === 0 && startIso && endIso) {
      const s = Date.parse(startIso);
      const e = Date.parse(endIso);
      if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
        minutes = Math.max(0, Math.round((e - s) / 60_000));
      }
    }
    return {
      kind,
      label: String(raw.label ?? raw.displayLabel ?? raw.title ?? "Arbete"),
      startIso,
      endIso,
      minutes,
      fromLabel: (raw.fromLabel ?? null) as string | null,
      toLabel: (raw.toLabel ?? null) as string | null,
    };
  });
}

function rowsFromMobileSegments(segments: MobileSegment[]): ResolvedDayRow[] {
  return segments.map((s) => {
    const kind: ResolvedDayRow["kind"] =
      s.kind === "project" || s.kind === "booking" || s.kind === "large_project" ||
      s.kind === "warehouse" || s.kind === "location"
        ? "work"
        : s.kind === "travel" ? "travel"
        : s.kind === "break" ? "private"
        : s.kind === "needs_review" ? "needs_review"
        : s.kind === "unknown" ? "unknown_place"
        : "other";
    const minutes = Math.max(0, Math.round(s.durationMinutes || 0));
    return {
      kind,
      label: s.label,
      startIso: s.startedAt ?? null,
      endIso: s.endedAt ?? null,
      minutes,
      fromLabel: null,
      toLabel: null,
    };
  });
}

// ---------- Aggregation helpers ----------

function totalsFromRows(rows: ResolvedDayRow[]) {
  let work = 0;
  let travel = 0;
  for (const r of rows) {
    if (r.kind === "work") work += r.minutes;
    else if (r.kind === "travel") travel += r.minutes;
  }
  return { workMinutes: work, travelMinutes: travel };
}

function totalsFromCacheSummary(summary: any): { workMinutes: number; travelMinutes: number; breakMinutes: number } {
  return {
    workMinutes: Math.max(0, Math.round(Number(summary?.workMinutes ?? 0)) || 0),
    travelMinutes: Math.max(
      0,
      Math.round(Number(summary?.transportMinutes ?? summary?.travelMinutes ?? 0)) || 0,
    ),
    breakMinutes: Math.max(0, Math.round(Number(summary?.breakMinutes ?? 0)) || 0),
  };
}

function firstAndLastIso(rows: ResolvedDayRow[]): { first: string | null; last: string | null } {
  let first: string | null = null;
  let last: string | null = null;
  for (const r of rows) {
    if (r.startIso && (!first || r.startIso < first)) first = r.startIso;
    if (r.endIso && (!last || r.endIso > last)) last = r.endIso;
  }
  return { first, last };
}

// ---------- Concurrency helper ----------

async function runInBatches<T>(
  items: T[],
  batchSize: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const slice = items.slice(i, i + batchSize);
    await Promise.all(slice.map((it) => worker(it).catch((e) => {
      console.warn("[resolveStaffDayReport] batch worker failed", (e as Error).message);
    })));
  }
}

// ---------- Canonical GPS projection ----------
//
// Mappar canonical.segments → ResolvedDayRow[] med EXAKT samma fält som
// GPS SAT använder. idle filtreras bort (renderas inte i Tid/Lön).

export interface CanonicalProjection {
  rows: ResolvedDayRow[];
  startIso: string | null;
  endIso: string | null;
  workMinutes: number;
  travelMinutes: number;
  totalMinutes: number;
}

function canonicalKindToRowKind(t: CanonicalStaffDayGpsResult["segments"][number]["type"]): ResolvedDayRow["kind"] | null {
  switch (t) {
    case "work": return "work";
    case "travel": return "travel";
    case "private": return "private";
    case "unknown_place": return "unknown_place";
    case "gps_gap": return "gps_gap";
    case "idle": return null; // filtreras bort
  }
}

export function projectCanonicalToResolvedSummary(
  canonical: CanonicalStaffDayGpsResult,
): CanonicalProjection {
  const rows: ResolvedDayRow[] = [];
  for (const seg of canonical.segments) {
    const kind = canonicalKindToRowKind(seg.type);
    if (!kind) continue;
    rows.push({
      kind,
      label: seg.label,
      startIso: seg.startIso,
      endIso: seg.endIso,
      minutes: Math.max(0, Math.round(seg.durationMinutes || 0)),
      fromLabel: seg.fromLabel,
      toLabel: seg.toLabel,
    });
  }
  const { first, last } = firstAndLastIso(rows);
  return {
    rows,
    startIso: first,
    endIso: last,
    workMinutes: Math.max(0, Math.round(canonical.totals.workMinutes || 0)),
    travelMinutes: Math.max(0, Math.round(canonical.totals.travelMinutes || 0)),
    totalMinutes: Math.max(0, Math.round(canonical.payrollSuggestion.payableMinutes || 0)),
  };
}

/** Försök bygga canonical för (staff,date). Returnerar null om bygget
 *  kraschar eller om dagen saknar GPS-segment (då används fallback). */
export async function tryBuildCanonicalForDay(
  admin: SupabaseClient,
  organizationId: string,
  staffId: string,
  date: string,
): Promise<CanonicalProjection | null> {
  try {
    const canonical = await buildCanonicalStaffDayGpsResult(admin as any, {
      organizationId, staffId, date,
    });
    if (!canonical.segments || canonical.segments.length === 0) return null;
    const proj = projectCanonicalToResolvedSummary(canonical);
    if (proj.rows.length === 0) return null;
    return proj;
  } catch (e) {
    console.warn("[resolveStaffDayReport] canonical build failed", { staffId, date, err: (e as Error).message });
    return null;
  }
}

/**
 * Overlay canonical GPS-projection över en ResolvedStaffDay.
 * Behåller submission/cache-status/provenance, ersätter rows/start/end/
 * work/travel. requested_start_at/requested_end_at från submission har
 * dock företräde över canonical-windowet.
 */
export function overlayCanonicalOnResolved(
  day: ResolvedStaffDay,
  canonical: CanonicalProjection,
): ResolvedStaffDay {
  const requestedStart = day.rawSubmission?.requested_start_at ?? null;
  const requestedEnd = day.rawSubmission?.requested_end_at ?? null;
  return {
    ...day,
    rows: canonical.rows,
    startIso: requestedStart ?? canonical.startIso,
    endIso: requestedEnd ?? canonical.endIso,
    workMinutes: canonical.workMinutes,
    travelMinutes: canonical.travelMinutes,
  };
}

export function overlayCanonicalOnSummary(
  summary: ResolvedStaffDaySummary,
  canonical: CanonicalProjection,
  requestedStart: string | null,
  requestedEnd: string | null,
): ResolvedStaffDaySummary {
  const totalMinutes = canonical.totalMinutes - Math.max(0, summary.breakMinutes || 0);
  const normalMinutes = Math.max(0, totalMinutes - canonical.travelMinutes);
  return {
    ...summary,
    rows: canonical.rows,
    startIso: requestedStart ?? canonical.startIso,
    endIso: requestedEnd ?? canonical.endIso,
    workMinutes: canonical.workMinutes,
    travelMinutes: canonical.travelMinutes,
    totalMinutes: Math.max(0, totalMinutes),
    normalMinutes,
  };
}

// ---------- Empty constructor ----------

function emptyResolved(staffId: string, date: string): ResolvedStaffDay {
  return {
    staffId, date,
    source: "empty",
    status: "empty",
    startIso: null, endIso: null,
    workMinutes: 0, travelMinutes: 0, breakMinutes: 0,
    rows: [],
    mobileSegments: [],
    submissionId: null, reviewComment: null,
    cacheBuiltAt: null, engineVersion: null,
    rawSubmission: null, rawCache: null,
  };
}

// ---------- Projections ----------

export function projectSubmissionToResolved(args: {
  staffId: string;
  date: string;
  submission: ResolvedSubmissionRow;
}): ResolvedStaffDay {
  const { staffId, date, submission } = args;
  const rows = rowsFromSubmissionSnapshot(submission.display_timeline_snapshot_json);
  const totals = totalsFromRows(rows);
  const { first, last } = firstAndLastIso(rows);
  const startIso = submission.requested_start_at ?? first;
  const endIso = submission.requested_end_at ?? last;
  return {
    staffId, date,
    source: "submission",
    status: mapSubmissionStatus(String(submission.status)),
    startIso,
    endIso,
    workMinutes: totals.workMinutes,
    travelMinutes: totals.travelMinutes,
    breakMinutes: Math.max(0, Number(submission.break_minutes ?? 0) || 0),
    rows,
    // Mobile segments byggs INTE från submission-snapshot här — appen renderar
    // submission via display_timeline_snapshot_json direkt om submission finns.
    // Detta är medvetet: snapshot är "fryst sanning" i submission-format.
    mobileSegments: [],
    submissionId: submission.id,
    reviewComment: submission.review_comment ?? null,
    cacheBuiltAt: null,
    engineVersion: null,
    rawSubmission: submission,
    rawCache: null,
  };
}

export function projectCacheToResolved(args: {
  staffId: string;
  date: string;
  cache: CacheRow;
}): ResolvedStaffDay {
  const { staffId, date, cache } = args;
  const picked = selectCacheBlockSource(cache);
  const segments: MobileSegment[] = picked.source === "none"
    ? []
    : mapReportBlocksToSegments(picked.blocks, { source: picked.source });
  const rows = rowsFromMobileSegments(segments);
  const summaryTotals = totalsFromCacheSummary(cache.summary_json);
  // Föredra summary om cache har den; annars fall tillbaka till rows.
  const fromRows = totalsFromRows(rows);
  const workMinutes = summaryTotals.workMinutes || fromRows.workMinutes;
  const travelMinutes = summaryTotals.travelMinutes || fromRows.travelMinutes;
  const { first, last } = firstAndLastIso(rows);
  return {
    staffId, date,
    source: "cache",
    status: "gps_proposal",
    startIso: first,
    endIso: last,
    workMinutes,
    travelMinutes,
    breakMinutes: summaryTotals.breakMinutes,
    rows,
    mobileSegments: segments,
    submissionId: null,
    reviewComment: null,
    cacheBuiltAt: cache.built_at ?? null,
    engineVersion: cache.engine_version ?? null,
    rawSubmission: null,
    rawCache: cache,
  };
}

function safeNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function buildSummaryFromSubmission(args: {
  staffId: string;
  date: string;
  submission: ResolvedSubmissionRow;
}): ResolvedStaffDaySummary {
  const { staffId, date, submission } = args;
  const summary = (submission.source_summary_json ?? {}) as Record<string, unknown>;
  const requestedStart = submission.requested_start_at ?? null;
  const requestedEnd = submission.requested_end_at ?? null;
  const workMinutes = safeNumber(summary.workMinutes);
  const travelMinutes = safeNumber(summary.transportMinutes ?? summary.travelMinutes);
  const breakMinutes = safeNumber(submission.break_minutes);
  const totalMinutes = Math.max(0, safeNumber(summary.payableMinutes || workMinutes + travelMinutes - breakMinutes));
  const normalMinutes = safeNumber(summary.normalMinutes);
  const overtimeMinutes = safeNumber(summary.overtimeMinutes);
  const rows = rowsFromSubmissionSnapshot(submission.display_timeline_snapshot_json);

  return {
    staffId,
    date,
    source: "submission",
    status: mapSubmissionStatus(String(submission.status)),
    startIso: requestedStart,
    endIso: requestedEnd,
    workMinutes,
    travelMinutes,
    breakMinutes,
    totalMinutes,
    normalMinutes,
    overtimeMinutes,
    submissionId: submission.id,
    reviewComment: submission.review_comment ?? null,
    cacheBuiltAt: null,
    engineVersion: null,
    rows,
  };
}

function buildSummaryFromCache(args: {
  staffId: string;
  date: string;
  cache: CacheRow;
}): ResolvedStaffDaySummary {
  const { staffId, date, cache } = args;
  const summary = (cache.summary_json ?? {}) as Record<string, unknown>;
  const workMinutes = safeNumber(summary.workOnlyMinutes ?? summary.workMinutes);
  const travelMinutes = safeNumber(summary.transportMinutes ?? summary.travelMinutes);
  const breakMinutes = safeNumber(summary.breakMinutes);
  const totalMinutes = Math.max(0, safeNumber(summary.payableMinutes ?? summary.totalMinutes ?? workMinutes + travelMinutes - breakMinutes));
  const normalMinutes = Math.max(0, totalMinutes - travelMinutes);

  // Bygg rader genom samma single-pipeline-mapper som mobil + admin Gantt.
  const picked = selectCacheBlockSource(cache);
  const segments: MobileSegment[] = picked.source === "none"
    ? []
    : mapReportBlocksToSegments(picked.blocks, { source: picked.source });
  const rows = rowsFromMobileSegments(segments);

  return {
    staffId,
    date,
    source: "cache",
    status: "gps_proposal",
    startIso: typeof summary.firstIso === "string" ? summary.firstIso : null,
    endIso: typeof summary.lastIso === "string" ? summary.lastIso : null,
    workMinutes,
    travelMinutes,
    breakMinutes,
    totalMinutes,
    normalMinutes,
    overtimeMinutes: 0,
    submissionId: null,
    reviewComment: null,
    cacheBuiltAt: cache.built_at ?? null,
    engineVersion: cache.engine_version ?? null,
    rows,
  };
}

// ---------- DB readers ----------

const SUBMISSION_SELECT =
  "id, staff_id, date, status, requested_start_at, requested_end_at, start_time, end_time, break_minutes, comment, review_comment, submitted_at, reviewed_at, source_summary_json, display_timeline_snapshot_json";

// Diagnostics_json är medvetet EXKLUDERAD — den är en tung JSON-blob som
// projektionen inte läser. Att inkludera den blåser upp svaren och triggar
// WORKER_RESOURCE_LIMIT vid batch-hämtning över hela org × vecka.
const CACHE_SELECT =
  "staff_id, date, engine_version, summary_json, report_candidate_blocks_json, display_blocks_json, workday_allocation_segments_json, built_at, stale, error";

interface SubmissionDbRow extends ResolvedSubmissionRow {
  staff_id: string;
  date: string;
}

interface CacheDbRow extends CacheRow {
  staff_id: string;
  date: string;
}

/**
 * Single-day resolver. Använd för mobilens dagsanrop och för admin-detalj.
 * Kör 2 lätta queries och projicerar via shared mapper.
 *
 * VIKTIGT: läser ENDAST staff_day_submissions och staff_day_report_cache.
 */
export async function resolveStaffDayReport(args: {
  admin: SupabaseClient;
  organizationId: string;
  staffId: string;
  date: string;
}): Promise<ResolvedStaffDay> {
  const { admin, organizationId, staffId, date } = args;

  // 1) Submission först — vinner alltid.
  const { data: subRow, error: subErr } = await admin
    .from("staff_day_submissions")
    .select(SUBMISSION_SELECT)
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .eq("date", date)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (subErr) throw subErr;
  if (subRow) {
    const base = projectSubmissionToResolved({
      staffId, date, submission: subRow as unknown as ResolvedSubmissionRow,
    });
    const canonical = await tryBuildCanonicalForDay(admin, organizationId, staffId, date);
    return canonical ? overlayCanonicalOnResolved(base, canonical) : base;
  }

  // 2) Cache.
  const { data: cacheRow, error: cacheErr } = await admin
    .from("staff_day_report_cache")
    .select(CACHE_SELECT)
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .eq("date", date)
    .order("built_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cacheErr) throw cacheErr;
  if (cacheRow) {
    const base = projectCacheToResolved({
      staffId, date, cache: cacheRow as unknown as CacheRow,
    });
    const canonical = await tryBuildCanonicalForDay(admin, organizationId, staffId, date);
    return canonical ? overlayCanonicalOnResolved(base, canonical) : base;
  }

  // 3) Empty.
  return emptyResolved(staffId, date);
}

/**
 * Batch-resolver för Tid & Lön / Time Approvals veckomatris.
 *
 * Hämtar submissions OCH cache för hela veckan i 2 batch-queries och
 * returnerar en Map keyed på `${staffId}|${date}`.
 *
 * VIKTIGT: läser ENDAST staff_day_submissions och staff_day_report_cache.
 * Ingen `staff_location_history`, ingen live GPS-build.
 */
export async function resolveStaffDayReportsBatch(args: {
  admin: SupabaseClient;
  organizationId: string;
  staffIds: string[];
  dates: string[];
}): Promise<Map<string, ResolvedStaffDay>> {
  const { admin, organizationId, staffIds, dates } = args;
  const out = new Map<string, ResolvedStaffDay>();
  if (staffIds.length === 0 || dates.length === 0) return out;

  const sorted = [...dates].sort();
  const from = sorted[0];
  const to = sorted[sorted.length - 1];

  // Submissions för hela fönstret.
  const { data: subRows, error: subErr } = await admin
    .from("staff_day_submissions")
    .select(SUBMISSION_SELECT)
    .eq("organization_id", organizationId)
    .in("staff_id", staffIds)
    .gte("date", from)
    .lte("date", to)
    .order("submitted_at", { ascending: false })
    .limit(10000);
  if (subErr) throw subErr;
  const subByKey = new Map<string, SubmissionDbRow>();
  for (const r of (subRows ?? []) as SubmissionDbRow[]) {
    const k = `${r.staff_id}|${r.date}`;
    if (!subByKey.has(k)) subByKey.set(k, r); // first wins (sorted desc)
  }

  // Cache för hela fönstret — endast för de (staff,date) som SAKNAR submission.
  // Vi hämtar alla cache-rader i en query och filtrerar i minne (snabbare än
  // 7 × N individuella queries). Diagnostics_json utesluts för storlek.
  const { data: cacheRows, error: cacheErr } = await admin
    .from("staff_day_report_cache")
    .select(CACHE_SELECT)
    .eq("organization_id", organizationId)
    .in("staff_id", staffIds)
    .gte("date", from)
    .lte("date", to)
    .order("built_at", { ascending: false })
    .limit(10000);
  if (cacheErr) throw cacheErr;
  const cacheByKey = new Map<string, CacheDbRow>();
  for (const r of (cacheRows ?? []) as CacheDbRow[]) {
    const k = `${r.staff_id}|${r.date}`;
    if (!cacheByKey.has(k)) cacheByKey.set(k, r); // first wins (latest built_at)
  }

  // Bygg base + samla GPS-keys.
  const needsCanonical: Array<{ key: string; staffId: string; date: string }> = [];
  for (const staffId of staffIds) {
    for (const date of dates) {
      const key = `${staffId}|${date}`;
      const sub = subByKey.get(key);
      if (sub) {
        out.set(key, projectSubmissionToResolved({
          staffId, date, submission: sub as unknown as ResolvedSubmissionRow,
        }));
        needsCanonical.push({ key, staffId, date });
        continue;
      }
      const cache = cacheByKey.get(key);
      if (cache) {
        out.set(key, projectCacheToResolved({
          staffId, date, cache: cache as unknown as CacheRow,
        }));
        needsCanonical.push({ key, staffId, date });
        continue;
      }
      out.set(key, emptyResolved(staffId, date));
    }
  }

  // Overlay canonical GPS-sanning för varje (staff,date) med submission/cache.
  // Parallellt i batches om 8 — buildCanonicalStaffDayGpsResult har egen
  // snapshot-cache så hot-keys är billiga.
  await runInBatches(needsCanonical, 8, async ({ key, staffId, date }) => {
    const canonical = await tryBuildCanonicalForDay(admin, organizationId, staffId, date);
    if (!canonical) return;
    const base = out.get(key);
    if (!base) return;
    out.set(key, overlayCanonicalOnResolved(base, canonical));
  });

  return out;
}

export async function resolveStaffDayReportSummariesBatch(args: {
  admin: SupabaseClient;
  organizationId: string;
  staffIds: string[];
  dates: string[];
}): Promise<Map<string, ResolvedStaffDaySummary>> {
  const { admin, organizationId, staffIds, dates } = args;
  const out = new Map<string, ResolvedStaffDaySummary>();
  if (staffIds.length === 0 || dates.length === 0) return out;

  const sorted = [...dates].sort();
  const from = sorted[0];
  const to = sorted[sorted.length - 1];

  const { data: subRows, error: subErr } = await admin
    .from("staff_day_submissions")
    .select(SUBMISSION_SELECT)
    .eq("organization_id", organizationId)
    .in("staff_id", staffIds)
    .gte("date", from)
    .lte("date", to)
    .order("submitted_at", { ascending: false })
    .limit(10000);
  if (subErr) throw subErr;

  const subByKey = new Map<string, SubmissionDbRow>();
  for (const r of (subRows ?? []) as SubmissionDbRow[]) {
    const k = `${r.staff_id}|${r.date}`;
    if (!subByKey.has(k)) subByKey.set(k, r);
  }

  // Inkludera blocks-fälten så vi kan bygga rows[] via samma single-pipeline
  // som mobil/admin-Gantt. Detta är fortfarande mycket lättare än hela
  // diagnostics_json som medvetet är exkluderad här.
  const cacheSelectLean = "staff_id, date, engine_version, summary_json, display_blocks_json, report_candidate_blocks_json, workday_allocation_segments_json, built_at, stale, error";
  const { data: cacheRows, error: cacheErr } = await admin
    .from("staff_day_report_cache")
    .select(cacheSelectLean)
    .eq("organization_id", organizationId)
    .in("staff_id", staffIds)
    .gte("date", from)
    .lte("date", to)
    .order("built_at", { ascending: false })
    .limit(10000);
  if (cacheErr) throw cacheErr;

  const cacheByKey = new Map<string, CacheDbRow>();
  for (const r of (cacheRows ?? []) as CacheDbRow[]) {
    const k = `${r.staff_id}|${r.date}`;
    if (!cacheByKey.has(k)) cacheByKey.set(k, r);
  }

  const needsCanonical: Array<{ key: string; staffId: string; date: string; requestedStart: string | null; requestedEnd: string | null }> = [];
  for (const staffId of staffIds) {
    for (const date of dates) {
      const key = `${staffId}|${date}`;
      const submission = subByKey.get(key);
      if (submission) {
        out.set(key, buildSummaryFromSubmission({
          staffId,
          date,
          submission: submission as unknown as ResolvedSubmissionRow,
        }));
        needsCanonical.push({
          key, staffId, date,
          requestedStart: submission.requested_start_at ?? null,
          requestedEnd: submission.requested_end_at ?? null,
        });
        continue;
      }

      const cache = cacheByKey.get(key);
      if (cache) {
        out.set(key, buildSummaryFromCache({
          staffId,
          date,
          cache: cache as unknown as CacheRow,
        }));
        needsCanonical.push({ key, staffId, date, requestedStart: null, requestedEnd: null });
        continue;
      }

      out.set(key, {
        staffId,
        date,
        source: "empty",
        status: "empty",
        startIso: null,
        endIso: null,
        workMinutes: 0,
        travelMinutes: 0,
        breakMinutes: 0,
        totalMinutes: 0,
        normalMinutes: 0,
        overtimeMinutes: 0,
        submissionId: null,
        reviewComment: null,
        cacheBuiltAt: null,
        engineVersion: null,
        rows: [],
      });
    }
  }

  // Overlay canonical GPS-sanning (samma som GPS SAT).
  await runInBatches(needsCanonical, 8, async ({ key, staffId, date, requestedStart, requestedEnd }) => {
    const canonical = await tryBuildCanonicalForDay(admin, organizationId, staffId, date);
    if (!canonical) return;
    const base = out.get(key);
    if (!base) return;
    out.set(key, overlayCanonicalOnSummary(base, canonical, requestedStart, requestedEnd));
  });

  return out;
}
