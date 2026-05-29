// get-staff-time-week-matrix
// ==========================
// Admin-only batch som returnerar EN färdig veckomatris för Tid & Lön.
//
// För varje (staff × dag) gäller:
//   1. Om staff_day_submissions finns → använd submission/snapshot, status från DB.
//   2. Annars om GPS-pings finns i veckan → bygg canonical GPS-resultat (SAMMA
//      builder som GPS-satellitkartan: buildCanonicalStaffDayGpsResult).
//   3. Annars → empty.
//
// Den här funktionen får ALDRIG bygga egen GPS-logik. All canonical projection
// går via _shared/staff-gps/canonicalStaffDayGpsResult.ts. Normal/övertid
// räknas via _shared/staffTimeFlow/workTimeBuckets.ts (mirror av frontend).
//
// Rör INTE: time_reports, workdays, location_time_entries, travel_time_logs,
// day_attestations, staff_day_report_cache (skriv-vägar). Vi LÄSER bara
// staff_members, staff_day_submissions och staff_location_history (för
// presence-detektion). Canonical-byggaren använder sin egen snapshot-cache.

import { corsHeaders } from "../_shared/cors.ts";
import { authenticateStaffRequest } from "../_shared/staff-auth.ts";
import {
  buildCanonicalStaffDayGpsResult,
  type CanonicalStaffDayGpsResult,
  type CanonicalSegment,
} from "../_shared/staff-gps/canonicalStaffDayGpsResult.ts";
import { stockholmDayWindowUtc } from "../_shared/staff-gps/dayWindow.ts";
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

function stockholmLocalDate(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const dd = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${dd}`;
}

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
  // weekStart är en lokal måndag (YYYY-MM-DD). Lägg på 0..6 lokala dagar.
  // Vi använder noon-UTC + offset-stabil iteration via Date.UTC.
  const [y, m, d] = weekStart.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i, 12, 0, 0));
    out.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`);
  }
  return out;
}

// ---- Status mapping (mirror src/lib/staffTimeFlow/weekFlow.ts mapDbStatusToFlow)
type FlowStatus = "gps_proposal" | "submitted_waiting_approval" | "correction_requested" | "approved" | "empty";
function mapDbStatusToFlow(status: string): Exclude<FlowStatus, "empty" | "gps_proposal"> {
  if (status === "approved" || status === "payroll_approved") return "approved";
  if (status === "correction_requested") return "correction_requested";
  return "submitted_waiting_approval";
}

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

function segmentKindToCell(t: CanonicalSegment["type"]): CellRow["kind"] {
  switch (t) {
    case "work": return "work";
    case "travel": return "travel";
    case "private": return "private";
    case "unknown_place": return "unknown_place";
    case "gps_gap": return "gps_gap";
    default: return "other";
  }
}

function rowsFromCanonical(c: CanonicalStaffDayGpsResult): CellRow[] {
  return c.segments
    .filter((s) => s.type !== "idle")
    .map((s) => ({
      kind: segmentKindToCell(s.type),
      label: s.label,
      startIso: s.startIso,
      endIso: s.endIso,
      minutes: s.durationMinutes,
      fromLabel: s.fromLabel ?? null,
      toLabel: s.toLabel ?? null,
    }));
}

function rowsFromSnapshot(snapshot: unknown): CellRow[] {
  if (!Array.isArray(snapshot)) return [];
  return snapshot.map((r) => {
    const raw = r as Record<string, any>;
    const t = String(raw.type ?? raw.kind ?? "work");
    const kind: CellRow["kind"] =
      t === "manual_work" || t === "work" ? "work"
      : t === "travel" ? "travel"
      : t === "private" ? "private"
      : t === "unknown_place" ? "unknown_place"
      : t === "gps_gap" ? "gps_gap"
      : "other";
    return {
      kind,
      label: String(raw.label ?? "Arbete"),
      startIso: (raw.start ?? raw.startedAt ?? null) as string | null,
      endIso: (raw.end ?? raw.endedAt ?? null) as string | null,
      minutes: Number(raw.minutes ?? raw.durationMinutes ?? 0) || 0,
      fromLabel: (raw.fromLabel ?? null) as string | null,
      toLabel: (raw.toLabel ?? null) as string | null,
    };
  });
}

