// dayKnownSites (Deno port of src/hooks/useDayKnownSites.ts)
// ===========================================================
// Single source of truth for "kända platser" for ONE staff on ONE date.
// Mirrors the frontend selection logic 1:1 so server-built snapshots and
// client-built map agree byte-for-byte.
//
// LOCKED CONTRACT — see mem://constraints/known-sites-date-bound-v1.
// Do NOT widen the projects/large_projects/bookings selection to "all in org".
// A geofence may only appear here if the staff has a real link to it for the
// given date (TR, LTE, BSA, or calendar_event via staff_assignments team).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { GeofenceRow } from "./snapshotCache.ts";

export interface DayKnownSitesResult {
  geofences: GeofenceRow[];
  privateGeofenceIds: string[];
}

export async function loadDayKnownSites(
  admin: SupabaseClient,
  opts: { staffId: string; date: string; organizationId: string },
): Promise<DayKnownSitesResult> {
  const { staffId, date, organizationId } = opts;
  const geofences: GeofenceRow[] = [];
  const privateGeofenceIds: string[] = [];

  // 1) Organization locations (warehouses, offices, residences) — always in.
  const locsRes = await admin
    .from("organization_locations")
    .select(
      "id, name, latitude, longitude, radius_meters, geofence_mode, geofence_polygon, is_private_residence",
    )
    .eq("organization_id", organizationId)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .limit(2000);
  for (const r of (locsRes.data ?? []) as any[]) {
    const id = `loc:${r.id}`;
    geofences.push({
      id,
      name: String(r.name ?? "Plats"),
      lat: Number(r.latitude),
      lng: Number(r.longitude),
      radiusMeters: Number(r.radius_meters ?? 75),
      polygon: r.geofence_mode === "polygon" ? r.geofence_polygon : undefined,
    });
    if (r.is_private_residence) privateGeofenceIds.push(id);
  }

  // 2) Per-day staff links → booking_ids + large_project_ids.
  const [teamRes, bsaRes, trRes, lteRes] = await Promise.all([
    admin.from("staff_assignments")
      .select("team_id")
      .eq("staff_id", staffId)
      .eq("assignment_date", date),
    admin.from("booking_staff_assignments")
      .select("booking_id")
      .eq("staff_id", staffId)
      .eq("assignment_date", date),
    admin.from("time_reports")
      .select("booking_id, large_project_id")
      .eq("staff_id", staffId)
      .eq("report_date", date),
    admin.from("location_time_entries")
      .select("booking_id, large_project_id")
      .eq("staff_id", staffId)
      .eq("entry_date", date),
  ]);

  const teamIds = Array.from(
    new Set(((teamRes.data ?? []) as any[]).map((r) => String(r.team_id)).filter(Boolean)),
  );
  const bookingIds = new Set<string>();
  const largeIds = new Set<string>();
  for (const r of (bsaRes.data ?? []) as any[]) {
    if (r.booking_id) bookingIds.add(String(r.booking_id));
  }
  for (const r of (trRes.data ?? []) as any[]) {
    if (r.booking_id) bookingIds.add(String(r.booking_id));
    if (r.large_project_id) largeIds.add(String(r.large_project_id));
  }
  for (const r of (lteRes.data ?? []) as any[]) {
    if (r.booking_id) bookingIds.add(String(r.booking_id));
    if (r.large_project_id) largeIds.add(String(r.large_project_id));
  }

  // 3) calendar_events for this person's teams that day → more booking_ids.
  if (teamIds.length) {
    const dayStartIso = `${date}T00:00:00.000Z`;
    const dayEndIso = `${date}T23:59:59.999Z`;
    const evRes = await admin
      .from("calendar_events")
      .select("booking_id, start_time, end_time, source_date")
      .in("resource_id", teamIds)
      .or(
        `source_date.eq.${date},and(start_time.lte.${dayEndIso},end_time.gte.${dayStartIso})`,
      );
    for (const e of (evRes.data ?? []) as any[]) {
      if (e.booking_id) bookingIds.add(String(e.booking_id));
    }
  }

  // 4) Resolve bookings → project / large_project memberships + pin fallback.
  //    LOCKED: bokningar i status OFFER/CANCELLED/UTKAST/AVBOKAD räknas
  //    INTE som arbete för dagen. De får varken bidra med egen pin eller
  //    dra in sina assigned_project_id/large_project_id som geofence.
  //    Se mem://constraints/known-sites-date-bound-v1.
  const INACTIVE_BOOKING_STATUSES = new Set([
    "OFFER", "OFFERT", "DRAFT", "UTKAST",
    "CANCELLED", "AVBOKAD", "AVBOKAT",
  ]);
  const projectIds = new Set<string>();
  const extraLargeIds = new Set<string>();
  if (bookingIds.size) {
    const [bookingsRes, lpbRes] = await Promise.all([
      admin.from("bookings")
        .select(
          "id, client, booking_number, deliveryaddress, delivery_latitude, delivery_longitude, large_project_id, assigned_project_id, status",
        )
        .in("id", [...bookingIds]),
      admin.from("large_project_bookings")
        .select("large_project_id, booking_id")
        .in("booking_id", [...bookingIds]),
    ]);
    const activeBookingIds = new Set<string>();
    for (const b of (bookingsRes.data ?? []) as any[]) {
      const status = String(b.status ?? "").trim().toUpperCase().replace(/[!.,:;]+$/g, "");
      if (INACTIVE_BOOKING_STATUSES.has(status)) continue;
      activeBookingIds.add(String(b.id));
    }
    for (const row of (lpbRes.data ?? []) as any[]) {
      if (!row.large_project_id) continue;
      if (row.booking_id && !activeBookingIds.has(String(row.booking_id))) continue;
      largeIds.add(String(row.large_project_id));
    }
    for (const b of (bookingsRes.data ?? []) as any[]) {
      if (!activeBookingIds.has(String(b.id))) continue;
      if (b.large_project_id) extraLargeIds.add(String(b.large_project_id));
      if (b.assigned_project_id) projectIds.add(String(b.assigned_project_id));
      if (b.delivery_latitude == null || b.delivery_longitude == null) continue;
      // Dedupe: skip booking pin when project/large project pin will appear.
      if (b.assigned_project_id || b.large_project_id) continue;
      const label = b.booking_number
        ? `${b.booking_number} · ${b.client ?? "Bokning"}`
        : (b.client ?? b.deliveryaddress ?? "Bokning");
      geofences.push({
        id: `booking:${b.id}`,
        name: String(label),
        lat: Number(b.delivery_latitude),
        lng: Number(b.delivery_longitude),
        radiusMeters: 200,
      });
    }
    // Smalna ner: downstream booking-baserade projekt-uppslag använder bara aktiva.
    bookingIds.clear();
    for (const id of activeBookingIds) bookingIds.add(id);
  }

  // 5) Large projects (only those discovered above).
  const allLargeIds = new Set<string>([...largeIds, ...extraLargeIds]);
  if (allLargeIds.size) {
    const lpRes = await admin
      .from("large_projects")
      .select(
        "id, name, address_latitude, address_longitude, address_radius_meters, address_geofence_mode, address_geofence_polygon",
      )
      .in("id", [...allLargeIds]);
    const seen = new Set<string>();
    for (const lp of (lpRes.data ?? []) as any[]) {
      if (seen.has(lp.id)) continue;
      seen.add(lp.id);
      if (lp.address_latitude == null || lp.address_longitude == null) continue;
      geofences.push({
        id: `large:${lp.id}`,
        name: String(lp.name ?? "Stort projekt"),
        lat: Number(lp.address_latitude),
        lng: Number(lp.address_longitude),
        radiusMeters: Number(lp.address_radius_meters ?? 200) || 200,
        polygon: lp.address_geofence_mode === "polygon" ? lp.address_geofence_polygon : undefined,
      });
    }
  }

  // 6) Projects (by booking link OR explicit assigned_project_id). Filtered
  //    on deleted_at IS NULL + status != cancelled. NEVER hela orgen.
  if (bookingIds.size || projectIds.size) {
    const [pByBookingRes, pByIdRes] = await Promise.all([
      bookingIds.size
        ? admin.from("projects")
            .select(
              "id, name, delivery_latitude, delivery_longitude, address_radius_meters, address_geofence_mode, address_geofence_polygon, status, planning_status, deleted_at, booking_id",
            )
            .in("booking_id", [...bookingIds])
            .is("deleted_at", null)
        : Promise.resolve({ data: [] as any[] }),
      projectIds.size
        ? admin.from("projects")
            .select(
              "id, name, delivery_latitude, delivery_longitude, address_radius_meters, address_geofence_mode, address_geofence_polygon, status, planning_status, deleted_at",
            )
            .in("id", [...projectIds])
            .is("deleted_at", null)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const seen = new Set<string>();
    const rows = [
      ...(((pByBookingRes as any).data ?? []) as any[]),
      ...(((pByIdRes as any).data ?? []) as any[]),
    ];
    for (const p of rows) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      if (p.delivery_latitude == null || p.delivery_longitude == null) continue;
      const status = String(p.planning_status ?? p.status ?? "").toLowerCase();
      if (status === "cancelled" || status === "avbokat") continue;
      geofences.push({
        id: `project:${p.id}`,
        name: String(p.name ?? "Projekt"),
        lat: Number(p.delivery_latitude),
        lng: Number(p.delivery_longitude),
        radiusMeters: Number(p.address_radius_meters ?? 150) || 150,
        polygon: p.address_geofence_mode === "polygon" ? p.address_geofence_polygon : undefined,
      });
    }
  }

  return { geofences, privateGeofenceIds };
}
