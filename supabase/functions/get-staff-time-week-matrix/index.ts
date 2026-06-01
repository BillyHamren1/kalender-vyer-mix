// get-staff-time-week-matrix
// ==========================
// Veckomatris för Tid & Lön, Time Approvals OCH mobilappens veckovy.
//
// Dual-auth:
//   - Privilegierad JWT (admin/projekt/lager) → matris för HELA org (alla
//     personer × veckans dagar).
//   - Mobile token → matris för EN person (auth.staffId). Kallaren kan
//     bara läsa sig själv.
//
// SINGLE-PIPELINE-REGEL:
//   Denna endpoint bygger ALDRIG egen dag från raw GPS. All källval för
//   (staff × dag) går genom den gemensamma `resolveStaffDayReportsBatch`
//   i _shared/staff-day-report/resolveStaffDayReport.ts.
//
//   Prioritet (orubblig, ägs av resolvern):
//     1. staff_day_submissions  → source: 'submission'
//     2. staff_day_report_cache → source: 'cache'
//     3. annars                  → source: 'empty'
//
//   Mobilens veckovy, Tid & Lön och Attest läser ALLA via samma resolver
//   — exakt samma sanning per (staff, date).
//
// FÖRBJUDET I DENNA FIL (vaktat av contract-test):
//   - import av `buildCanonicalStaffDayGpsResult`
//   - läsning av `staff_location_history`
//   - läsning av time_reports / workdays / location_time_entries /
//     travel_time_logs / day_attestations


import { corsHeaders } from "../_shared/cors.ts";
import { authenticateStaffRequest } from "../_shared/staff-auth.ts";
import {
  resolveStaffDayReportsBatch,
  type ResolvedDayRow,
  type ResolvedStaffDay,
} from "../_shared/staff-day-report/resolveStaffDayReport.ts";
import { calculateWorkTimeBuckets } from "../_shared/staffTimeFlow/workTimeBuckets.ts";

interface RequestBody {
  weekStart?: string;
  dates?: string[];
}

function bad(status: number, error: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const TZ = "Europe/Stockholm";

function stockholmHm(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ, hour12: false, hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date(iso));
    const h = parts.find((p) => p.type === "hour")?.value ?? "00";
    const m = parts.find((p) => p.type === "minute")?.value ?? "00";
    return `${h}:${m}`;
  } catch { return null; }
}

