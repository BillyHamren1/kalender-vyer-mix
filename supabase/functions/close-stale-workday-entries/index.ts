// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// close-stale-workday-entries
//
// Nightly cron that closes timers a staff member forgot to stop. For every
// open `location_time_entries`, `travel_time_logs` and `time_reports` row
// older than the safety horizon (entered yesterday or > 14h old today) we:
//
//   1. Provisionally close it (entered_at + 8h, clamped to end-of-day).
//   2. Build `suggested_end_times` from staff_locations history for the day:
//        • last_workplace_exit  — sista geofence-EXIT
//        • stopped_en_route     — längre stopp under resa (>10 min, <50m)
//        • arrived_home         — första ping inom 100m av inferred home
//   3. Write ONE workday_flag (kind: 'auto_closed_overnight' / 'auto_closed_travel'
//      / 'auto_closed_report') with `needs_user_input=true` and
//      `context = { provisional_end_iso, suggested_end_times, affected_entries }`.
//   4. Schedule a morning push so the user opens the app and corrects the time.
//
// Auth: requires `x-cron-secret` header matching CRON_SECRET env. Anonymous
// requests are rejected with 401. Multi-tenant: all queries scope by org.
// Idempotens: no row is touched twice — only entries with NULL end-time are
// processed, and the second run sees them already closed.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.170.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { computePlannedDaySignals, type BookingTimes } from "./plannedDay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SAFETY_HORIZON_HOURS = 14;
const PROVISIONAL_DURATION_HOURS = 8;
const PROVISIONAL_TRAVEL_HOURS = 1;

type Suggestion =
  | { kind: "left_workplace"; label: string; time_iso: string; source_id?: string | null }
  | { kind: "stopped_en_route"; label: string; time_iso: string; lat: number; lng: number }
  | { kind: "arrived_home"; label: string; time_iso: string; lat: number; lng: number };

type AffectedEntry =
  | { table: "location_time_entries"; id: string }
  | { table: "travel_time_logs"; id: string }
  | { table: "time_reports"; id: string };

function endOfDayIso(dateStr: string): string {
  // dateStr = YYYY-MM-DD → 23:59:59 of that local date in UTC ISO
  return new Date(`${dateStr}T23:59:59Z`).toISOString();
}

/**
 * Cap auto-close time at the EARLIEST of:
 *   • start + provisionalHours   (legacy default)
 *   • plannedEndOfDay (if known) (Fas 2 — respects actual schedule)
 *   • end of report day          (never bleed into next day)
 *
 * `plannedEndIso` is the staff member's latest scheduled end-of-activity
 * for that day, computed from booking_staff_assignments. When null we
 * fall back to legacy behavior.
 */
function clampAutoCloseEnd(
  startIso: string,
  dateStr: string,
  hours: number,
  plannedEndIso: string | null,
): string {
  const start = new Date(startIso).getTime();
  const proposed = start + hours * 60 * 60 * 1000;
  const eod = new Date(endOfDayIso(dateStr)).getTime();
  const planned = plannedEndIso ? new Date(plannedEndIso).getTime() : Infinity;
  // Planned end must be after start to be a meaningful cap.
  const plannedCap = planned > start ? planned : Infinity;
  return new Date(Math.min(proposed, eod, plannedCap)).toISOString();
}

function distMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function buildSuggestions(
  supabase: any,
  staffId: string,
  organizationId: string,
  startIso: string,
): Promise<Suggestion[]> {
  const suggestions: Suggestion[] = [];
  const dayStart = new Date(startIso);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  // (1) Last geofence EXIT from location_time_entries
  const { data: lastExit } = await supabase
    .from("location_time_entries")
    .select("exited_at, location_id, organization_locations(name)")
    .eq("staff_id", staffId)
    .eq("organization_id", organizationId)
    .not("exited_at", "is", null)
    .gte("exited_at", startIso)
    .lt("exited_at", dayEnd.toISOString())
    .order("exited_at", { ascending: false })
    .limit(1);

  const lastExitRow = lastExit?.[0];
  if (lastExitRow?.exited_at) {
    const placeName = (lastExitRow as any).organization_locations?.name || "arbetsplatsen";
    suggestions.push({
      kind: "left_workplace",
      label: `Du åkte från ${placeName}`,
      time_iso: lastExitRow.exited_at,
      source_id: lastExitRow.location_id,
    });
  }

  // (2) Long stops in staff_location_history after the last exit (or after dayStart)
  const fromTs = lastExitRow?.exited_at || startIso;
  const { data: pings } = await supabase
    .from("staff_location_history")
    .select("lat, lng, recorded_at")
    .eq("staff_id", staffId)
    .eq("organization_id", organizationId)
    .gte("recorded_at", fromTs)
    .lt("recorded_at", dayEnd.toISOString())
    .order("recorded_at", { ascending: true })
    .limit(500);

  if (pings && pings.length > 1) {
    let stops = 0;
    let i = 0;
    while (i < pings.length - 1 && stops < 2) {
      const a = pings[i];
      let j = i + 1;
      while (
        j < pings.length &&
        distMeters(
          { lat: Number(a.lat), lng: Number(a.lng) },
          { lat: Number(pings[j].lat), lng: Number(pings[j].lng) },
        ) < 50
      ) {
        j++;
      }
      const dwellMs =
        new Date(pings[Math.min(j, pings.length - 1)].recorded_at).getTime() -
        new Date(a.recorded_at).getTime();
      if (dwellMs >= 10 * 60 * 1000 && j > i + 1) {
        suggestions.push({
          kind: "stopped_en_route",
          label: `Du stannade på vägen (${Math.round(dwellMs / 60000)} min)`,
          time_iso: a.recorded_at,
          lat: Number(a.lat),
          lng: Number(a.lng),
        });
        stops++;
      }
      i = Math.max(j, i + 1);
    }
  }

  // (3) Arrival at inferred home
  const { data: homes } = await supabase
    .from("staff_inferred_home_locations")
    .select("lat, lng")
    .eq("staff_id", staffId)
    .eq("organization_id", organizationId)
    .is("valid_until", null)
    .order("confidence", { ascending: false })
    .limit(1);

  const home = homes?.[0];
  if (home && pings && pings.length > 0) {
    const arrival = pings.find(
      (p: any) =>
        distMeters(
          { lat: Number(p.lat), lng: Number(p.lng) },
          { lat: Number(home.lat), lng: Number(home.lng) },
        ) < 100,
    );
    if (arrival) {
      suggestions.push({
        kind: "arrived_home",
        label: "Du kom hem",
        time_iso: arrival.recorded_at,
        lat: Number(arrival.lat),
        lng: Number(arrival.lng),
      });
    }
  }

  // De-dup by time within 60s of each other
  const dedup: Suggestion[] = [];
  for (const s of suggestions) {
    if (
      !dedup.find((d) => Math.abs(new Date(d.time_iso).getTime() - new Date(s.time_iso).getTime()) < 60000)
    ) {
      dedup.push(s);
    }
  }
  return dedup;
}

async function writeFlag(
  supabase: any,
  organizationId: string,
  staffId: string,
  flagType: "auto_closed_overnight" | "auto_closed_travel" | "auto_closed_report",
  flagDate: string,
  provisionalEndIso: string,
  suggestions: Suggestion[],
  affected: AffectedEntry[],
) {
  const titles: Record<string, string> = {
    auto_closed_overnight: "Din arbetsdag stängdes automatiskt",
    auto_closed_travel: "Din restimer stängdes automatiskt",
    auto_closed_report: "Din tidrapport stängdes automatiskt",
  };
  await supabase.from("workday_flags").insert({
    organization_id: organizationId,
    staff_id: staffId,
    flag_type: flagType,
    severity: "warning",
    flag_date: flagDate,
    title: titles[flagType],
    description:
      "Du glömde stoppa timern. Vi har stängt den preliminärt — bekräfta din riktiga sluttid.",
    needs_user_input: true,
    context: {
      provisional_end_iso: provisionalEndIso,
      suggested_end_times: suggestions,
      affected_entries: affected,
    },
  });
}

