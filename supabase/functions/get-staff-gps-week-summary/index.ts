// get-staff-gps-week-summary
// ==========================
// Batch summary för admin GPS week panel. Per (staff, dag) bygger vi en
// PARTITION av [firstPing, lastPing]: varje minut tillhör exakt ETT segment
// (work/private/travel/unknown_place/gps_gap/idle). Garanterar att summan av
// segmenten == windowMin. Användare ska aldrig se "försvunna minuter".
//
// Se mem://constraints/gps-day-partition-v1
//
// Etapp 2 (canonical pipeline): per-dag-byggandet delegerar nu till
// buildCanonicalStaffDayGpsResult så att admin-veckovyn och GPS-satellitkartan
// får BYTE-FÖR-BYTE samma siffror som mobil/admin/lön via en enda källa.
import { corsHeaders } from "../_shared/cors.ts";
import {
  authenticateStaffRequest,
  authorizeStaffAccess,
} from "../_shared/staff-auth.ts";
import {
  buildCanonicalStaffDayGpsResult,
  type CanonicalStaffDayGpsResult,
} from "../_shared/staff-gps/canonicalStaffDayGpsResult.ts";
import type { DaySegment } from "../_shared/staff-gps/dayPartition.ts";

interface RequestBody {
  staffId?: string;
  dates?: string[];
}

interface DaySummary {
  date: string;
  pingsCount: number;
  firstIso: string | null;
  lastIso: string | null;
  /** Bakåtkompatibelt = workMin (tid på kända arbetsplatser). */
  durationMin: number;
  windowMin: number;
  workMin: number;
  privateMin: number;
  travelMin: number;
  unknownMin: number;
  gapMin: number;
  idleMin: number;
  places: Array<{ name: string; minutes: number }>;
  placeNames: string[];
  visitsCount: number;
  segments: DaySegment[];
}

function bad(status: number, error: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Projicerar canonical result → bakåtkompatibel DaySummary för admin-veckovyn. */
function projectToDaySummary(canonical: CanonicalStaffDayGpsResult): DaySummary {
  const placeMap = new Map<string, { name: string; minutes: number }>();
  const placeNames: string[] = [];
  for (const seg of canonical.segments) {
    if (seg.type === "work" && seg.knownSiteId) {
      const cur = placeMap.get(seg.knownSiteId);
      if (cur) cur.minutes += seg.durationMinutes;
      else {
        placeMap.set(seg.knownSiteId, { name: seg.label, minutes: seg.durationMinutes });
        placeNames.push(seg.label);
      }
    }
  }
  const places = Array.from(placeMap.values()).sort((a, b) => b.minutes - a.minutes);
  const segments: DaySegment[] = canonical.segments.map((s) => ({
    type: s.type,
    label: s.label,
    start: s.startIso,
    end: s.endIso,
    minutes: s.durationMinutes,
    knownSiteId: s.knownSiteId,
    fromLabel: s.fromLabel ?? null,
    toLabel: s.toLabel ?? null,
  }));
  return {
    date: canonical.date,
    pingsCount: canonical.debug.pingsCount,
    firstIso: canonical.firstIso,
    lastIso: canonical.lastIso,
    durationMin: canonical.totals.workMinutes,
    windowMin: canonical.totals.visibleWindowMinutes,
    workMin: canonical.totals.workMinutes,
    privateMin: canonical.totals.privateMinutes,
    travelMin: canonical.totals.travelMinutes,
    unknownMin: canonical.totals.unknownMinutes,
    gapMin: canonical.totals.gpsGapMinutes,
    idleMin: canonical.totals.idleMinutes,
    places,
    placeNames,
    visitsCount: canonical.geofenceVisits.length,
    segments,
  };
}




Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad(405, "Method not allowed");

  let body: RequestBody;
  try { body = await req.json(); } catch { return bad(400, "Invalid JSON body"); }

  const staffId = (body.staffId ?? "").trim();
  const dates = Array.isArray(body.dates) ? body.dates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
  if (!staffId) return bad(400, "staffId is required");
  if (dates.length === 0) return bad(400, "dates must be a non-empty array of YYYY-MM-DD");
  if (dates.length > 14) return bad(400, "max 14 dates per request");

  const authResult = await authenticateStaffRequest(req, { requestedStaffId: staffId });
  if (!authResult.ok) return bad(authResult.err.status, authResult.err.error);
  const access = await authorizeStaffAccess(authResult.auth, staffId);
  if (!access.ok) return bad(access.err.status, access.err.error);
  const orgId = access.orgId;
  const admin = authResult.auth.admin;

  try {
    const results = await Promise.all(
      dates.map(async (date) => {
        const canonical = await buildCanonicalStaffDayGpsResult(admin, {
          organizationId: orgId,
          staffId,
          date,
        });
        return projectToDaySummary(canonical);
      }),
    );

    return new Response(
      JSON.stringify({
        staffId,
        days: results,
        generatedAt: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return bad(500, "week summary failed", { details: (err as Error).message });
  }
});
