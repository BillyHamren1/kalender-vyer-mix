// day-timeline-engine
// Actions:
//   compute            { staff_id, date, force? }
//   get                { staff_id, date }
//   resolve_suggestion { suggestion_id, action, payload? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";
import { ENGINE_VERSION } from "../_shared/timeline/types.ts";
import type {
  KnownPlace,
  LocationEntryRow,
  Ping,
  TimeReportRow,
  WorkdayRow,
} from "../_shared/timeline/types.ts";
import { buildPlaceVisits, buildTravelGaps, visitsToSegments } from "../_shared/timeline/pingSegments.ts";
import { buildEvents } from "../_shared/timeline/eventBuilder.ts";
import { buildSuggestions } from "../_shared/timeline/suggestionEngine.ts";
import { computeInputSignature } from "../_shared/timeline/signature.ts";
import { ACTIONS, type ResolveAction } from "../_shared/timeline/resolveActions.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ComputeArgs { staff_id: string; date: string; force?: boolean }
interface GetArgs { staff_id: string; date: string }
interface ResolveArgs {
  suggestion_id: string;
  // The actual sub-action (accept/ignore/...). We use `resolve_action` so it
  // does not collide with the top-level `action: "resolve_suggestion"` router.
  // `action` kept as legacy fallback for older callers.
  resolve_action?: ResolveAction;
  action?: ResolveAction | "resolve_suggestion";
  payload?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "compute";
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // Caller auth (admin or self) — with service/cron bypass
    const cronSecret = Deno.env.get("CRON_SECRET");
    const providedSecret = req.headers.get("x-engine-secret");
    const isCron = !!cronSecret && providedSecret === cronSecret;
    let userId = "";
    if (!isCron) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await supabase.auth.getUser(token);
      if (!userData?.user) return json({ error: "unauthorized" }, 401);
      userId = userData.user.id;
    }

    if (action === "compute") return await handleCompute(supabase, userId, body as ComputeArgs);
    if (action === "get")     return await handleGet(supabase, userId, body as GetArgs);
    if (action === "resolve_suggestion")
      return await handleResolve(supabase, userId, body as ResolveArgs);

    return json({ error: "unknown_action", action }, 400);
  } catch (err) {
    console.error("[day-timeline-engine] error", err);
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});

function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getCallerOrg(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase.from("profiles").select("organization_id").eq("user_id", userId).maybeSingle();
  return data?.organization_id as string | undefined;
}

async function isAdmin(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  return roles.includes("admin") || roles.includes("projekt") || roles.includes("lager");
}