/**
 * Resolve `plannedEndOfDay` for a (staff, date) pair by reading the
 * staff's bookings via booking_staff_assignments. Returns null if the
 * staff has no booked phases that day or if no times are set — in which
 * case the caller falls back to the legacy 8h cap.
 */
async function getPlannedEndOfDay(
  supabase: any,
  organizationId: string,
  staffId: string,
  dateStr: string,
): Promise<string | null> {
  const { data: assignments } = await supabase
    .from("booking_staff_assignments")
    .select("booking_id")
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .eq("assignment_date", dateStr);

  const bookingIds = Array.from(
    new Set((assignments || []).map((a: any) => a.booking_id).filter(Boolean)),
  );
  if (bookingIds.length === 0) return null;

  const { data: bookings } = await supabase
    .from("bookings")
    .select(
      "id, eventdate, rigdaydate, rigdowndate, " +
        "event_start_time, event_end_time, " +
        "rig_start_time, rig_end_time, " +
        "rigdown_start_time, rigdown_end_time",
    )
    .in("id", bookingIds);

  if (!bookings || bookings.length === 0) return null;

  // Anchor "now" at noon of the report date so the YMD comparison inside
  // computePlannedDaySignals matches the day we're closing for.
  const anchor = new Date(`${dateStr}T12:00:00Z`);
  const signals = computePlannedDaySignals(bookings as BookingTimes[], anchor);
  return signals.plannedEndOfDay;
}

