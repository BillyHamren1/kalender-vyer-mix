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
// Workdays open longer than this are FLAGGED (signal_stale) but not closed.
// Telefon tyst / batterislut får inte ensamt stänga arbetsdagen.
const WORKDAY_STALE_HOURS = 18;
// Workdays open longer than this are considered ABANDONED (no realistic
// shift lasts this long) and are force-closed by the watchdog. Cap = +10h.
const WORKDAY_ABANDONED_HOURS = 36;
// Active time registrations open longer than this are force-stopped.
// Längsta möjliga riktiga pass + säkerhetsmarginal.
const ACTIVE_REG_ABANDONED_HOURS = 24;
const WORKDAY_FALLBACK_DURATION_HOURS = 10;

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
      .update({
        exited_at: exitedAt,
        total_minutes: totalMinutes,
        stop_source: 'watchdog_auto_close',
        stop_reason: 'stale_timer_closed',
        stopped_by: 'system:close-stale-workday-entries',
        stop_metadata: { exited_at: exitedAt, planned_end: plannedEnd, provisional_hours: PROVISIONAL_DURATION_HOURS },
      })
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

  // ── D. workdays open and stale (>18h) — FLAG-ONLY (no auto-close) ──
  //
  // POLICY (2026-05-07): Saknad GPS eller tyst telefon får ALDRIG ensam
  // stänga arbetsdagen. Tidigare stängde denna sektion `workdays.ended_at`
  // automatiskt när raden låg öppen >18h, vilket triggades av t.ex. avstängd
  // telefon, batterislut eller stale location. Det skapade glapp/avdrag som
  // användaren aldrig orsakat.
  //
  // Ny regel:
  //   • Stäng INTE workday automatiskt
  //   • Skapa INTE glapp / ej-lönegrundande lucka
  //   • Dra INTE av tid
  //   • Markera ENDAST `signal_stale` via workday_flag (needs_user_input)
  //
  // Workday stängs bara av användaren själv (EOD-flow), av admin manuellt,
  // eller av en explicit hård aktivitetshändelse — aldrig av tyst telefon.
  let workdaysClosed = 0; // kept in summary for backwards compat — always 0
  const workdayHorizonIso = new Date(
    now.getTime() - WORKDAY_STALE_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const { data: openWorkdays } = await supabase
    .from("workdays")
    .select("id, staff_id, started_at")
    .eq("organization_id", organizationId)
    .is("ended_at", null)
    .lt("started_at", workdayHorizonIso);

  for (const wd of openWorkdays || []) {
    const dateStr = wd.started_at.slice(0, 10);

    // Idempotent — only one signal_stale flag per (staff, date).
    const { data: existingFlag } = await supabase
      .from("workday_flags")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("staff_id", wd.staff_id)
      .eq("flag_date", dateStr)
      .eq("flag_type", "signal_stale")
      .limit(1);
    if (existingFlag && existingFlag.length > 0) continue;

    await supabase.from("workday_flags").insert({
      organization_id: organizationId,
      staff_id: wd.staff_id,
      flag_type: "signal_stale",
      severity: "info",
      flag_date: dateStr,
      title: "Vi tappade kontakten med din telefon",
      description:
        "Din arbetsdag är fortfarande öppen och vi har inte fått några signaler på ett tag. Öppna appen så fortsätter vi där vi släppte — ingen tid har dragits av.",
      needs_user_input: true,
      resolution_source: null,
      context: {
        reason: "signal_stale_workday_open",
        workday_id: wd.id,
        last_seen_iso: wd.started_at,
        affected_entries: [],
        time_deducted_minutes: 0,
      },
    });
    flagsCreated++;
    staffWithClosure.add(wd.staff_id);
  }

  // ── F. workdays ABANDONED (>36h) — force-close ──
  //
  // Tyst telefon ska bara FLAGGAS (sektion D). Men en workday som varit
  // öppen >36h är inte längre en pågående arbetsdag — det är en spökrad
  // som annars fortsätter rulla i dagar och förorenar
  // /staff-management/time-reports. Vi stänger den hårt och clampar
  // ended_at till started_at + 10h (men aldrig i framtiden).
  let abandonedWorkdaysClosed = 0;
  const abandonedWorkdayIso = new Date(
    now.getTime() - WORKDAY_ABANDONED_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const { data: abandonedWorkdays } = await supabase
    .from("workdays")
    .select("id, staff_id, started_at, notes, metadata")
    .eq("organization_id", organizationId)
    .is("ended_at", null)
    .lt("started_at", abandonedWorkdayIso);

  for (const wd of abandonedWorkdays || []) {
    const startedMs = new Date(wd.started_at).getTime();
    const cap = new Date(
      Math.min(now.getTime(), startedMs + WORKDAY_FALLBACK_DURATION_HOURS * 60 * 60 * 1000),
    ).toISOString();
    const { error } = await supabase
      .from("workdays")
      .update({
        ended_at: cap,
        ended_by: "system_stale_watchdog",
        review_status: "needs_review",
        notes:
          (wd.notes ? wd.notes + " | " : "") +
          `[auto-closed by watchdog: open > ${WORKDAY_ABANDONED_HOURS}h]`,
        metadata: {
          ...(wd.metadata || {}),
          autoClosedByWatchdog: true,
          autoClosedAt: now.toISOString(),
          autoClosedReason: `workday_open_more_than_${WORKDAY_ABANDONED_HOURS}h`,
          autoClosedSource: "close-stale-workday-entries",
          originalStartedAt: wd.started_at,
        },
      })
      .eq("id", wd.id)
      .is("ended_at", null);
    if (error) {
      console.error(`[stale-cron] workdays abandoned ${wd.id} update failed`, error.message);
      continue;
    }
    abandonedWorkdaysClosed++;
    staffWithClosure.add(wd.staff_id);
  }

  // ── G. active_time_registrations ABANDONED (>24h) — force-stop ──
  //
  // Aktiva timer-registreringar som varit öppna >24h är spökrader som
  // hindrar nya starter och fortsätter visa staff som "pågående" i
  // admin-vyn. Stäng dem och markera tydligt.
  let abandonedActiveRegsClosed = 0;
  const abandonedActiveRegIso = new Date(
    now.getTime() - ACTIVE_REG_ABANDONED_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const { data: abandonedActiveRegs } = await supabase
    .from("active_time_registrations")
    .select("id, staff_id, started_at, metadata")
    .eq("organization_id", organizationId)
    .or("stopped_at.is.null,status.eq.active")
    .lt("started_at", abandonedActiveRegIso);

  for (const reg of abandonedActiveRegs || []) {
    const { error } = await supabase
      .from("active_time_registrations")
      .update({
        status: "stopped",
        stopped_at: now.toISOString(),
        stop_source: "system_stale_watchdog",
        stopped_by: "system_stale_watchdog",
        metadata: {
          ...(reg.metadata || {}),
          autoStoppedByWatchdog: true,
          autoStoppedAt: now.toISOString(),
          autoStoppedReason: `active_timer_open_more_than_${ACTIVE_REG_ABANDONED_HOURS}h`,
          autoStoppedSource: "close-stale-workday-entries",
          originalStartedAt: reg.started_at,
        },
        updated_at: now.toISOString(),
      })
      .eq("id", reg.id);
    if (error) {
      console.error(`[stale-cron] active_time_registrations ${reg.id} update failed`, error.message);
      continue;
    }
    abandonedActiveRegsClosed++;
    staffWithClosure.add(reg.staff_id);
  }

  // ── H. Morning push to affected staff ──
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

  return {
    locationClosed,
    travelClosed,
    reportsClosed,
    workdaysClosed,
    abandonedWorkdaysClosed,
    abandonedActiveRegsClosed,
    flagsCreated,
    pushesSent,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKFILL MODE — admin-triggered cleanup of stale `location_time_entries`.
//
// For every open row whose `entered_at` is older than `min_age_minutes`
// (default 30), look at the staff's GPS pings AFTER `entered_at` and find
// the first sustained "outside" window (>=outside_min_minutes contiguous
// pings >= outside_distance_m from target). Close at the first ping of
// that outside window. If no pings exist, close at `entered_at + 8h`
// (clamped to end-of-day) and mark `stop_reason='backfill_no_pings'`.
//
// Idempotent (only updates rows still NULL). Per-org. dry_run supported.
// ─────────────────────────────────────────────────────────────────────────────
const BACKFILL_MIN_AGE_MIN = 30;
const BACKFILL_OUTSIDE_MIN_M = 150;
const BACKFILL_OUTSIDE_MIN_MIN = 30;

async function processBackfillForOrg(
  supabase: any,
  organizationId: string,
  opts: { dry_run?: boolean; min_age_minutes?: number } = {},
) {
  const minAge = opts.min_age_minutes ?? BACKFILL_MIN_AGE_MIN;
  const olderThanIso = new Date(Date.now() - minAge * 60 * 1000).toISOString();

  const { data: open, error } = await supabase
    .from("location_time_entries")
    .select("id, staff_id, location_id, entered_at, entry_date")
    .eq("organization_id", organizationId)
    .is("exited_at", null)
    .lt("entered_at", olderThanIso);
  if (error) throw error;

  const planned: Array<{
    id: string; staff_id: string; entered_at: string;
    exited_at: string; total_minutes: number;
    stop_reason: string;
  }> = [];

  for (const row of open || []) {
    // Resolve target coords
    const { data: loc } = await supabase
      .from("organization_locations")
      .select("latitude, longitude")
      .eq("id", row.location_id)
      .maybeSingle();

    let exitedAt: string | null = null;
    let stopReason = "backfill_no_pings";

    if (loc?.latitude != null && loc?.longitude != null) {
      const { data: pings } = await supabase
        .from("staff_location_history")
        .select("lat, lng, recorded_at")
        .eq("staff_id", row.staff_id)
        .eq("organization_id", organizationId)
        .gte("recorded_at", row.entered_at)
        .order("recorded_at", { ascending: true })
        .limit(2000);

      // Walk pings; find first contiguous outside window >= 30 min.
      let runStart: string | null = null;
      let runStartMs = 0;
      for (const p of pings || []) {
        const dist = distMeters(
          { lat: Number(loc.latitude), lng: Number(loc.longitude) },
          { lat: Number(p.lat), lng: Number(p.lng) },
        );
        const outside = dist >= BACKFILL_OUTSIDE_MIN_M;
        const tMs = new Date(p.recorded_at).getTime();
        if (outside) {
          if (!runStart) {
            runStart = p.recorded_at;
            runStartMs = tMs;
          } else if (tMs - runStartMs >= BACKFILL_OUTSIDE_MIN_MIN * 60 * 1000) {
            exitedAt = runStart;
            stopReason = "backfill_stale_no_return_30m";
            break;
          }
        } else {
          runStart = null;
          runStartMs = 0;
        }
      }
    }

    if (!exitedAt) {
      // No qualifying outside window — fall back to entered_at + 8h, clamped.
      exitedAt = clampAutoCloseEnd(
        row.entered_at,
        row.entry_date,
        PROVISIONAL_DURATION_HOURS,
        null,
      );
    }

    const totalMinutes = Math.max(
      0,
      Math.round(
        (new Date(exitedAt).getTime() - new Date(row.entered_at).getTime()) / 60000,
      ),
    );
    planned.push({
      id: row.id,
      staff_id: row.staff_id,
      entered_at: row.entered_at,
      exited_at: exitedAt,
      total_minutes: totalMinutes,
      stop_reason: stopReason,
    });
  }

  if (opts.dry_run) {
    return { planned, closed: 0, dry_run: true };
  }

  let closed = 0;
  for (const p of planned) {
    const { error: updErr } = await supabase
      .from("location_time_entries")
      .update({
        exited_at: p.exited_at,
        total_minutes: p.total_minutes,
        stop_source: "admin_backfill",
        stop_reason: p.stop_reason,
        stopped_by: "system:backfill",
        stop_metadata: {
          mode: "backfill",
          min_age_minutes: minAge,
          outside_distance_m: BACKFILL_OUTSIDE_MIN_M,
          outside_min_minutes: BACKFILL_OUTSIDE_MIN_MIN,
        },
      })
      .eq("id", p.id)
      .is("exited_at", null);
    if (!updErr) closed++;
    else console.error(`[backfill] ${p.id} failed`, updErr.message);
  }

  return { planned, closed, dry_run: false };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Two auth modes:
  //   • cron secret in `x-cron-secret` (default nightly run)
  //   • admin user via Bearer JWT (manual backfill from AdminTimeReview)
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedCron = Deno.env.get("CRON_SECRET");
  const authHeader = req.headers.get("Authorization") || "";
  const isCron = !!expectedCron && cronSecret === expectedCron;

  // Parse body early so we can branch on mode.
  let body: any = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { body = {}; }
  }
  const mode: string = body?.mode || "cron";

  let adminOrgId: string | null = null;
  let adminUserId: string | null = null;

  if (!isCron) {
    // Verify admin JWT
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userRes, error: uerr } = await adminClient.auth.getUser(token);
    if (uerr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    adminUserId = userRes.user.id;
    // Resolve org + admin role
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("organization_id, role")
      .eq("user_id", adminUserId);
    const adminRow = (roles || []).find((r: any) => r.role === "admin" || r.role === "super_admin");
    if (!adminRow) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    adminOrgId = adminRow.organization_id;
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    if (mode === "backfill") {
      if (!adminOrgId) {
        return new Response(JSON.stringify({ error: "admin_required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const result = await processBackfillForOrg(supabase, adminOrgId, {
        dry_run: !!body?.dry_run,
        min_age_minutes: body?.min_age_minutes,
      });
      console.log("[backfill] done", { org: adminOrgId, ...result, by: adminUserId });
      return new Response(JSON.stringify({ success: true, mode: "backfill", ...result }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: orgs, error: orgErr } = await supabase
      .from("organizations")
      .select("id");
    if (orgErr) throw orgErr;

    const summary = {
      orgs_processed: 0,
      location_closed: 0,
      travel_closed: 0,
      reports_closed: 0,
      workdays_closed: 0,
      abandoned_workdays_closed: 0,
      abandoned_active_regs_closed: 0,
      flags_created: 0,
      pushes_sent: 0,
    };

    for (const org of orgs || []) {
      const r = await processOrganization(supabase, org.id);
      summary.orgs_processed++;
      summary.location_closed += r.locationClosed;
      summary.travel_closed += r.travelClosed;
      summary.reports_closed += r.reportsClosed;
      summary.workdays_closed += r.workdaysClosed;
      summary.abandoned_workdays_closed += r.abandonedWorkdaysClosed;
      summary.abandoned_active_regs_closed += r.abandonedActiveRegsClosed;
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
