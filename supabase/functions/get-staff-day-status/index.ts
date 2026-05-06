// Edge Function: get-staff-day-status
// Read-only snapshot of a staff member's day (workday + reports + travel + locations + flags).
// Auth: requires JWT. Allows the staff member themselves OR admin/manager roles.
// Multi-tenant: org is resolved from the caller's profile and used to filter all queries.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildStaffDaySnapshot } from "../_shared/staff-day-status.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return bad(401, "Unauthorized");

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) return bad(401, "Unauthorized");
  const userId = claimsData.claims.sub as string;

  let body: { staffId?: string; date?: string };
  try {
    body = await req.json();
  } catch {
    return bad(400, "Invalid JSON body");
  }
  const staffId = (body.staffId ?? "").trim();
  if (!staffId) return bad(400, "staffId is required");
  const date = (body.date ?? todayInStockholm()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad(400, "date must be YYYY-MM-DD");

  // Resolve caller's org + role
  const { data: profile } = await admin
    .from("profiles")
    .select("organization_id")
    .eq("user_id", userId)
    .maybeSingle();
  const orgId = profile?.organization_id as string | undefined;
  if (!orgId) return bad(403, "No organization for caller");

  // Find requested staff member; ensure same org
  const { data: targetStaff } = await admin
    .from("staff_members")
    .select("id, user_id, organization_id, full_name")
    .eq("id", staffId)
    .maybeSingle();
  if (!targetStaff || targetStaff.organization_id !== orgId) {
    return bad(404, "Staff not found in your organization");
  }

  // Authorization: self OR admin/manager-ish role
  const isSelf = targetStaff.user_id === userId;
  let isPrivileged = false;
  if (!isSelf) {
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const allowed = new Set(["admin", "projekt", "lager"]);
    isPrivileged = (roles ?? []).some((r) => allowed.has(r.role as string));
  }
  if (!isSelf && !isPrivileged) return bad(403, "Forbidden");

  // Day window in Europe/Stockholm
  // For workdays/travel/location_entries we filter by overlap with [dayStart, dayEnd).
  // For *_date columns we filter by equality.
  const dayStart = new Date(`${date}T00:00:00+01:00`); // approx; queries use both date= and overlap
  const dayEnd = new Date(`${date}T00:00:00+01:00`);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const startIso = new Date(`${date}T00:00:00Z`).toISOString();
  const endIso = new Date(`${date}T23:59:59.999Z`).toISOString();
  // Pad +/- 1 day to capture cross-midnight rows
  const padStart = new Date(new Date(startIso).getTime() - 24 * 3600 * 1000).toISOString();
  const padEnd = new Date(new Date(endIso).getTime() + 24 * 3600 * 1000).toISOString();

  const [
    workdayRes,
    timeReportsRes,
    travelRes,
    locRes,
    flagsRes,
    eventsRes,
  ] = await Promise.all([
    admin
      .from("workdays")
      .select("id, staff_id, started_at, ended_at, review_status, review_reasons, approved_at, admin_note, metadata")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .gte("started_at", padStart)
      .lte("started_at", padEnd)
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
      .gte("start_time", padStart)
      .lte("start_time", padEnd),
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
      .gte("happened_at", padStart)
      .lte("happened_at", padEnd)
      .order("happened_at", { ascending: true }),
  ]);

  const errors = [workdayRes.error, timeReportsRes.error, travelRes.error, locRes.error, flagsRes.error, eventsRes.error].filter(Boolean);
  if (errors.length) {
    console.error("[get-staff-day-status] db errors", errors);
    return bad(500, "Database error", { details: errors.map((e) => e?.message) });
  }

  // Pick the workday whose window covers the requested local day; prefer one that started on `date`
  const workdayRows = workdayRes.data ?? [];
  const workday = workdayRows.find((w) => (w.started_at as string).slice(0, 10) === date) ?? workdayRows[0] ?? null;

  const snapshot = buildStaffDaySnapshot({
    staffId,
    date,
    workday: workday as never,
    timeReports: (timeReportsRes.data ?? []) as never,
    travelLogs: (travelRes.data ?? []) as never,
    locationEntries: (locRes.data ?? []) as never,
    flags: (flagsRes.data ?? []) as never,
    assistantEvents: (eventsRes.data ?? []) as never,
  });

  return new Response(JSON.stringify(snapshot), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
