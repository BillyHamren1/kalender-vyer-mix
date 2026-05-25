// get-staff-gps-week-summary
// ==========================
// Batch summary for the admin GPS week panel. Returns per-(staff,date) summary
// derived from the EXACT same snapshot the detail map renders. Backed by
// staff_gps_day_snapshots cache so repeat opens cost zero pings.
import { corsHeaders } from "../_shared/cors.ts";
import {
  authenticateStaffRequest,
  authorizeStaffAccess,
} from "../_shared/staff-auth.ts";
import {
  getOrBuildDaySnapshot,
  type DaySnapshot,
} from "../_shared/staff-gps/snapshotCache.ts";

interface RequestBody {
  staffId?: string;
  dates?: string[];
}

interface DaySummary {
  date: string;
  pingsCount: number;
  firstIso: string | null;
  lastIso: string | null;
  durationMin: number;
  places: Array<{ name: string; minutes: number }>;
  placeNames: string[];
  visitsCount: number;
}

function bad(status: number, error: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function summarize(date: string, snapshot: DaySnapshot): DaySummary {
  const privateIds = new Set(snapshot.privateGeofenceIds);
  const pings = snapshot.pings;
  const visits = snapshot.visits;

  const privateVisits = visits.filter(v => v.knownSite && privateIds.has(v.knownSite.id));
  const workVisits = visits.filter(v => !(v.knownSite && privateIds.has(v.knownSite.id)));

  const inPrivate = (iso: string) => {
    const t = new Date(iso).getTime();
    return privateVisits.some(v => {
      const s = new Date(v.start).getTime();
      const e = new Date(v.end).getTime();
      return t >= s && t <= e;
    });
  };

  let firstIso: string | null = null;
  let lastIso: string | null = null;
  for (const p of pings) {
    if (!inPrivate(p.recorded_at)) { firstIso = p.recorded_at; break; }
  }
  for (let j = pings.length - 1; j >= 0; j--) {
    if (!inPrivate(pings[j].recorded_at)) { lastIso = pings[j].recorded_at; break; }
  }
  const durationMin = firstIso && lastIso
    ? Math.max(0, Math.round((new Date(lastIso).getTime() - new Date(firstIso).getTime()) / 60_000))
    : 0;

  const placeNames: string[] = [];
  const seen = new Set<string>();
  const minutesByName = new Map<string, number>();
  for (const v of [...workVisits].sort((a, b) => a.start.localeCompare(b.start))) {
    const name = v.knownSite?.name;
    if (!name) continue;
    if (!seen.has(name)) { seen.add(name); placeNames.push(name); }
    const mins = Math.max(
      0,
      Math.round((new Date(v.end).getTime() - new Date(v.start).getTime()) / 60_000),
    );
    minutesByName.set(name, (minutesByName.get(name) ?? 0) + mins);
  }
  const places = Array.from(minutesByName.entries())
    .map(([name, minutes]) => ({ name, minutes }))
    .sort((a, b) => b.minutes - a.minutes);

  return {
    date,
    pingsCount: pings.length,
    firstIso,
    lastIso,
    durationMin,
    places,
    placeNames,
    visitsCount: workVisits.length,
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
        const snapshot = await getOrBuildDaySnapshot(admin, {
          staffId,
          date,
          organizationId: orgId,
        });
        return summarize(date, snapshot);
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
