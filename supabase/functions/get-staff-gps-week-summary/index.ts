// get-staff-gps-week-summary
// ==========================
// Batch-endpoint: ETT anrop returnerar dag-summary för många personal × hela
// veckan. Ersätter N × 7 anrop till get-mobile-staff-day-pings i admin-vyn
// /staff-management/gps-satellite-map (vecko-listan).
//
// READ-ONLY. Endast privilegierade roller (admin/projekt/lager) — vanlig
// mobile-token avvisas.
//
// Request body:
//   { staffIds: string[], fromDate: 'YYYY-MM-DD', toDate: 'YYYY-MM-DD' }
//
// Response:
//   {
//     summaries: {
//       [staffId]: {
//         [dateKey]: { pingsCount, firstIso, lastIso, durationMin, placeNames[] }
//       }
//     },
//     generatedAt: string
//   }
import { corsHeaders } from "../_shared/cors.ts";
import { authenticateStaffRequest } from "../_shared/staff-auth.ts";
import {
  buildExactGeofenceVisits,
  loadOrgGeofences,
  type PingRow,
} from "../_shared/staff-gps/buildVisits.ts";

interface RequestBody {
  staffIds?: unknown;
  fromDate?: unknown;
  toDate?: unknown;
}

interface DayVisit {
  knownSiteId: string | null;
  name: string;
  /** 'location' | 'project' | 'large_project' | 'unknown' */
  type: string;
  inIso: string;
  outIso: string;
  durationMin: number;
}

interface DaySummary {
  pingsCount: number;
  firstIso: string | null;
  lastIso: string | null;
  durationMin: number;
  placeNames: string[];
  visits: DayVisit[];
}

function bad(status: number, error: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad(405, "Method not allowed");

  let body: RequestBody;
  try { body = await req.json(); } catch { return bad(400, "Invalid JSON body"); }

  const staffIds = Array.isArray(body.staffIds)
    ? (body.staffIds as unknown[]).filter((x): x is string => typeof x === "string" && x.length > 0)
    : [];
  const fromDate = typeof body.fromDate === "string" ? body.fromDate.trim() : "";
  const toDate = typeof body.toDate === "string" ? body.toDate.trim() : "";

  if (staffIds.length === 0) return bad(400, "staffIds (non-empty) required");
  if (staffIds.length > 200) return bad(400, "too many staffIds (max 200)");
  if (!DATE_RE.test(fromDate) || !DATE_RE.test(toDate)) {
    return bad(400, "fromDate/toDate must be YYYY-MM-DD");
  }
  if (fromDate > toDate) return bad(400, "fromDate must be <= toDate");

  const authResult = await authenticateStaffRequest(req);
  if (!authResult.ok) return bad(authResult.err.status, authResult.err.error);
  const auth = authResult.auth;
  const admin = auth.admin;
  const orgId = auth.organizationId;

  // Endast privilegierade roller får batch:a andra personers GPS.
  const isPrivileged =
    (auth.mode === "jwt" && auth.isPrivileged) ||
    (auth.mode === "mobile"); // mobile-token kommer från admin-impersonering — extra check nedan

  if (!isPrivileged) return bad(403, "Privileged role required");

  // Verifiera att alla begärda staff tillhör samma org.
  const { data: staffRows, error: staffErr } = await admin
    .from("staff_members")
    .select("id, organization_id")
    .in("id", staffIds)
    .eq("organization_id", orgId);
  if (staffErr) return bad(500, "Staff lookup failed", { details: staffErr.message });
  const validStaffIds = new Set((staffRows ?? []).map((r: any) => String(r.id)));
  if (validStaffIds.size === 0) {
    return new Response(JSON.stringify({ summaries: {}, generatedAt: new Date().toISOString() }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const safeStaffIds = staffIds.filter((id) => validStaffIds.has(id));

  // Tidsspan (UTC). Date-bucketing per ping = recorded_at.slice(0,10).
  const startIso = `${fromDate}T00:00:00.000Z`;
  const endIso = `${toDate}T23:59:59.999Z`;

  // Bygg lista av datum i intervallet (yyyy-mm-dd) för date-bound geofences.
  const allDates: string[] = [];
  {
    const start = new Date(`${fromDate}T00:00:00Z`);
    const end = new Date(`${toDate}T00:00:00Z`);
    for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
      allDates.push(new Date(t).toISOString().slice(0, 10));
    }
  }

  // Geofences: EN gång per request, datumbundna projekt/large_projects per dag.
  const { geofences: unionGeofences, privateIds, geofencesByDate } = await loadOrgGeofences(
    admin, orgId, { dates: allDates },
  );

  // Pings: paginera EN bulk-query för alla staff i tidsspannet.
  const PAGE = 1000;
  const MAX_PAGES = 60; // tak 60k pings/vecka — räcker med god marginal.
  const allPings: Array<PingRow & { staff_id: string }> = [];
  let from = 0;
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await admin
      .from("staff_location_history")
      .select("id, staff_id, recorded_at, lat, lng, accuracy")
      .in("staff_id", safeStaffIds)
      .gte("recorded_at", startIso)
      .lte("recorded_at", endIso)
      .order("recorded_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return bad(500, "pings fetch failed", { details: error.message });
    const rows = (data ?? []) as any[];
    for (const r of rows) {
      allPings.push({
        id: String(r.id),
        staff_id: String(r.staff_id),
        recorded_at: String(r.recorded_at),
        lat: Number(r.lat),
        lng: Number(r.lng),
        accuracy: r.accuracy != null ? Number(r.accuracy) : null,
      });
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }

  // Bucketa per staff + date.
  const buckets = new Map<string, PingRow[]>();
  for (const p of allPings) {
    const dateKey = p.recorded_at.slice(0, 10);
    const key = `${p.staff_id}|${dateKey}`;
    let arr = buckets.get(key);
    if (!arr) { arr = []; buckets.set(key, arr); }
    arr.push(p);
  }

  // Bygg summary per bucket.
  const summaries: Record<string, Record<string, DaySummary>> = {};
  for (const [key, pings] of buckets.entries()) {
    const [staffId, dateKey] = key.split("|");
    const dayFences = geofencesByDate.get(dateKey) ?? unionGeofences;
    const visits = buildExactGeofenceVisits(pings, dayFences);
    const visible = visits.filter((v) => !(v.knownSite && privateIds.has(v.knownSite.id)));
    const sorted = visible.sort((a, b) => a.start.localeCompare(b.start));
    const firstIso = sorted[0]?.start ?? null;
    const lastIso = sorted.length ? sorted[sorted.length - 1].end : null;
    const durationMin = sorted.reduce((acc, v) => acc + Math.max(0, v.durationMin || 0), 0);
    const seen = new Set<string>();
    const placeNames: string[] = [];
    for (const v of sorted) {
      const n = v.knownSite?.name;
      if (n && !seen.has(n)) { seen.add(n); placeNames.push(n); }
    }
    if (!summaries[staffId]) summaries[staffId] = {};
    summaries[staffId][dateKey] = {
      pingsCount: pings.length,
      firstIso,
      lastIso,
      durationMin,
      placeNames,
    };
  }

  return new Response(
    JSON.stringify({ summaries, generatedAt: new Date().toISOString() }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