async function processOrganization(supabase: any, organizationId: string) {
  const now = new Date();
  const horizonIso = new Date(now.getTime() - SAFETY_HORIZON_HOURS * 60 * 60 * 1000).toISOString();
  const today = now.toISOString().slice(0, 10);

  let locationClosed = 0;
  let travelClosed = 0;
  let reportsClosed = 0;
  let flagsCreated = 0;
  const staffWithClosure = new Set<string>();

  // ── A. location_time_entries open and stale ──
  const { data: openLocs } = await supabase
    .from("location_time_entries")
    .select("id, staff_id, entered_at, entry_date")
    .eq("organization_id", organizationId)
    .is("exited_at", null)
    .lt("entered_at", horizonIso);

  for (const row of openLocs || []) {
    const plannedEnd = await getPlannedEndOfDay(
      supabase,
      organizationId,
      row.staff_id,
      row.entry_date,
    );
    const exitedAt = clampAutoCloseEnd(
      row.entered_at,
      row.entry_date,
      PROVISIONAL_DURATION_HOURS,
      plannedEnd,
    );
    const totalMinutes = Math.max(
      0,
      Math.round((new Date(exitedAt).getTime() - new Date(row.entered_at).getTime()) / 60000),
    );
    const { error } = await supabase
      .from("location_time_entries")
      .update({ exited_at: exitedAt, total_minutes: totalMinutes })
      .eq("id", row.id)
      .is("exited_at", null); // idempotency guard
    if (error) {
      console.error(`[stale-cron] location_time_entries ${row.id} update failed`, error.message);
      continue;
    }
    locationClosed++;
    const suggestions = await buildSuggestions(supabase, row.staff_id, organizationId, row.entered_at);
    await writeFlag(
      supabase,
      organizationId,
      row.staff_id,
      "auto_closed_overnight",
      row.entry_date,
      exitedAt,
      suggestions,
      [{ table: "location_time_entries", id: row.id }],
    );
    flagsCreated++;
    staffWithClosure.add(row.staff_id);
  }

  // ── B. travel_time_logs open and stale ──
  const { data: openTravel } = await supabase
    .from("travel_time_logs")
    .select("id, staff_id, start_time, report_date")
    .eq("organization_id", organizationId)
    .is("end_time", null)
    .lt("start_time", horizonIso);

  for (const row of openTravel || []) {
    const endedAt = new Date(
      new Date(row.start_time).getTime() + PROVISIONAL_TRAVEL_HOURS * 60 * 60 * 1000,
    ).toISOString();
    const hours = PROVISIONAL_TRAVEL_HOURS;
    const { error } = await supabase
      .from("travel_time_logs")
      .update({ end_time: endedAt, hours_worked: hours, classification: "auto_closed" })
      .eq("id", row.id)
      .is("end_time", null);
    if (error) {
      console.error(`[stale-cron] travel_time_logs ${row.id} update failed`, error.message);
      continue;
    }
    travelClosed++;
    const suggestions = await buildSuggestions(supabase, row.staff_id, organizationId, row.start_time);
    await writeFlag(
      supabase,
      organizationId,
      row.staff_id,
      "auto_closed_travel",
      row.report_date || row.start_time.slice(0, 10),
      endedAt,
      suggestions,
      [{ table: "travel_time_logs", id: row.id }],
    );
    flagsCreated++;
    staffWithClosure.add(row.staff_id);
  }

  // ── C. time_reports open and stale (end_time IS NULL and report_date < today) ──
  const { data: openReports } = await supabase
    .from("time_reports")
    .select("id, staff_id, report_date, start_time")
    .eq("organization_id", organizationId)
    .is("end_time", null)
    .lt("report_date", today);

  for (const row of openReports || []) {
    if (!row.start_time) continue;
    // start_time is TIME without date — combine with report_date
    const startCombinedIso = new Date(`${row.report_date}T${row.start_time}Z`).toISOString();
    const plannedEnd = await getPlannedEndOfDay(
      supabase,
      organizationId,
      row.staff_id,
      row.report_date,
    );
    const endIso = clampAutoCloseEnd(
      startCombinedIso,
      row.report_date,
      PROVISIONAL_DURATION_HOURS,
      plannedEnd,
    );
    const endTimeOnly = new Date(endIso).toISOString().slice(11, 19);
    const hours =
      Math.max(
        0,
        (new Date(endIso).getTime() - new Date(startCombinedIso).getTime()) / (1000 * 60 * 60),
      );
    const { error } = await supabase
      .from("time_reports")
      .update({ end_time: endTimeOnly, hours_worked: Number(hours.toFixed(2)) })
      .eq("id", row.id)
      .is("end_time", null);
    if (error) {
      console.error(`[stale-cron] time_reports ${row.id} update failed`, error.message);
      continue;
    }
    reportsClosed++;
    const suggestions = await buildSuggestions(supabase, row.staff_id, organizationId, startCombinedIso);
    await writeFlag(
      supabase,
      organizationId,
      row.staff_id,
      "auto_closed_report",
      row.report_date,
      endIso,
      suggestions,
      [{ table: "time_reports", id: row.id }],
    );
    flagsCreated++;
    staffWithClosure.add(row.staff_id);
  }

  // ── D. Morning push to affected staff ──
  let pushesSent = 0;
  if (staffWithClosure.size > 0) {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          staff_ids: Array.from(staffWithClosure),
          title: "Din arbetsdag stängdes automatiskt",
          body: "Du glömde stoppa timern igår. Öppna appen och bekräfta din sluttid.",
          notification_type: "workday_flag",
          data: { flag_kind: "auto_closed_overnight" },
          organization_id: organizationId,
        }),
      });
      const pr: any = await pushRes.json().catch(() => ({}));
      pushesSent = pr.sent || 0;
    } catch (err) {
      console.error("[stale-cron] push failed", (err as Error).message);
    }
  }

  return { locationClosed, travelClosed, reportsClosed, flagsCreated, pushesSent };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth-guard: require cron secret. Anonymous → 401.
  const provided = req.headers.get("x-cron-secret");
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected || !provided || provided !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: orgs, error: orgErr } = await supabase
      .from("organizations")
      .select("id");
    if (orgErr) throw orgErr;

    const summary = {
      orgs_processed: 0,
      location_closed: 0,
      travel_closed: 0,
      reports_closed: 0,
      flags_created: 0,
      pushes_sent: 0,
    };

    for (const org of orgs || []) {
      const r = await processOrganization(supabase, org.id);
      summary.orgs_processed++;
      summary.location_closed += r.locationClosed;
      summary.travel_closed += r.travelClosed;
      summary.reports_closed += r.reportsClosed;
      summary.flags_created += r.flagsCreated;
      summary.pushes_sent += r.pushesSent;
    }

    console.log("[stale-cron] done", summary);
    return new Response(JSON.stringify({ success: true, ...summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[stale-cron] error", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
