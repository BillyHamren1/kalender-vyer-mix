// Edge Function: get-staff-day-status
// Read-only snapshot of a staff member's day (workday + reports + travel + locations + flags).
// Auth: requires JWT. Allows the staff member themselves OR admin/manager roles.
// Multi-tenant: org is resolved from the caller's profile and used to filter all queries.

import { buildStaffDaySnapshot } from "../_shared/staff-day-status.ts";
import { authenticateStaffRequest, authorizeStaffAccess } from "../_shared/staff-auth.ts";
import { getStockholmDayWindowUtc, clipIntervalToDayWindow } from "../_shared/stockholmDayWindow.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-view-as-staff",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function todayInStockholm(): string {
  // YYYY-MM-DD in Europe/Stockholm
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

function bad(status: number, error: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ error, ...extra }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return bad(405, "Method not allowed");

  let body: { staffId?: string; date?: string; batteryPct?: number; dismissedCooldownActive?: boolean };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Invalid JSON body");
  }
  const staffId = (body.staffId ?? "").trim();
  if (!staffId) return bad(400, "staffId is required");
  const date = (body.date ?? todayInStockholm()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad(400, "date must be YYYY-MM-DD");
  const batteryPct =
    typeof body.batteryPct === "number" && body.batteryPct >= 0 && body.batteryPct <= 1
      ? body.batteryPct
      : null;
  const dismissedCooldownActive = !!body.dismissedCooldownActive;

  const authResult = await authenticateStaffRequest(req, { requestedStaffId: staffId });
  if (!authResult.ok) return bad(authResult.err.status, authResult.err.error);
  const access = await authorizeStaffAccess(authResult.auth, staffId);
  if (!access.ok) return bad(access.err.status, access.err.error);
  const orgId = access.orgId;
  const admin = authResult.auth.admin;

  // Day window in Europe/Stockholm — single source of truth.
  // All timestamptz queries (workdays, travel, assistant_events, pings) använder
  // [dayStart, dayEnd] som täcker exakt den svenska kalenderdagen.
  // *_date-kolumner (time_reports, location_time_entries, workday_flags,
  // day_attestations) filtreras fortsatt med equality på `date`.
  const { startUtc: dayStart, endUtc: dayEnd } = getStockholmDayWindowUtc(date);

  // Helper: minutes overlap mellan ett intervall och dagsfönstret.
  function overlapMinutes(start: string | null | undefined, end: string | null | undefined, winStart: string, winEnd: string): number {
    if (!start) return 0;
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : new Date(winEnd).getTime();
    const ws = new Date(winStart).getTime();
    const we = new Date(winEnd).getTime();
    const lo = Math.max(s, ws);
    const hi = Math.min(e, we);
    return hi > lo ? Math.round((hi - lo) / 60_000) : 0;
  }

  // Pad +/- 1 day kring Stockholm-fönstret för att fånga cross-midnight pings/rader.
  const padStart = new Date(new Date(dayStart).getTime() - 24 * 3600 * 1000).toISOString();
  const padEnd = new Date(new Date(dayEnd).getTime() + 24 * 3600 * 1000).toISOString();

  // Paginated ping fetch — no global limit. Same principle as
  // StaffTimeReports.fetchAllPingsForStaff: page in 1000-row batches up to
  // a per-staff cap, never let .limit() silently truncate the day.
  const PING_PAGE_SIZE = 1000;
  const PER_STAFF_PING_CAP = 20_000;
  async function fetchAllPings(): Promise<{
    rows: Array<{ recorded_at: string; lat: number; lng: number; accuracy: number | null }>;
    truncated: boolean;
    pageCount: number;
    error: string | null;
  }> {
    const out: any[] = [];
    let from = 0;
    let pageCount = 0;
    while (out.length < PER_STAFF_PING_CAP) {
      const to = from + PING_PAGE_SIZE - 1;
      const { data, error } = await admin
        .from("staff_location_history")
        .select("recorded_at, lat, lng, accuracy")
        .eq("organization_id", orgId)
        .eq("staff_id", staffId)
        .gte("recorded_at", padStart)
        .lte("recorded_at", padEnd)
        .order("recorded_at", { ascending: true })
        .range(from, to);
      pageCount += 1;
      if (error) return { rows: out, truncated: false, pageCount, error: error.message };
      const batch = data ?? [];
      out.push(...batch);
      if (batch.length < PING_PAGE_SIZE) {
        return { rows: out, truncated: false, pageCount, error: null };
      }
      from += PING_PAGE_SIZE;
    }
    return { rows: out.slice(0, PER_STAFF_PING_CAP), truncated: true, pageCount, error: null };
  }

  const [
    workdayRes,
    timeReportsRes,
    travelRes,
    locRes,
    flagsRes,
    eventsRes,
    attestationRes,
    boostsRes,
    pingsAll,
  ] = await Promise.all([
    admin
      .from("workdays")
      .select("id, staff_id, started_at, ended_at, review_status, review_reasons, approved_at, admin_note, metadata")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      // Overlap med Stockholm-dagen: started_at <= dayEnd AND (ended_at IS NULL OR ended_at >= dayStart)
      .lte("started_at", dayEnd)
      .or(`ended_at.is.null,ended_at.gte.${dayStart}`)
      .order("started_at", { ascending: true }),
    admin
      .from("time_reports")
      .select("id, staff_id, booking_id, large_project_id, report_date, start_time, end_time, hours_worked, break_time, description, approved, source, source_entry_id")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .eq("report_date", date),
    admin
      .from("travel_time_logs")
      .select("id, staff_id, start_time, end_time, hours_worked, from_address, to_address, destination_booking_id, related_booking_id, manual_project_name, classification, approved, needs_review, description")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      // Overlap: start_time <= dayEnd AND (end_time IS NULL OR end_time >= dayStart)
      .lte("start_time", dayEnd)
      .or(`end_time.is.null,end_time.gte.${dayStart}`),
    admin
      .from("location_time_entries")
      .select("id, staff_id, location_id, booking_id, large_project_id, task_id, entry_date, entered_at, exited_at, total_minutes, source, metadata")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .eq("entry_date", date),
    admin
      .from("workday_flags")
      .select("id, staff_id, flag_type, severity, flag_date, title, description, needs_user_input, resolved, context")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .eq("flag_date", date),
    admin
      .from("assistant_events")
      .select("id, staff_id, event_type, target_type, target_id, target_label, happened_at, resolution_status, stale_for_prompt")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .gte("happened_at", dayStart)
      .lte("happened_at", dayEnd)
      .order("happened_at", { ascending: true }),
    admin
      .from("day_attestations")
      .select("id, staff_id, date, break_minutes, comment, status, attested_at, attested_by, locked_at, locked_by, metadata")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .eq("date", date)
      .maybeSingle(),
    admin
      .from("tracking_policy_boosts")
      .select("mode, reason, target_id, target_type, expires_at, consumed")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .eq("consumed", false)
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(5),
    fetchAllPings(),
  ]);

  const pingsRes = { data: pingsAll.rows, error: pingsAll.error ? new Error(pingsAll.error) : null } as const;
  const errors = [workdayRes.error, timeReportsRes.error, travelRes.error, locRes.error, flagsRes.error, eventsRes.error, attestationRes.error, boostsRes.error, pingsRes.error].filter(Boolean);
  if (errors.length) {
    console.error("[get-staff-day-status] db errors", errors);
    return bad(500, "Database error", { details: errors.map((e) => e?.message) });
  }

  // Pick the workday whose window covers the requested local day; prefer one that started on `date`
  // Pick the workday som täcker den svenska kalenderdagen.
  // 1) prioritera workday vars started_at ligger inom [dayStart, dayEnd]
  // 2) annars den som överlappar mest med dagsfönstret
  // 3) annars första
  const workdayRows = (workdayRes.data ?? []) as Array<{ started_at: string; ended_at: string | null }>;
  const startedToday = workdayRows.find((w) => {
    const s = new Date(w.started_at).getTime();
    return s >= new Date(dayStart).getTime() && s <= new Date(dayEnd).getTime();
  });
  let workday: typeof workdayRows[number] | null = startedToday ?? null;
  if (!workday && workdayRows.length) {
    let best = workdayRows[0];
    let bestOverlap = overlapMinutes(best.started_at, best.ended_at, dayStart, dayEnd);
    for (let i = 1; i < workdayRows.length; i++) {
      const ov = overlapMinutes(workdayRows[i].started_at, workdayRows[i].ended_at, dayStart, dayEnd);
      if (ov > bestOverlap) { best = workdayRows[i]; bestOverlap = ov; }
    }
    workday = best;
  }

  // Klipp workday-intervallet till dagens fönster så att brutto/payable per
  // dag aldrig räknar in minuter från andra dygn (t.ex. ej-stängd workday
  // som nödstoppats efter flera dygn).
  if (workday) {
    const win = { startUtc: dayStart, endUtc: dayEnd, startUtcMs: new Date(dayStart).getTime(), endUtcMs: new Date(dayEnd).getTime() };
    const clip = clipIntervalToDayWindow(workday.started_at, workday.ended_at ?? null, win);
    if (!clip) {
      workday = null;
    } else if (clip.startUtc !== workday.started_at || clip.endUtc !== (workday.ended_at ?? null)) {
      workday = { ...workday, started_at: clip.startUtc, ended_at: clip.endUtc };
    }
  }

  // ---- Resolve human-readable labels for refs ----
  const trRows = timeReportsRes.data ?? [];
  const tlRows = travelRes.data ?? [];
  const leRows = locRes.data ?? [];

  const bookingIds = new Set<string>();
  const largeIds = new Set<string>();
  const locationIds = new Set<string>();
  for (const r of [...trRows, ...leRows]) {
    if (r.booking_id) bookingIds.add(r.booking_id);
    if (r.large_project_id) largeIds.add(r.large_project_id);
  }
  for (const r of tlRows) {
    if (r.destination_booking_id) bookingIds.add(r.destination_booking_id);
  }
  for (const r of leRows) {
    if (r.location_id) locationIds.add(r.location_id);
  }

  const [bookingNamesRes, largeNamesRes, locationNamesRes] = await Promise.all([
    bookingIds.size
      ? admin.from("bookings").select("id, booking_number, project_name, customer_name").in("id", Array.from(bookingIds))
      : Promise.resolve({ data: [], error: null }),
    largeIds.size
      ? admin.from("large_projects").select("id, project_name, project_number").in("id", Array.from(largeIds))
      : Promise.resolve({ data: [], error: null }),
    locationIds.size
      ? admin.from("organization_locations").select("id, name, is_work_location").in("id", Array.from(locationIds))
      : Promise.resolve({ data: [], error: null }),
  ]);

  const bookingNames = new Map<string, string>();
  for (const b of bookingNamesRes.data ?? []) {
    const label = (b as { project_name?: string; customer_name?: string; booking_number?: string }).project_name
      ?? (b as { customer_name?: string }).customer_name
      ?? (b as { booking_number?: string }).booking_number
      ?? "";
    if (label) bookingNames.set((b as { id: string }).id, label);
  }
  const largeNames = new Map<string, string>();
  for (const lp of largeNamesRes.data ?? []) {
    const r = lp as { id: string; project_name?: string; project_number?: string };
    const label = r.project_name || r.project_number || "";
    if (label) largeNames.set(r.id, label);
  }
  const locationNames = new Map<string, { name: string; isWork: boolean }>();
  for (const l of locationNamesRes.data ?? []) {
    const r = l as { id: string; name?: string; is_work_location?: boolean };
    locationNames.set(r.id, { name: r.name ?? "", isWork: !!r.is_work_location });
  }

  const snapshot = buildStaffDaySnapshot({
    staffId,
    date,
    workday: workday as never,
    timeReports: trRows as never,
    travelLogs: tlRows as never,
    locationEntries: leRows as never,
    flags: (flagsRes.data ?? []) as never,
    assistantEvents: (eventsRes.data ?? []) as never,
    nameMaps: {
      bookings: Object.fromEntries(bookingNames),
      largeProjects: Object.fromEntries(largeNames),
      locations: Object.fromEntries(
        Array.from(locationNames.entries()).map(([k, v]) => [k, v]),
      ),
    },
    attestation: (attestationRes.data ?? null) as never,
    activeBoosts: (boostsRes.data ?? []) as never,
    batteryPct,
    dismissedCooldownActive,
    pings: ((pingsRes.data ?? []) as Array<{ recorded_at: string; lat: number; lng: number; accuracy: number | null }>)
      .map((p) => ({ recorded_at: p.recorded_at, lat: Number(p.lat), lng: Number(p.lng), accuracy: p.accuracy })),
  });

  // Pure ping coverage diagnostics — lets the client/debug see whether the
  // entire day was loaded or if pagination ran into the cap.
  const pingRows = pingsRes.data ?? [];
  const rawPingCoverage = {
    totalFetched: pingRows.length,
    firstPingAt: pingRows.length ? (pingRows[0] as any).recorded_at : null,
    lastPingAt: pingRows.length ? (pingRows[pingRows.length - 1] as any).recorded_at : null,
    truncated: pingsAll.truncated,
    pageCount: pingsAll.pageCount,
  };

  return new Response(JSON.stringify({ ...snapshot, rawPingCoverage }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

