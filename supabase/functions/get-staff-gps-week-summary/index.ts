// get-staff-gps-week-summary
// ==========================
// Batch summary för admin GPS week panel. Per (staff, dag) bygger vi en
// PARTITION av [firstPing, lastPing]: varje minut tillhör exakt ETT segment
// (work/private/travel/unknown_place/gps_gap/idle). Garanterar att summan av
// segmenten == windowMin. Användare ska aldrig se "försvunna minuter".
//
// Se mem://constraints/gps-day-partition-v1
import { corsHeaders } from "../_shared/cors.ts";
import {
  authenticateStaffRequest,
  authorizeStaffAccess,
} from "../_shared/staff-auth.ts";
import {
  getOrBuildDaySnapshot,
  type DaySnapshot,
} from "../_shared/staff-gps/snapshotCache.ts";
import {
  buildDayPartition,
  type DaySegment,
} from "../_shared/staff-gps/dayPartition.ts";

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

function summarize(date: string, snapshot: DaySnapshot): DaySummary {
  const partition = buildDayPartition({
    pings: snapshot.pings,
    visits: snapshot.visits.map((v) => ({
      start: v.start,
      end: v.end,
      knownSite: v.knownSite,
    })),
    privateGeofenceIds: snapshot.privateGeofenceIds,
  });

  // LOCKED: start/sluttid är första respektive sista pingen UTANFÖR privata
  // geofences (hem). Privata visits ska aldrig flytta dagens fönster — då
  // räknas hemmavistelser av misstag in som arbetsdag.
  // Se mem://constraints/gps-day-partition-v1 + chat #9967.
  const privateIds = new Set(snapshot.privateGeofenceIds);
  const privatePingIds = new Set<string>();
  for (const v of snapshot.visits) {
    if (v.knownSite && privateIds.has(v.knownSite.id)) {
      for (const p of v.pings) privatePingIds.add(p.id);
    }
  }
  const nonPrivate = snapshot.pings.filter((p) => !privatePingIds.has(p.id));
  const firstIso = nonPrivate.length ? nonPrivate[0].recorded_at : null;
  const lastIso = nonPrivate.length ? nonPrivate[nonPrivate.length - 1].recorded_at : null;
  const windowMin = firstIso && lastIso
    ? Math.max(0, Math.round((new Date(lastIso).getTime() - new Date(firstIso).getTime()) / 60_000))
    : 0;

  const placeNames: string[] = [];
  const seen = new Set<string>();
  for (const s of partition.segments) {
    if (s.type !== "work" || !s.knownSiteId) continue;
    if (!seen.has(s.label)) { seen.add(s.label); placeNames.push(s.label); }
  }

  return {
    date,
    pingsCount: snapshot.pings.length,
    firstIso,
    lastIso,
    durationMin: partition.workMin,
    windowMin,
    workMin: partition.workMin,
    privateMin: partition.privateMin,
    travelMin: partition.travelMin,
    unknownMin: partition.unknownMin,
    gapMin: partition.gapMin,
    idleMin: partition.idleMin,
    places: partition.placeMinutes.map((p) => ({ name: p.name, minutes: p.minutes })),
    placeNames,
    visitsCount: partition.segments.filter((s) => s.type === "work").length,
    segments: partition.segments,
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
