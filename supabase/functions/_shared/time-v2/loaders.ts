// Time v2 — shared loaders
// =============================================================================
// Hämtar pings + kända platser för Time v2-funktionerna.
// Aldrig läckande gammal time/timer/workday-logik.

import type { RawPingInput } from "../timeline/buildGpsDayTimelineOnly.ts";
import type { KnownPlace } from "../timeline/types.ts";

export async function loadKnownTargetsV2(
  admin: any,
  orgId: string,
): Promise<KnownPlace[]> {
  const [locsRes, projRes, largeRes] = await Promise.all([
    admin.from("organization_locations")
      .select("id, name, latitude, longitude, radius_meters, is_private_residence")
      .eq("organization_id", orgId)
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .limit(2000),
    admin.from("projects")
      .select("id, name, delivery_latitude, delivery_longitude, address_radius_meters, deleted_at")
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .not("delivery_latitude", "is", null)
      .not("delivery_longitude", "is", null)
      .limit(5000),
    admin.from("large_projects")
      .select("id, name, address_latitude, address_longitude, address_radius_meters")
      .eq("organization_id", orgId)
      .not("address_latitude", "is", null)
      .not("address_longitude", "is", null)
      .limit(2000),
  ]);

  const out: KnownPlace[] = [];
  for (const r of (locsRes.data ?? []) as any[]) {
    const isHome = r.is_private_residence === true;
    const rawName = String(r.name ?? (isHome ? "Boende" : "Plats"));
    const name = isHome && !/boende/i.test(rawName) ? `Boende ${rawName}` : rawName;
    out.push({
      id: String(r.id),
      type: isHome ? "home" : "location",
      name,
      lat: Number(r.latitude),
      lng: Number(r.longitude),
      radiusM: Math.max(isHome ? 15 : 20, Number(r.radius_meters ?? (isHome ? 50 : 75))),
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

export async function fetchPingsForDayV2(
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

export interface SubmissionSnapshot {
  hasSubmission: boolean;
  id: string | null;
  status: string;
  source: string | null;
  submittedAt: string | null;
  submittedBy: string | null;
  userComment: string | null;
  reviewComment: string | null;
  correctionRequestedAt: string | null;
  correctionRequestedBy: string | null;
  sourceSnapshotId: string | null;
  manualOverridesSummary: { count: number; appliedSegmentKeys: string[] } | null;
  canEdit: boolean;
  canSubmit: boolean;
  needsCorrection: boolean;
}

export async function loadSubmission(
  admin: any,
  orgId: string,
  staffId: string,
  date: string,
): Promise<SubmissionSnapshot> {
  const { data } = await admin
    .from("staff_day_submissions")
    .select(
      "id, status, source, submitted_at, submitted_by, comment, review_comment, " +
      "correction_requested_at, correction_requested_by, source_snapshot_id, " +
      "submitted_payload_json"
    )
    .eq("organization_id", orgId)
    .eq("staff_id", staffId)
    .eq("date", date)
    .maybeSingle();

  if (!data) {
    return {
      hasSubmission: false,
      id: null,
      status: "not_submitted",
      source: null,
      submittedAt: null,
      submittedBy: null,
      userComment: null,
      reviewComment: null,
      correctionRequestedAt: null,
      correctionRequestedBy: null,
      sourceSnapshotId: null,
      manualOverridesSummary: null,
      canEdit: true,
      canSubmit: true,
      needsCorrection: false,
    };
  }

  const status = String((data as any).status ?? "submitted");
  const isLocked = status === "approved" || status === "payroll_approved";
  const needsCorrection = status === "correction_requested";

  const payload = (data as any).submitted_payload_json as any;
  const manualOverridesSummary = payload?.manualOverridesSummary
    ? {
        count: Number(payload.manualOverridesSummary.count ?? 0),
        appliedSegmentKeys: Array.isArray(payload.manualOverridesSummary.appliedSegmentKeys)
          ? payload.manualOverridesSummary.appliedSegmentKeys
          : [],
      }
    : null;

  return {
    hasSubmission: true,
    id: String((data as any).id),
    status,
    source: (data as any).source ?? null,
    submittedAt: (data as any).submitted_at ?? null,
    submittedBy: (data as any).submitted_by ?? null,
    userComment: (data as any).comment ?? null,
    reviewComment: (data as any).review_comment ?? null,
    correctionRequestedAt: (data as any).correction_requested_at ?? null,
    correctionRequestedBy: (data as any).correction_requested_by ?? null,
    sourceSnapshotId: (data as any).source_snapshot_id ?? null,
    manualOverridesSummary,
    canEdit: !isLocked,
    canSubmit: !isLocked,
    needsCorrection,
  };
}

export interface SubmissionMessage {
  id: string;
  authorRole: "staff" | "admin" | "system";
  authorId: string | null;
  body: string;
  createdAt: string;
}

export async function loadMessages(
  admin: any,
  orgId: string,
  staffId: string,
  date: string,
  limit = 20,
): Promise<SubmissionMessage[]> {
  const { data } = await admin
    .from("staff_day_submission_messages")
    .select("id, author_role, author_id, body, created_at")
    .eq("organization_id", orgId)
    .eq("staff_id", staffId)
    .eq("date", date)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as any[]).reverse().map((m) => ({
    id: String(m.id),
    authorRole: (m.author_role ?? "system") as SubmissionMessage["authorRole"],
    authorId: m.author_id ?? null,
    body: String(m.body ?? ""),
    createdAt: String(m.created_at),
  }));
}

export function readManualOverridesFromSubmission(
  submission: SubmissionSnapshot,
  payload: any,
): Array<{ segmentKey: string; startIso: string | null; endIso: string | null; reason: string | null }> {
  if (!submission.hasSubmission) return [];
  const segs = Array.isArray(payload?.segments) ? payload.segments : [];
  const out: Array<{ segmentKey: string; startIso: string | null; endIso: string | null; reason: string | null }> = [];
  for (const s of segs) {
    if (!s?.manualOverride?.hasOverride) continue;
    out.push({
      segmentKey: String(s.segmentKey ?? ""),
      startIso: s.currentStartTime ?? null,
      endIso: s.currentEndTime ?? null,
      reason: s.manualOverride.reason ?? null,
    });
  }
  return out;
}

// =========================================================================
// Manual report targets — vad användaren själv kan välja att fördela
// manuell tid på för EN dag. Aldrig auto-vald av systemet, bara förslag.
// =========================================================================
export type ManualTargetType =
  | "booking"
  | "project"
  | "large_project"
  | "location"
  | "other";

export interface ManualReportTarget {
  targetType: ManualTargetType;
  targetId: string | null;
  label: string;
  subtitle: string | null;
  booking_id?: string | null;
  project_id?: string | null;
  large_project_id?: string | null;
  location_id?: string | null;
}

export interface ManualReportTargets {
  assignedTargets: ManualReportTarget[];
  locationTargets: ManualReportTarget[];
  searchableTargets: ManualReportTarget[];
}

const INACTIVE_BOOKING_STATUSES = new Set([
  "OFFER", "OFFERT", "DRAFT", "UTKAST",
  "CANCELLED", "AVBOKAD", "AVBOKAT",
]);

/**
 * Returnerar förslag (snabbval) per dag för manuell tidrapportering.
 * Visar bara faktiska kopplingar — auto-väljer aldrig.
 */
export async function loadManualReportTargetsForDay(
  admin: any,
  orgId: string,
  staffId: string,
  date: string,
): Promise<ManualReportTargets> {
  const assignedTargets: ManualReportTarget[] = [];
  const locationTargets: ManualReportTarget[] = [];
  const searchableTargets: ManualReportTarget[] = [];

  // 1) Hämta vilka bookings/large_projects/projects som personen är knuten
  //    till denna dag via staff_assignments × calendar_events
  //    + booking_staff_assignments direkt.
  const [teamRes, bsaRes] = await Promise.all([
    admin.from("staff_assignments")
      .select("team_id")
      .eq("staff_id", staffId)
      .eq("assignment_date", date),
    admin.from("booking_staff_assignments")
      .select("booking_id")
      .eq("staff_id", staffId)
      .eq("assignment_date", date),
  ]);

  const teamIds = Array.from(
    new Set(((teamRes.data ?? []) as any[]).map((r) => String(r.team_id)).filter(Boolean)),
  );
  const bookingIds = new Set<string>();
  for (const r of (bsaRes.data ?? []) as any[]) {
    if (r.booking_id) bookingIds.add(String(r.booking_id));
  }

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

  // 2) Bokningar → ev. projekt/large_project + label
  const projectIds = new Set<string>();
  const largeIds = new Set<string>();
  if (bookingIds.size) {
    const [bookingsRes, lpbRes] = await Promise.all([
      admin.from("bookings")
        .select("id, client, booking_number, deliveryaddress, large_project_id, assigned_project_id, status")
        .in("id", [...bookingIds]),
      admin.from("large_project_bookings")
        .select("large_project_id, booking_id")
        .in("booking_id", [...bookingIds]),
    ]);

    const activeBookings: any[] = [];
    for (const b of (bookingsRes.data ?? []) as any[]) {
      const status = String(b.status ?? "").trim().toUpperCase().replace(/[!.,:;]+$/g, "");
      if (INACTIVE_BOOKING_STATUSES.has(status)) continue;
      activeBookings.push(b);
      if (b.assigned_project_id) projectIds.add(String(b.assigned_project_id));
      if (b.large_project_id) largeIds.add(String(b.large_project_id));
    }
    for (const row of (lpbRes.data ?? []) as any[]) {
      if (row.large_project_id) largeIds.add(String(row.large_project_id));
    }

    // Lägg in large_projects FÖRST (mer specifika), sedan bokningar utan LP.
    if (largeIds.size) {
      const lpRes = await admin
        .from("large_projects")
        .select("id, name")
        .in("id", [...largeIds]);
      for (const lp of (lpRes.data ?? []) as any[]) {
        assignedTargets.push({
          targetType: "large_project",
          targetId: String(lp.id),
          label: String(lp.name ?? "Stort projekt"),
          subtitle: "Stort projekt",
          large_project_id: String(lp.id),
        });
      }
    }

    if (projectIds.size) {
      const pRes = await admin
        .from("projects")
        .select("id, name, status, planning_status, deleted_at")
        .in("id", [...projectIds])
        .is("deleted_at", null);
      for (const p of (pRes.data ?? []) as any[]) {
        const status = String(p.planning_status ?? p.status ?? "").toLowerCase();
        if (status === "cancelled" || status === "avbokat") continue;
        assignedTargets.push({
          targetType: "project",
          targetId: String(p.id),
          label: String(p.name ?? "Projekt"),
          subtitle: "Projekt",
          project_id: String(p.id),
        });
      }
    }

    // Bokningar som varken har project eller large_project — exponera bokningen
    for (const b of activeBookings) {
      if (b.assigned_project_id || b.large_project_id) continue;
      const label = b.booking_number
        ? `${b.booking_number}${b.client ? ` · ${b.client}` : ""}`
        : (b.client ?? b.deliveryaddress ?? "Bokning");
      assignedTargets.push({
        targetType: "booking",
        targetId: String(b.id),
        label: String(label),
        subtitle: b.deliveryaddress ?? "Bokning",
        booking_id: String(b.id),
      });
    }
  }

  // 3) Locations (lager/kontor/arbetsplats — inte privat boende)
  const locsRes = await admin
    .from("organization_locations")
    .select("id, name, is_private_residence, location_type")
    .eq("organization_id", orgId)
    .or("is_private_residence.is.null,is_private_residence.eq.false")
    .order("name", { ascending: true })
    .limit(200);
  for (const r of (locsRes.data ?? []) as any[]) {
    if (r.is_private_residence === true) continue;
    locationTargets.push({
      targetType: "location",
      targetId: String(r.id),
      label: String(r.name ?? "Plats"),
      subtitle: r.location_type ? String(r.location_type) : "Plats",
      location_id: String(r.id),
    });
  }

  // 4) Searchable targets — förberedd för senare; tom i v1.
  return { assignedTargets, locationTargets, searchableTargets };
}
