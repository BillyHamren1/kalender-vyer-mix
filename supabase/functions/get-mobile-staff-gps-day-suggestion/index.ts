// get-mobile-staff-gps-day-suggestion
// =====================================
// READ-ONLY. För mobilens Time-flik: härleder ett GPS-baserat tidsförslag per
// dag som speglar admin GPS-vyn (/staff-management/gps-map). Mobilen ska
// ALDRIG göra tunga staff_location_history-queries själv (Mirror-Only-policy).
//
// Input:
//   { staffId, date }  → en dag
//   { staffId, startDate, endDate }  → batch (vecka/månad)
//
// Output per dag:
//   {
//     date, hasGps, suggestedStartIso, suggestedEndIso,
//     suggestedWorkMinutes, suggestedTravelMinutes, suggestedBreakMinutes,
//     perTarget: [{ kind, id, name, minutes }],
//     segmentCount, gapMinutesTotal, reportStatus
//   }
//
// Logik: läser pings + geofences som get-mobile-staff-day-pings, mappar till
// KnownPlace[], kör buildGpsDayTimelineOnly och sammanfattar. Joinas mot
// staff_day_submissions för status.
import { corsHeaders } from "../_shared/cors.ts";
import {
  authenticateStaffRequest,
  authorizeStaffAccess,
} from "../_shared/staff-auth.ts";
import {
  buildGpsDayTimelineOnly,
  type RawPingInput,
} from "../_shared/timeline/buildGpsDayTimelineOnly.ts";
import type { KnownPlace } from "../_shared/timeline/types.ts";

interface RequestBody {
  staffId?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
}