async function processPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
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
    // 1. Staff
    const { data: staffRows, error: staffErr } = await admin
      .from("staff_members")
      .select("id, name")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (staffErr) throw staffErr;
    const staff = (staffRows ?? []) as Array<{ id: string; name: string }>;

    // 2. Submissions för veckan (latest per staff/date)
    const { data: subRows, error: subErr } = await admin
      .from("staff_day_submissions")
      .select("id, staff_id, date, status, requested_start_at, requested_end_at, start_time, end_time, break_minutes, review_comment, source_summary_json, display_timeline_snapshot_json")
      .eq("organization_id", orgId)
      .gte("date", weekStart)
      .lte("date", weekEnd)
      .order("submitted_at", { ascending: false })
      .limit(5000);
    if (subErr) throw subErr;
    type SubRow = {
      id: string; staff_id: string; date: string; status: string;
      requested_start_at: string | null; requested_end_at: string | null;
      start_time: string | null; end_time: string | null;
      break_minutes: number | null; review_comment: string | null;
      source_summary_json: any; display_timeline_snapshot_json: any;
    };
    const submissions = ((subRows ?? []) as unknown) as SubRow[];
    const subByKey = new Map<string, SubRow>();
    for (const s of submissions) {
      const k = `${s.staff_id}|${s.date}`;
      if (!subByKey.has(k)) subByKey.set(k, s);
    }

    // 3. GPS-presence: hämta lättviktigt staff_id+recorded_at för veckans UTC-fönster.
    const winStart = stockholmDayWindowUtc(weekStart).startIso;
    const winEnd = stockholmDayWindowUtc(weekEnd).endIso;
    const { data: pingRows, error: pingErr } = await admin
      .from("staff_location_history")
      .select("staff_id, recorded_at")
      .eq("organization_id", orgId)
      .gte("recorded_at", winStart)
      .lte("recorded_at", winEnd)
      .limit(100000);
    if (pingErr) throw pingErr;
    const pingCount = new Map<string, number>();
    for (const r of ((pingRows ?? []) as Array<{ staff_id: string; recorded_at: string }>)) {
      const localDate = stockholmLocalDate(r.recorded_at);
      const k = `${r.staff_id}|${localDate}`;
      pingCount.set(k, (pingCount.get(k) ?? 0) + 1);
    }


    // 4. Bestäm vilka (staff,date) som behöver canonical-build (ingen submission + pings finns).
    const buildTargets: Array<{ staffId: string; date: string }> = [];
    for (const s of staff) {
      for (const date of dates) {
        const key = `${s.id}|${date}`;
        if (subByKey.has(key)) continue;
        if ((pingCount.get(key) ?? 0) <= 0) continue;
        buildTargets.push({ staffId: s.id, date });
      }
    }

    // 5. Begränsad parallellitet — kör canonical i pool om max 4.
    const canonicalByKey = new Map<string, CanonicalStaffDayGpsResult>();
    await processPool(buildTargets, 4, async (t) => {
      try {
        const c = await buildCanonicalStaffDayGpsResult(admin, {
          organizationId: orgId, staffId: t.staffId, date: t.date,
        });
        canonicalByKey.set(`${t.staffId}|${t.date}`, c);
      } catch (err) {
        console.error("[week-matrix] canonical build failed", { staffId: t.staffId, date: t.date, msg: (err as Error).message });
      }
    });

    // 6. Bygg matrix
    const matrixRows: MatrixRow[] = staff.map((s) => {
      const pendingIds: string[] = [];
      const days: MatrixCell[] = dates.map((date) => {
        const key = `${s.id}|${date}`;
        const sub = subByKey.get(key);
        const pings = pingCount.get(key) ?? 0;

        if (sub) {
          const status = mapDbStatusToFlow(String(sub.status));
          if (status === "submitted_waiting_approval") pendingIds.push(sub.id);
          const snapshotRows = rowsFromSnapshot(sub.display_timeline_snapshot_json);
          const rows = snapshotRows;
          const sum = (sub.source_summary_json ?? {}) as Record<string, any>;
          const startIso = sub.requested_start_at ?? rows[0]?.startIso ?? null;
          const endIso = sub.requested_end_at ?? rows[rows.length - 1]?.endIso ?? null;
          const workMin = rows.filter((r) => r.kind === "work").reduce((a, r) => a + r.minutes, 0);
          const travelMin = rows.filter((r) => r.kind === "travel").reduce((a, r) => a + r.minutes, 0);
          const totalMin = rows.length > 0
            ? rows.reduce((a, r) => a + r.minutes, 0)
            : (startIso && endIso
                ? Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000) - (sub.break_minutes ?? 0))
                : 0);
          // Föredra sparade buckets, annars räkna om från snapshot.
          let normalMinutes = typeof sum.normalMinutes === "number" ? Math.max(0, Math.round(sum.normalMinutes)) : -1;
          let overtimeMinutes = typeof sum.overtimeMinutes === "number" ? Math.max(0, Math.round(sum.overtimeMinutes)) : -1;
          if (normalMinutes < 0 || overtimeMinutes < 0) {
            const b = calculateWorkTimeBuckets(
              rows.map((r) => ({ kind: r.kind, startIso: r.startIso, endIso: r.endIso, minutes: r.minutes })),
              { breakMinutes: sub.break_minutes ?? 0 },
            );
            normalMinutes = b.normalMinutes;
            overtimeMinutes = b.overtimeMinutes;
          }
          return {
            date,
            status,
            source: "submission_snapshot",
            startTime: stockholmHm(startIso) ?? (sub.start_time?.slice(0, 5) ?? null),
            endTime: stockholmHm(endIso) ?? (sub.end_time?.slice(0, 5) ?? null),
            workMinutes: workMin,
            travelMinutes: travelMin,
            totalMinutes: totalMin,
            normalMinutes,
            overtimeMinutes,
            submissionId: sub.id,
            reviewComment: sub.review_comment ?? null,
            pingCount: pings,
            gpsAvailable: pings > 0,
            rows,
          };
        }

        const canonical = canonicalByKey.get(key);
        if (canonical && (canonical.debug.pingsCount > 0)) {
          const rows = rowsFromCanonical(canonical);
          const buckets = calculateWorkTimeBuckets(
            rows.map((r) => ({ kind: r.kind, startIso: r.startIso, endIso: r.endIso, minutes: r.minutes })),
            { breakMinutes: 0 },
          );
          return {
            date,
            status: "gps_proposal",
            source: "gps_proposal",
            startTime: stockholmHm(canonical.firstIso),
            endTime: stockholmHm(canonical.lastIso),
            workMinutes: canonical.totals.workMinutes,
            travelMinutes: canonical.totals.travelMinutes,
            totalMinutes: canonical.totals.workMinutes + canonical.totals.travelMinutes,
            normalMinutes: buckets.normalMinutes,
            overtimeMinutes: buckets.overtimeMinutes,
            submissionId: null,
            reviewComment: null,
            pingCount: canonical.debug.pingsCount,
            gpsAvailable: true,
            rows,
          };
        }

        return {
          date,
          status: "empty",
          source: "empty",
          startTime: null, endTime: null,
          workMinutes: 0, travelMinutes: 0, totalMinutes: 0,
          normalMinutes: 0, overtimeMinutes: 0,
          submissionId: null, reviewComment: null,
          pingCount: pings, gpsAvailable: pings > 0,
          rows: [],
        };
      });
      return { staffId: s.id, staffName: s.name, days, pendingSubmissionIds: pendingIds };
    });

    return new Response(
      JSON.stringify({
        weekStart,
        weekEnd,
        rows: matrixRows,
        generatedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[get-staff-time-week-matrix] failed", err);
    return bad(500, "week matrix failed", { details: (err as Error).message });
  }
});
