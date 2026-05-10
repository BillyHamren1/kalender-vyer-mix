// Fetch all raw rows needed by buildDayRangeSnapshots for [startDate, endDate].
// Used by month/period endpoints so they share the same source data with
// get-staff-day-status (no separate aggregation paths).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { RangeRows } from "./day-snapshot-range.ts";
import { getStockholmDayWindowUtc } from "./stockholmDayWindow.ts";

export async function fetchRangeRows(
  admin: SupabaseClient,
  orgId: string,
  staffId: string,
  startDate: string,
  endDate: string,
): Promise<{ ok: true; rows: RangeRows } | { ok: false; error: string }> {
  // Range-fönster i Europe/Stockholm. Alla timestamptz-frågor använder
  // [rangeStart, rangeEnd] (Stockholm), *_date-kolumner använder startDate/endDate.
  const rangeStart = getStockholmDayWindowUtc(startDate).startUtc;
  const rangeEnd = getStockholmDayWindowUtc(endDate).endUtc;

  const [
    workdayRes,
    timeReportsRes,
    travelRes,
    locRes,
    flagsRes,
    eventsRes,
    attestationRes,
  ] = await Promise.all([
    admin.from("workdays")
      .select("id, staff_id, started_at, ended_at, review_status, review_reasons, approved_at, admin_note, metadata")
      .eq("organization_id", orgId).eq("staff_id", staffId)
      // Overlap mot range: started_at <= rangeEnd AND (ended_at IS NULL OR ended_at >= rangeStart)
      .lte("started_at", rangeEnd)
      .or(`ended_at.is.null,ended_at.gte.${rangeStart}`)
      .order("started_at", { ascending: true }),
    admin.from("time_reports")
      .select("id, staff_id, booking_id, large_project_id, report_date, start_time, end_time, hours_worked, break_time, description, approved, source, source_entry_id")
      .eq("organization_id", orgId).eq("staff_id", staffId)
      .gte("report_date", startDate).lte("report_date", endDate),
    admin.from("travel_time_logs")
      .select("id, staff_id, start_time, end_time, hours_worked, from_address, to_address, destination_booking_id, related_booking_id, manual_project_name, classification, approved, needs_review, description")
      .eq("organization_id", orgId).eq("staff_id", staffId)
      // Overlap: start_time <= rangeEnd AND (end_time IS NULL OR end_time >= rangeStart)
      .lte("start_time", rangeEnd)
      .or(`end_time.is.null,end_time.gte.${rangeStart}`),
    admin.from("location_time_entries")
      .select("id, staff_id, location_id, booking_id, large_project_id, task_id, entry_date, entered_at, exited_at, total_minutes, source, metadata")
      .eq("organization_id", orgId).eq("staff_id", staffId)
      .gte("entry_date", startDate).lte("entry_date", endDate),
    admin.from("workday_flags")
      .select("id, staff_id, flag_type, severity, flag_date, title, description, needs_user_input, resolved, context")
      .eq("organization_id", orgId).eq("staff_id", staffId)
      .gte("flag_date", startDate).lte("flag_date", endDate),
    admin.from("assistant_events")
      .select("id, staff_id, event_type, target_type, target_id, target_label, happened_at, resolution_status, stale_for_prompt")
      .eq("organization_id", orgId).eq("staff_id", staffId)
      .gte("happened_at", rangeStart).lte("happened_at", rangeEnd)
      .order("happened_at", { ascending: true }),
    admin.from("day_attestations")
      .select("id, staff_id, date, break_minutes, comment, status, attested_at, attested_by, locked_at, locked_by")
      .eq("organization_id", orgId).eq("staff_id", staffId)
      .gte("date", startDate).lte("date", endDate),
  ]);

  const errs = [workdayRes, timeReportsRes, travelRes, locRes, flagsRes, eventsRes, attestationRes]
    .map((r) => r.error).filter(Boolean);
  if (errs.length) return { ok: false, error: errs.map((e) => e?.message).join("; ") };

  // Resolve display names for refs
  const trRows = timeReportsRes.data ?? [];
  const tlRows = travelRes.data ?? [];
  const leRows = locRes.data ?? [];
  const bookingIds = new Set<string>();
  const largeIds = new Set<string>();
  const locationIds = new Set<string>();
  for (const r of [...trRows, ...leRows] as Array<{ booking_id?: string | null; large_project_id?: string | null }>) {
    if (r.booking_id) bookingIds.add(r.booking_id);
    if (r.large_project_id) largeIds.add(r.large_project_id);
  }
  for (const r of tlRows as Array<{ destination_booking_id?: string | null }>) {
    if (r.destination_booking_id) bookingIds.add(r.destination_booking_id);
  }
  for (const r of leRows as Array<{ location_id?: string | null }>) {
    if (r.location_id) locationIds.add(r.location_id);
  }

  const [bn, ln, locn] = await Promise.all([
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

  const bookingNames: Record<string, string> = {};
  for (const b of (bn.data ?? []) as Array<{ id: string; project_name?: string; customer_name?: string; booking_number?: string }>) {
    const label = b.project_name || b.customer_name || b.booking_number || "";
    if (label) bookingNames[b.id] = label;
  }
  const largeNames: Record<string, string> = {};
  for (const l of (ln.data ?? []) as Array<{ id: string; project_name?: string; project_number?: string }>) {
    const label = l.project_name || l.project_number || "";
    if (label) largeNames[l.id] = label;
  }
  const locationNames: Record<string, { name: string; isWork: boolean }> = {};
  for (const l of (locn.data ?? []) as Array<{ id: string; name?: string; is_work_location?: boolean }>) {
    locationNames[l.id] = { name: l.name ?? "", isWork: !!l.is_work_location };
  }

  return {
    ok: true,
    rows: {
      workdays: (workdayRes.data ?? []) as RangeRows["workdays"],
      timeReports: trRows as RangeRows["timeReports"],
      travelLogs: tlRows as RangeRows["travelLogs"],
      locationEntries: leRows as RangeRows["locationEntries"],
      flags: (flagsRes.data ?? []) as RangeRows["flags"],
      assistantEvents: (eventsRes.data ?? []) as RangeRows["assistantEvents"],
      attestations: (attestationRes.data ?? []) as RangeRows["attestations"],
      nameMaps: { bookings: bookingNames, largeProjects: largeNames, locations: locationNames },
    },
  };
}