function weekDates(weekStart: string): string[] {
  const [y, m, d] = weekStart.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i, 12, 0, 0));
    out.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`);
  }
  return out;
}

// ── Utvy-typ (oförändrad shape mot frontend) ─────────────────────────────
type FlowStatus =
  | "gps_proposal"
  | "submitted_waiting_approval"
  | "correction_requested"
  | "approved"
  | "empty";

interface CellRow {
  kind: "work" | "travel" | "private" | "unknown_place" | "gps_gap" | "other";
  label: string;
  startIso: string | null;
  endIso: string | null;
  minutes: number;
  fromLabel: string | null;
  toLabel: string | null;
}

interface MatrixCell {
  date: string;
  status: FlowStatus;
  source: "gps_proposal" | "submission_snapshot" | "empty";
  startTime: string | null;
  endTime: string | null;
  workMinutes: number;
  travelMinutes: number;
  totalMinutes: number;
  normalMinutes: number;
  overtimeMinutes: number;
  submissionId: string | null;
  reviewComment: string | null;
  pingCount: number;
  gpsAvailable: boolean;
  rows: CellRow[];
}

interface MatrixRow {
  staffId: string;
  staffName: string;
  days: MatrixCell[];
  pendingSubmissionIds: string[];
}

function mapKind(k: ResolvedDayRow["kind"]): CellRow["kind"] {
  if (k === "work") return "work";
  if (k === "travel") return "travel";
  if (k === "private") return "private";
  if (k === "unknown_place" || k === "needs_review") return "unknown_place";
  if (k === "gps_gap") return "gps_gap";
  return "other";
}

function cellFromResolved(r: ResolvedStaffDay): MatrixCell {
  const rows: CellRow[] = r.rows.map((rr) => ({
    kind: mapKind(rr.kind),
    label: rr.label,
    startIso: rr.startIso,
    endIso: rr.endIso,
    minutes: rr.minutes,
    fromLabel: rr.fromLabel,
    toLabel: rr.toLabel,
  }));

  // Buckets för normal/övertid: föredra cache.summary om finns på source=submission
  // (sub.source_summary_json.normalMinutes), annars räkna från rows.
  let normalMinutes = 0;
  let overtimeMinutes = 0;
  if (r.source === "submission") {
    const sum = (r.rawSubmission?.source_summary_json ?? {}) as Record<string, any>;
    const n = typeof sum.normalMinutes === "number" ? Math.max(0, Math.round(sum.normalMinutes)) : -1;
    const o = typeof sum.overtimeMinutes === "number" ? Math.max(0, Math.round(sum.overtimeMinutes)) : -1;
    if (n >= 0 && o >= 0) {
      normalMinutes = n;
      overtimeMinutes = o;
    }
  }
  if (normalMinutes === 0 && overtimeMinutes === 0 && rows.length > 0) {
    const b = calculateWorkTimeBuckets(
      rows.map((rr) => ({ kind: rr.kind, startIso: rr.startIso, endIso: rr.endIso, minutes: rr.minutes })),
      { breakMinutes: r.breakMinutes ?? 0 },
    );
    normalMinutes = b.normalMinutes;
    overtimeMinutes = b.overtimeMinutes;
  }

  const totalMinutes = rows.length > 0
    ? rows.reduce((a, rr) => a + rr.minutes, 0)
    : (r.startIso && r.endIso
        ? Math.max(0, Math.round((Date.parse(r.endIso) - Date.parse(r.startIso)) / 60_000) - (r.breakMinutes ?? 0))
        : 0);

  // status-mapping till frontend-vokabulär (resolvern använder samma ord).
  let status: FlowStatus;
  let source: MatrixCell["source"];
  if (r.source === "submission") {
    status = r.status === "approved" ? "approved"
      : r.status === "correction_requested" ? "correction_requested"
      : "submitted_waiting_approval";
    source = "submission_snapshot";
  } else if (r.source === "cache") {
    status = "gps_proposal";
    source = "gps_proposal";
  } else {
    status = "empty";
    source = "empty";
  }

  return {
    date: r.date,
    status,
    source,
    startTime: stockholmHm(r.startIso ?? r.rawSubmission?.start_time ?? null),
    endTime: stockholmHm(r.endIso ?? r.rawSubmission?.end_time ?? null),
    workMinutes: r.workMinutes,
    travelMinutes: r.travelMinutes,
    totalMinutes,
    normalMinutes,
    overtimeMinutes,
    submissionId: r.submissionId,
    reviewComment: r.reviewComment,
    // pingCount/gpsAvailable är legacy-fält i UI:t. Vi rör inte raw GPS
    // härifrån — sätt 0/false. Time Engine kan i framtiden exponera detta
    // via cache.summary_json om vi behöver visa "GPS finns" i Tid&Lön.
    pingCount: 0,
    gpsAvailable: r.source === "cache" || r.source === "submission",
    rows,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad(405, "Method not allowed");

  let body: RequestBody;
  try { body = await req.json(); } catch { return bad(400, "Invalid JSON body"); }

  // Resolve dates
  let dates: string[];
  if (Array.isArray(body.dates) && body.dates.length > 0) {
    dates = body.dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  } else if (body.weekStart && /^\d{4}-\d{2}-\d{2}$/.test(body.weekStart)) {
    dates = weekDates(body.weekStart);
  } else {
    return bad(400, "Provide weekStart or dates[]");
  }
  if (dates.length === 0) return bad(400, "dates is empty");
  if (dates.length > 14) return bad(400, "max 14 dates per request");
  dates.sort();
  const weekStart = dates[0];
  const weekEnd = dates[dates.length - 1];

  // Admin auth: kräv privilegierad JWT.
  const authResult = await authenticateStaffRequest(req);
  if (!authResult.ok) return bad(authResult.err.status, authResult.err.error);
  const auth = authResult.auth;
  if (auth.mode !== "jwt" || !auth.isPrivileged) {
    return bad(403, "Admin role required");
  }
  const admin = auth.admin;
  const orgId = auth.organizationId;

  try {
    // 1) Personal i org.
    const { data: staffRows, error: staffErr } = await admin
      .from("staff_members")
      .select("id, name")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (staffErr) throw staffErr;
    const staff = (staffRows ?? []) as Array<{ id: string; name: string }>;

    // 2) En enda resolver — batch över hela veckan.
    const resolved = await resolveStaffDayReportsBatch({
      admin,
      organizationId: orgId,
      staffIds: staff.map((s) => s.id),
      dates,
    });

    // 3) Projicera till matrix-shape.
    const matrixRows: MatrixRow[] = staff.map((s) => {
      const pendingIds: string[] = [];
      const days: MatrixCell[] = dates.map((date) => {
        const r = resolved.get(`${s.id}|${date}`);
        if (!r) {
          return {
            date,
            status: "empty",
            source: "empty",
            startTime: null, endTime: null,
            workMinutes: 0, travelMinutes: 0, totalMinutes: 0,
            normalMinutes: 0, overtimeMinutes: 0,
            submissionId: null, reviewComment: null,
            pingCount: 0, gpsAvailable: false,
            rows: [],
          };
        }
        const cell = cellFromResolved(r);
        if (cell.status === "submitted_waiting_approval" && cell.submissionId) {
          pendingIds.push(cell.submissionId);
        }
        return cell;
      });
      return { staffId: s.id, staffName: s.name, days, pendingSubmissionIds: pendingIds };
    });

    return new Response(
      JSON.stringify({
        weekStart,
        weekEnd,
        rows: matrixRows,
        generatedAt: new Date().toISOString(),
        pipeline: "resolveStaffDayReport@v1",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[get-staff-time-week-matrix] failed", err);
    return bad(500, "week matrix failed", { details: (err as Error).message });
  }
});