// ─── COMPUTE ──────────────────────────────────────────────────────────────
async function handleCompute(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  args: ComputeArgs,
) {
  if (!args.staff_id || !args.date) return json({ error: "staff_id and date required" }, 400);
  let orgId: string | undefined;
  if (userId) {
    orgId = await getCallerOrg(supabase, userId);
    if (!orgId) return json({ error: "no_org" }, 403);
    const admin = await isAdmin(supabase, userId);
    if (!admin) {
      const { data: me } = await supabase.from("staff_members").select("id").eq("user_id", userId).maybeSingle();
      if (!me || me.id !== args.staff_id) return json({ error: "forbidden" }, 403);
    }
  } else {
    // Cron/service path — derive org from staff_members
    const { data: sm } = await supabase.from("staff_members").select("organization_id").eq("id", args.staff_id).maybeSingle();
    orgId = sm?.organization_id as string | undefined;
    if (!orgId) return json({ error: "no_org_for_staff" }, 403);
  }

  // Load all sources in parallel
  const dayStart = `${args.date}T00:00:00+00:00`;
  const dayEnd = `${args.date}T23:59:59+00:00`;
  // Use a wider window for pings (Stockholm tz boundary)
  const windowStart = new Date(`${args.date}T00:00:00+01:00`).toISOString();
  const windowEnd   = new Date(`${args.date}T23:59:59+02:00`).toISOString();

  // Paginate pings — Supabase default cap is 1000 rows. A staff member with
  // dense GPS can easily have 2000+ pings/dygn, which would silently truncate
  // the timeline at ~midday. Loop in 1000-row pages until exhausted.
  const fetchAllPings = async () => {
    const all: any[] = [];
    const PAGE = 1000;
    let from = 0;
    // Hard ceiling to avoid runaway loops (≈ one ping every 8 s for 24 h ≈ 11k)
    for (let i = 0; i < 20; i++) {
      const { data, error } = await supabase.from("staff_location_history")
        .select("id, lat, lng, accuracy, recorded_at")
        .eq("organization_id", orgId)
        .eq("staff_id", args.staff_id)
        .gte("recorded_at", windowStart)
        .lte("recorded_at", windowEnd)
        .order("recorded_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const batch = data ?? [];
      all.push(...batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  const [pingRows, reportsRes, entriesRes, workdaysRes, locationsRes, staffRes] = await Promise.all([
    fetchAllPings(),
    supabase.from("time_reports")
      .select("id, staff_id, organization_id, report_date, start_time, end_time, hours_worked, booking_id, large_project_id, location_id, source, updated_at")
      .eq("organization_id", orgId)
      .eq("staff_id", args.staff_id)
      .eq("report_date", args.date),
    supabase.from("location_time_entries")
      .select("id, staff_id, entered_at, exited_at, location_id, booking_id, large_project_id, source, created_at")
      .eq("organization_id", orgId)
      .eq("staff_id", args.staff_id)
      .eq("entry_date", args.date),
    supabase.from("workdays")
      .select("id, staff_id, started_at, ended_at, updated_at")
      .eq("organization_id", orgId)
      .eq("staff_id", args.staff_id)
      .gte("started_at", windowStart)
      .lte("started_at", windowEnd),
    supabase.from("organization_locations")
      .select("id, name, latitude, longitude, radius_meters")
      .eq("organization_id", orgId)
      .eq("is_active", true),
    supabase.from("staff_members").select("id, address").eq("id", args.staff_id).maybeSingle(),
  ]);

  const pings: Ping[] = (pingsRes.data ?? []).map((p: any) => ({
    ts: p.recorded_at,
    lat: Number(p.lat),
    lng: Number(p.lng),
    accuracy: p.accuracy != null ? Number(p.accuracy) : null,
  }));
  const reports = (reportsRes.data ?? []) as TimeReportRow[];
  const entries = (entriesRes.data ?? []) as LocationEntryRow[];
  const workdays = (workdaysRes.data ?? []) as WorkdayRow[];

  // Collect referenced booking + project IDs (already linked to staff today)
  const bookingIds = unique([
    ...reports.map((r) => r.booking_id).filter(Boolean) as string[],
    ...entries.map((e) => e.booking_id).filter(Boolean) as string[],
  ]);
  const projectIds = unique([
    ...reports.map((r) => r.large_project_id).filter(Boolean) as string[],
    ...entries.map((e) => e.large_project_id).filter(Boolean) as string[],
  ]);

  // ── Candidate window: also include ALL active/upcoming bookings & projects
  // in the org around this date, so GPS visits to known job sites are
  // recognised even if the staff member has no assignment yet. The match is a
  // *suggestion* — admin/staff can correct it later.
  const dateOnly = args.date; // YYYY-MM-DD
  const windowDate = new Date(args.date);
  const minus2 = new Date(windowDate); minus2.setDate(minus2.getDate() - 2);
  const plus30 = new Date(windowDate); plus30.setDate(plus30.getDate() + 30);
  const winFrom = minus2.toISOString().slice(0, 10);
  const winTo = plus30.toISOString().slice(0, 10);

  const [bookingsRes, projectsRes, candidateBookingsRes, candidateProjectsRes] = await Promise.all([
    bookingIds.length
      ? supabase.from("bookings")
          .select("id, client, deliveryaddress, delivery_latitude, delivery_longitude")
          .in("id", bookingIds)
      : Promise.resolve({ data: [] as any[] }),
    projectIds.length
      ? supabase.from("large_projects")
          .select("id, name, address, address_latitude, address_longitude, address_radius_meters")
          .in("id", projectIds)
      : Promise.resolve({ data: [] as any[] }),
    supabase.from("bookings")
      .select("id, client, deliveryaddress, delivery_latitude, delivery_longitude, rigdaydate, rigdowndate, eventdate, status")
      .eq("organization_id", orgId)
      .not("delivery_latitude", "is", null)
      .not("delivery_longitude", "is", null)
      .neq("status", "cancelled")
      .or(`and(rigdaydate.lte.${winTo},rigdowndate.gte.${winFrom}),eventdate.gte.${winFrom},rigdaydate.gte.${winFrom}`)
      .limit(500),
    supabase.from("large_projects")
      .select("id, name, address, address_latitude, address_longitude, address_radius_meters, start_date, end_date, event_date, status")
      .eq("organization_id", orgId)
      .not("address_latitude", "is", null)
      .not("address_longitude", "is", null)
      .or(`and(start_date.lte.${winTo},end_date.gte.${winFrom}),event_date.gte.${winFrom},start_date.gte.${winFrom}`)
      .limit(500),
  ]);

  // Build known places — merge linked + candidate sets, dedupe by id.
  // RULE (clarified 2026-05-06): when MULTIPLE bookings/projects share the same
  // address, the one whose date window is closest to the visit date wins. If
  // the visit falls within rig-2 → rigdown+2 of the primary candidate, it is
  // auto-assigned. Otherwise the match is kept but flagged
  // `requiresConfirmation = true` and the alternatives are surfaced so the
  // user can pick the correct one.
  const knownPlaces: KnownPlace[] = [];
  const seen = new Set<string>();
  const pushPlace = (p: KnownPlace) => {
    const key = `${p.type}:${p.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    knownPlaces.push(p);
  };
  for (const loc of (locationsRes.data ?? [])) {
    if (loc.latitude == null || loc.longitude == null) continue;
    pushPlace({
      id: loc.id,
      type: "location",
      name: loc.name,
      lat: Number(loc.latitude),
      lng: Number(loc.longitude),
      radiusM: loc.radius_meters ?? 100,
    });
  }

  // Helper: compute day-distance + auto-window membership for a candidate.
  const targetMs = new Date(`${args.date}T12:00:00Z`).getTime();
  const dayMs = 86_400_000;
  const dayDist = (iso: string | null) => {
    if (!iso) return Number.POSITIVE_INFINITY;
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
    return Math.round(Math.abs(t - targetMs) / dayMs);
  };
  const inWindow = (fromIso: string | null, toIso: string | null) => {
    if (!fromIso && !toIso) return false;
    const from = fromIso ? new Date(fromIso).getTime() - 2 * dayMs : Number.NEGATIVE_INFINITY;
    const to = toIso ? new Date(toIso).getTime() + 2 * dayMs : (fromIso ? new Date(fromIso).getTime() + 2 * dayMs : Number.POSITIVE_INFINITY);
    return targetMs >= from && targetMs <= to;
  };

  interface Candidate {
    id: string;
    type: "booking" | "project";
    name: string;
    lat: number;
    lng: number;
    radiusM: number;
    dayDistance: number;
    insideAutoWindow: boolean;
    /** Already linked to staff today via report/entry — always trusted. */
    linked: boolean;
  }

  const candidates: Candidate[] = [];
  const allBookings = [...(bookingsRes.data ?? []), ...(candidateBookingsRes.data ?? [])];
  const linkedBookingIds = new Set(bookingIds);
  const seenBookingIds = new Set<string>();
  for (const b of allBookings) {
    if (b.delivery_latitude == null || b.delivery_longitude == null) continue;
    if (seenBookingIds.has(b.id)) continue;
    seenBookingIds.add(b.id);
    const rig = (b as any).rigdaydate ?? null;
    const rigDown = (b as any).rigdowndate ?? (b as any).eventdate ?? rig;
    candidates.push({
      id: b.id,
      type: "booking",
      name: b.client || b.deliveryaddress || "Bokning",
      lat: Number(b.delivery_latitude),
      lng: Number(b.delivery_longitude),
      radiusM: 100,
      dayDistance: Math.min(dayDist(rig), dayDist(rigDown), dayDist((b as any).eventdate ?? null)),
      insideAutoWindow: inWindow(rig, rigDown),
      linked: linkedBookingIds.has(b.id),
    });
  }
  const allProjects = [...(projectsRes.data ?? []), ...(candidateProjectsRes.data ?? [])];
  const linkedProjectIds = new Set(projectIds);
  const seenProjectIds = new Set<string>();
  for (const p of allProjects) {
    if (p.address_latitude == null || p.address_longitude == null) continue;
    if (seenProjectIds.has(p.id)) continue;
    seenProjectIds.add(p.id);
    const sd = (p as any).start_date ?? null;
    const ed = (p as any).end_date ?? (p as any).event_date ?? sd;
    candidates.push({
      id: p.id,
      type: "project",
      name: p.name || p.address || "Projekt",
      lat: Number(p.address_latitude),
      lng: Number(p.address_longitude),
      radiusM: p.address_radius_meters ?? 100,
      dayDistance: Math.min(dayDist(sd), dayDist(ed), dayDist((p as any).event_date ?? null)),
      insideAutoWindow: inWindow(sd, ed),
      linked: linkedProjectIds.has(p.id),
    });
  }

  // Cluster candidates by physical proximity (≈80 m haversine), so that
  // multiple projects on the same address share a single primary.
  const CLUSTER_M = 80;
  const haversine = (aLat: number, aLng: number, bLat: number, bLng: number) => {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  };

  const clusters: Candidate[][] = [];
  for (const c of candidates) {
    let placed = false;
    for (const cl of clusters) {
      const head = cl[0];
      if (haversine(head.lat, head.lng, c.lat, c.lng) <= CLUSTER_M) {
        cl.push(c);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([c]);
  }

  for (const cl of clusters) {
    // Pick primary: linked > insideAutoWindow > smallest dayDistance.
    const sorted = [...cl].sort((a, b) => {
      if (a.linked !== b.linked) return a.linked ? -1 : 1;
      if (a.insideAutoWindow !== b.insideAutoWindow) return a.insideAutoWindow ? -1 : 1;
      return a.dayDistance - b.dayDistance;
    });
    const primary = sorted[0];
    const others = sorted.slice(1);
    // requiresConfirmation when there are siblings AND primary is not within
    // auto-window AND not already linked.
    const requiresConfirmation = others.length > 0 && !primary.insideAutoWindow && !primary.linked;
    pushPlace({
      id: primary.id,
      type: primary.type,
      name: primary.name,
      lat: primary.lat,
      lng: primary.lng,
      radiusM: primary.radiusM,
      requiresConfirmation,
      alternatives: others.length
        ? others.map((o) => ({
            id: o.id,
            type: o.type,
            name: o.name,
            dayDistance: Number.isFinite(o.dayDistance) ? o.dayDistance : 9999,
            insideAutoWindow: o.insideAutoWindow,
          }))
        : undefined,
    });
  }

  // Home place (we have no geocoded home — leave null for now; future enhancement).
  const homePlace: KnownPlace | null = null;

  // Build place lookup for reports
  const placeFor = (r: TimeReportRow): KnownPlace | null => {
    if (r.large_project_id) return knownPlaces.find((p) => p.type === "project" && p.id === r.large_project_id) ?? null;
    if (r.booking_id)       return knownPlaces.find((p) => p.type === "booking" && p.id === r.booking_id) ?? null;
    if (r.location_id)      return knownPlaces.find((p) => p.type === "location" && p.id === r.location_id) ?? null;
    return null;
  };

  // Cache check
  const sig = await computeInputSignature({
    pingCount: pings.length,
    lastPingTs: pings.length ? pings[pings.length - 1].ts : null,
    reportIds: reports.map((r) => r.id),
    reportUpdatedMax: maxField(reports as any[], "updated_at"),
    workdayIds: workdays.map((w) => w.id),
    workdayUpdatedMax: maxField(workdaysRes.data as any[], "updated_at"),
    entryIds: entries.map((e) => e.id),
    entryUpdatedMax: maxField(entriesRes.data as any[], "created_at"),
  });

  if (!args.force) {
    const { data: snap } = await supabase
      .from("day_timeline_snapshots")
      .select("input_signature, last_computed_at, is_dirty")
      .eq("staff_id", args.staff_id)
      .eq("date", args.date)
      .eq("engine_version", ENGINE_VERSION)
      .maybeSingle();
    if (snap && !snap.is_dirty && snap.input_signature === sig && snap.last_computed_at) {
      // Cache hit
      return await handleGet(supabase, userId, { staff_id: args.staff_id, date: args.date });
    }
  }

  // Run pipeline — använd SAMMA logik som UI:t "Faktiska besök & förflyttningar"
  const visits = buildPlaceVisits(pings, knownPlaces);
  const travels = buildTravelGaps(visits);
  const segments = visitsToSegments(visits, travels);
  const events = buildEvents({
    segments,
    reports,
    workdays,
    entries,
    knownPlaces,
    homePlace,
    reportedPlaceForReport: placeFor,
  });
  const suggestions = buildSuggestions({
    reports,
    segments,
    events,
    reportedPlaceForReport: placeFor,
  });

  // Persist atomically: delete old, insert new, upsert snapshot
  await supabase.from("day_timeline_events")
    .delete()
    .eq("staff_id", args.staff_id)
    .eq("date", args.date)
    .eq("engine_version", ENGINE_VERSION);

  if (events.length > 0) {
    const rows = events.map((e) => ({
      organization_id: orgId,
      staff_id: args.staff_id,
      date: args.date,
      event_type: e.eventType,
      ts: e.ts,
      end_ts: e.endTs ?? null,
      duration_min: e.durationMin ?? null,
      planned: e.planned ?? false,
      lat: e.lat,
      lng: e.lng,
      accuracy: e.accuracy,
      source: e.source,
      matched_site_id: e.matchedSiteId,
      matched_site_type: e.matchedSiteType,
      matched_site_name: e.matchedSiteName,
      distance_to_reported_site_m: e.distanceToReportedSiteM,
      confidence: e.confidence,
      human_readable_text: e.humanReadableText,
      related_time_report_id: e.relatedTimeReportId,
      related_workday_id: e.relatedWorkdayId,
      engine_version: ENGINE_VERSION,
    }));
    const { error: insErr } = await supabase.from("day_timeline_events").insert(rows);
    if (insErr) console.error("[day-timeline-engine] events insert", insErr);
  }

  // Suggestions: supersede pending ones for these reports, then insert
  const reportIds = reports.map((r) => r.id);
  if (reportIds.length > 0) {
    await supabase.from("time_report_correction_suggestions")
      .update({ status: "superseded" })
      .in("time_report_id", reportIds)
      .eq("status", "pending");
  }
  if (suggestions.length > 0) {
    const sRows = suggestions.map((s) => ({
      organization_id: orgId,
      staff_id: args.staff_id,
      time_report_id: s.timeReportId,
      report_date: s.reportDate,
      suggestion_type: s.suggestionType,
      suggested_start_time: s.suggestedStartTime,
      suggested_end_time: s.suggestedEndTime,
      suggested_duration_min: s.suggestedDurationMin,
      original_start_time: s.originalStartTime,
      original_end_time: s.originalEndTime,
      difference_min: s.differenceMin,
      target_booking_id: s.targetBookingId,
      target_project_id: s.targetProjectId,
      target_location_id: s.targetLocationId,
      reason: s.reason,
      confidence: s.confidence,
      human_readable_text: s.humanReadableText,
      engine_version: ENGINE_VERSION,
    }));
    const { error: sErr } = await supabase.from("time_report_correction_suggestions").insert(sRows);
    if (sErr) console.error("[day-timeline-engine] suggestions insert", sErr);
  }

  await supabase.from("day_timeline_snapshots")
    .upsert({
      organization_id: orgId,
      staff_id: args.staff_id,
      date: args.date,
      engine_version: ENGINE_VERSION,
      last_computed_at: new Date().toISOString(),
      input_signature: sig,
      event_count: events.length,
      suggestion_count: suggestions.length,
      is_dirty: false,
    }, { onConflict: "staff_id,date,engine_version" });

  return json({
    events,
    suggestions,
    snapshot: {
      computed_at: new Date().toISOString(),
      input_signature: sig,
      event_count: events.length,
      suggestion_count: suggestions.length,
      cached: false,
    },
  });
}

// ─── GET ──────────────────────────────────────────────────────────────────
async function handleGet(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  args: GetArgs,
) {
  if (!args.staff_id || !args.date) return json({ error: "staff_id and date required" }, 400);
  const orgId = await getCallerOrg(supabase, userId);
  if (!orgId) return json({ error: "no_org" }, 403);

  const [evRes, sugRes, snapRes] = await Promise.all([
    supabase.from("day_timeline_events")
      .select("*")
      .eq("organization_id", orgId)
      .eq("staff_id", args.staff_id)
      .eq("date", args.date)
      .eq("engine_version", ENGINE_VERSION)
      .order("ts", { ascending: true }),
    supabase.from("time_report_correction_suggestions")
      .select("*")
      .eq("organization_id", orgId)
      .eq("staff_id", args.staff_id)
      .eq("report_date", args.date)
      .eq("engine_version", ENGINE_VERSION)
      .order("computed_at", { ascending: false }),
    supabase.from("day_timeline_snapshots")
      .select("*")
      .eq("staff_id", args.staff_id)
      .eq("date", args.date)
      .eq("engine_version", ENGINE_VERSION)
      .maybeSingle(),
  ]);

  return json({
    events: evRes.data ?? [],
    suggestions: sugRes.data ?? [],
    snapshot: snapRes.data ?? null,
  });
}

// ─── RESOLVE SUGGESTION ───────────────────────────────────────────────────
async function handleResolve(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  args: ResolveArgs,
) {
  const subAction = (args.resolve_action
    ?? (args.action && args.action !== "resolve_suggestion" ? args.action : undefined)
    ?? (args.payload?.action as ResolveAction | undefined)) as ResolveAction | undefined;
  if (!args.suggestion_id || !subAction) {
    return json({ error: "suggestion_id and resolve_action required" }, 400);
  }
  const orgId = await getCallerOrg(supabase, userId);
  if (!orgId) return json({ error: "no_org" }, 403);
  const admin = await isAdmin(supabase, userId);
  if (!admin) return json({ error: "forbidden" }, 403);

  const { data: sug } = await supabase
    .from("time_report_correction_suggestions")
    .select("*")
    .eq("id", args.suggestion_id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!sug) return json({ error: "suggestion_not_found" }, 404);
  if (sug.status !== "pending") {
    return json({ error: "suggestion_not_pending", status: sug.status }, 409);
  }

  const handler = ACTIONS[subAction];
  if (!handler) return json({ error: "unknown_resolve_action", action: subAction }, 400);

  try {
    const result = await handler({
      supabase,
      userId,
      orgId,
      suggestion: sug,
      payload: args.payload ?? {},
    });
    return json(result);
  } catch (err) {
    console.error("[day-timeline-engine] resolve failed", err);
    return json({ error: String((err as Error).message ?? err) }, 400);
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────
function unique<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }
function maxField(rows: any[] | null, field: string): string | null {
  if (!rows || rows.length === 0) return null;
  let max: string | null = null;
  for (const r of rows) {
    const v = r?.[field];
    if (typeof v === "string" && (!max || v > max)) max = v;
  }
  return max;
}