interface DaySuggestion {
  date: string;
  hasGps: boolean;
  suggestedStartIso: string | null;
  suggestedEndIso: string | null;
  suggestedWorkMinutes: number;
  suggestedTravelMinutes: number;
  suggestedBreakMinutes: number;
  perTarget: Array<{
    kind: "booking" | "project" | "location" | "home" | "unknown";
    id: string;
    name: string;
    minutes: number;
  }>;
  segmentCount: number;
  gapMinutesTotal: number;
  reportStatus: "empty" | "draft" | "submitted" | "approved" | "edited" | "ai_flagged" | "needs_user_attention" | "payroll_approved";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function bad(status: number, error: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(`${start}T00:00:00Z`).getTime();
  const e = new Date(`${end}T00:00:00Z`).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || s > e) return out;
  for (let t = s; t <= e; t += 24 * 3600 * 1000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

async function loadKnownTargets(
  admin: ReturnType<typeof Object>,
  orgId: string,
): Promise<KnownPlace[]> {
  const c = admin as any;
  const [locsRes, projRes, largeRes] = await Promise.all([
    c.from("organization_locations")
      .select("id, name, latitude, longitude, radius_meters")
      .eq("organization_id", orgId)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(2000),
    c.from("projects")
      .select("id, name, delivery_latitude, delivery_longitude, address_radius_meters, deleted_at")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .not("delivery_latitude", "is", null)
      .not("delivery_longitude", "is", null)
      .limit(5000),
    c.from("large_projects")
      .select("id, name, address_latitude, address_longitude, address_radius_meters")
      .eq("organization_id", orgId)
      .not("address_latitude", "is", null)
      .not("address_longitude", "is", null)
      .limit(2000),
  ]);

  const out: KnownPlace[] = [];
  for (const r of (locsRes.data ?? []) as any[]) {
    out.push({
      id: String(r.id),
      type: "location",
      name: String(r.name ?? "Plats"),
      lat: Number(r.latitude),
      lng: Number(r.longitude),
      radiusM: Math.max(20, Number(r.radius_meters ?? 75)),
    });
  }
  for (const r of (projRes.data ?? []) as any[]) {
    out.push({
      id: String(r.id),
      type: "project",
      name: String(r.name ?? "Projekt"),
      lat: Number(r.delivery_latitude),
      lng: Number(r.delivery_longitude),
      radiusM: Math.max(20, Number(r.address_radius_meters ?? 75)),
    });
  }
  for (const r of (largeRes.data ?? []) as any[]) {
    out.push({
      id: String(r.id),
      type: "project",
      name: String(r.name ?? "Stort projekt"),
      lat: Number(r.address_latitude),
      lng: Number(r.address_longitude),
      radiusM: Math.max(30, Number(r.address_radius_meters ?? 100)),
    });
  }
  return out;
}

async function fetchPingsForDay(
  admin: any,
  staffId: string,
  date: string,
): Promise<RawPingInput[]> {
  const startIso = `${date}T00:00:00.000Z`;
  const endIso = `${date}T23:59:59.999Z`;
  const PAGE = 1000;
  const all: any[] = [];
  let from = 0;
  for (let i = 0; i < 30; i++) {
    const { data, error } = await admin
      .from("staff_location_history")
      .select("recorded_at, lat, lng, accuracy")
      .eq("staff_id", staffId)
      .gte("recorded_at", startIso)
      .lte("recorded_at", endIso)
      .order("recorded_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`pings fetch failed: ${error.message}`);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return all.map((r) => ({
    recorded_at: String(r.recorded_at),
    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,
    accuracy: r.accuracy != null ? Number(r.accuracy) : null,
  }));
}

function buildSuggestionFromTimeline(
  date: string,
  pings: RawPingInput[],
  knownTargets: KnownPlace[],
  staffId: string,
  orgId: string,
): DaySuggestion {
  if (pings.length === 0) {
    return {
      date,
      hasGps: false,
      suggestedStartIso: null,
      suggestedEndIso: null,
      suggestedWorkMinutes: 0,
      suggestedTravelMinutes: 0,
      suggestedBreakMinutes: 0,
      perTarget: [],
      segmentCount: 0,
      gapMinutesTotal: 0,
      reportStatus: "empty",
    };
  }

  const tl = buildGpsDayTimelineOnly({
    staffId,
    organizationId: orgId,
    date,
    pings,
    knownTargets,
  });

  let workMinutes = 0;
  let travelMinutes = 0;
  const perTargetMap = new Map<
    string,
    { kind: KnownPlace["type"]; id: string; name: string; minutes: number }
  >();

  for (const seg of tl.segments) {
    if (seg.kind === "stay" && seg.type === "known_site") {
      if (seg.matchedSiteType === "home") continue;
      workMinutes += seg.durationMin;
      const key = `${seg.matchedSiteType}:${seg.matchedSiteId}`;
      const existing = perTargetMap.get(key);
      if (existing) {
        existing.minutes += seg.durationMin;
      } else {
        perTargetMap.set(key, {
          kind: seg.matchedSiteType ?? "unknown",
          id: String(seg.matchedSiteId ?? ""),
          name: seg.matchedSiteName ?? "Plats",
          minutes: seg.durationMin,
        });
      }
    } else if (seg.kind === "travel" && seg.type === "transport") {
      travelMinutes += seg.durationMin;
    }
  }

  const firstWorkSeg = tl.segments.find(
    (s) => s.kind === "stay" && s.type === "known_site" && s.matchedSiteType !== "home",
  );
  const lastWorkSeg = [...tl.segments].reverse().find(
    (s) => s.kind === "stay" && s.type === "known_site" && s.matchedSiteType !== "home",
  );

  const suggestedStartIso = firstWorkSeg?.startTs ?? tl.firstPingAt;
  const suggestedEndIso = lastWorkSeg?.endTs ?? tl.lastPingAt;
  const gapMinutesTotal = tl.gaps.reduce((acc, g) => acc + g.gapMinutes, 0);

  return {
    date,
    hasGps: true,
    suggestedStartIso,
    suggestedEndIso,
    suggestedWorkMinutes: Math.round(workMinutes),
    suggestedTravelMinutes: Math.round(travelMinutes),
    suggestedBreakMinutes: 0,
    perTarget: Array.from(perTargetMap.values()).sort((a, b) => b.minutes - a.minutes),
    segmentCount: tl.segments.length,
    gapMinutesTotal,
    reportStatus: "empty",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad(405, "Method not allowed");

  let body: RequestBody;
  try { body = await req.json(); } catch { return bad(400, "Invalid JSON body"); }

  const staffId = (body.staffId ?? "").trim();
  if (!staffId) return bad(400, "staffId is required");

  let dates: string[] = [];
  if (body.date && ISO_DATE.test(body.date)) {
    dates = [body.date];
  } else if (body.startDate && body.endDate && ISO_DATE.test(body.startDate) && ISO_DATE.test(body.endDate)) {
    dates = eachDay(body.startDate, body.endDate);
    if (dates.length === 0) return bad(400, "Invalid date range");
    if (dates.length > 40) return bad(400, "Date range too large (max 40 days)");
  } else {
    return bad(400, "Provide { date } or { startDate, endDate } as YYYY-MM-DD");
  }

  const authResult = await authenticateStaffRequest(req, { requestedStaffId: staffId });
  if (!authResult.ok) return bad(authResult.err.status, authResult.err.error);
  const access = await authorizeStaffAccess(authResult.auth, staffId);
  if (!access.ok) return bad(access.err.status, access.err.error);

  const admin = authResult.auth.admin;
  const orgId = access.orgId;

  let knownTargets: KnownPlace[] = [];
  try {
    knownTargets = await loadKnownTargets(admin, orgId);
  } catch (e) {
    console.error("[gps-day-suggestion] target load failed", e);
    return bad(500, "target load failed");
  }

  const subRes: any = await admin
    .from("staff_day_submissions")
    .select("date, status")
    .eq("organization_id", orgId)
    .eq("staff_id", staffId)
    .gte("date", dates[0])
    .lte("date", dates[dates.length - 1]);
  const statusByDate = new Map<string, DaySuggestion["reportStatus"]>();
  for (const row of (subRes.data ?? []) as any[]) {
    const d = String(row.date);
    const s = String(row.status ?? "");
    if (
      s === "draft" || s === "submitted" || s === "approved" ||
      s === "edited" || s === "ai_flagged" || s === "needs_user_attention" ||
      s === "payroll_approved"
    ) {
      statusByDate.set(d, s as DaySuggestion["reportStatus"]);
    }
  }

  const results: DaySuggestion[] = [];
  for (const date of dates) {
    try {
      const pings = await fetchPingsForDay(admin, staffId, date);
      const suggestion = buildSuggestionFromTimeline(date, pings, knownTargets, staffId, orgId);
      suggestion.reportStatus = statusByDate.get(date) ?? "empty";
      results.push(suggestion);
    } catch (e) {
      console.error(`[gps-day-suggestion] day ${date} failed`, e);
      results.push({
        date,
        hasGps: false,
        suggestedStartIso: null,
        suggestedEndIso: null,
        suggestedWorkMinutes: 0,
        suggestedTravelMinutes: 0,
        suggestedBreakMinutes: 0,
        perTarget: [],
        segmentCount: 0,
        gapMinutesTotal: 0,
        reportStatus: statusByDate.get(date) ?? "empty",
      });
    }
  }

  return new Response(
    JSON.stringify({
      staffId,
      days: results,
      generatedAt: new Date().toISOString(),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});