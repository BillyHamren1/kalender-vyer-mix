// Time v2 — shared loaders
// =============================================================================
// Hämtar pings + kända platser för Time v2-funktionerna. Identisk teknik som
// get-mobile-staff-gps-day-suggestion men isolerad i egen modul så att Time v2
// aldrig läcker in gammal time/timer/workday-logik.

import type { RawPingInput } from "../timeline/buildGpsDayTimelineOnly.ts";
import type { KnownPlace } from "../timeline/types.ts";

export async function loadKnownTargetsV2(
  admin: any,
  orgId: string,
): Promise<KnownPlace[]> {
  const [locsRes, projRes, largeRes] = await Promise.all([
    admin.from("organization_locations")
      .select("id, name, latitude, longitude, radius_meters")
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
  status: string;          // not_submitted | submitted | correction_requested | approved | payroll_approved | edited | ai_flagged | needs_user_attention | needs_control | rejected | withdrawn
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
