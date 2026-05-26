// submit-mobile-gps-day-v2
// =============================================================================
// Time v2 — användaren skickar in dagen (GPS-förslag eller manuell rapport).
//
// Skriver till staff_day_submissions (delas med nya admin/attestflödet).
// Rör ALDRIG: time_reports, workdays, location_time_entries, travel_time_logs,
// staff_day_report_cache, report_candidate_blocks_json, display_blocks_json.
//
// Status-modell:
//   - approved / payroll_approved  → låst, blockerar (409) för icke-priv. user
//   - manualOverrides.length > 0 eller manualDay  → status = 'edited'
//   - annars                                        → status = 'submitted'

import { corsHeaders } from "../_shared/cors.ts";
import {
  authenticateStaffRequest,
  authorizeStaffAccess,
} from "../_shared/staff-auth.ts";
import {
  fetchPingsForDayV2,
  loadKnownTargetsV2,
} from "../_shared/time-v2/loaders.ts";
import {
  buildDayView,
  type ManualSegmentOverride,
} from "../_shared/time-v2/buildDayView.ts";

const TZ = "Europe/Stockholm";

type ManualTargetType = "booking" | "project" | "large_project" | "location" | "other";

interface ManualWorkTargetInput {
  targetType?: ManualTargetType;
  targetId?: string | null;
  label?: string | null;
  subtitle?: string | null;
  booking_id?: string | null;
  project_id?: string | null;
  large_project_id?: string | null;
  location_id?: string | null;
}

interface ManualWorkSegmentInput {
  id?: string;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  target?: ManualWorkTargetInput | null;
  comment?: string | null;
  sourceSegmentId?: string | null;
}

interface ManualDayInput {
  // Ny form: hela dagen + fördelning på block
  dayStartTime?: string;
  dayEndTime?: string;
  breakMinutes?: number;
  segments?: ManualWorkSegmentInput[];
  deletedSegmentIds?: string[];
  // Legacy fält (back-compat)
  startTime?: string;
  endTime?: string;
  comment?: string | null;
}

interface SubmitBody {
  staffId?: string;
  date?: string;
  userComment?: string | null;
  manualOverrides?: ManualSegmentOverride[];
  expectedSourceSnapshotId?: string | null;
  manualDay?: ManualDayInput | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^\d{2}:\d{2}$/;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Stockholm-lokal HH:MM:SS från ISO/UTC-tid. */
function stockholmTimeOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ, hour12: false,
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(new Date(t));
  return /^\d{2}:\d{2}:\d{2}$/.test(parts) ? parts : null;
}

/** Returnerar minutoffset från UTC för tidpunkten i Stockholm (oftast 60 eller 120). */
function stockholmOffsetMinutes(date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = dtf.formatToParts(date).reduce((a: any, p) => {
    a[p.type] = p.value; return a;
  }, {} as any);
  const hour = +parts.hour === 24 ? 0 : +parts.hour;
  const asUTC = Date.UTC(
    +parts.year, +parts.month - 1, +parts.day,
    hour, +parts.minute, +parts.second,
  );
  return Math.round((asUTC - date.getTime()) / 60000);
}

/** Bygger UTC-ISO från en Stockholm-lokal datum+tid (HH:mm). */
function stockholmLocalToUtcIso(dateStr: string, hhmm: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, m] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, m, 0);
  const off = stockholmOffsetMinutes(new Date(guess));
  let adjusted = guess - off * 60000;
  const off2 = stockholmOffsetMinutes(new Date(adjusted));
  if (off2 !== off) {
    adjusted = guess - off2 * 60000;
  }
  return new Date(adjusted).toISOString();
}

function fmtDuration(mins: number): string {
  if (mins <= 0) return "0h";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function mapSegmentsForDisplaySnapshot(segments: any[]): any[] {
  return (segments ?? []).map((s) => {
    const matchedKind = s.matched?.kind ?? null;
    const matchedId = s.matched?.id ?? null;
    const targetType: ManualTargetType =
      matchedKind === "booking" ? "booking" :
      matchedKind === "project" ? "project" :
      matchedKind === "large_project" ? "large_project" :
      matchedKind === "location" ? "location" : "other";
    return {
      id: s.segmentKey,
      segmentKey: s.segmentKey,
      start: s.currentStartTime,
      startedAt: s.currentStartTime,
      end: s.currentEndTime,
      endedAt: s.currentEndTime,
      label: s.label,
      type: s.type,
      kind: s.kind,
      minutes: s.durationMinutes,
      durationMinutes: s.durationMinutes,
      booking_id: matchedKind === "booking" ? matchedId : null,
      project_id: matchedKind === "project" ? matchedId : null,
      large_project_id: matchedKind === "large_project" ? matchedId : null,
      location_id: matchedKind === "location" ? matchedId : null,
      assignment_id: null,
      targetType,
      targetId: matchedId,
      warning: matchedKind == null && s.kind === "stay" ? "unmatched_gps_segment" : null,
      source: "mobile_gps_day_view_v2",
    };
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: SubmitBody;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const staffId = String(body.staffId ?? "").trim();
  const date = String(body.date ?? "").trim();
  if (!staffId) return json({ error: "staffId required" }, 400);
  if (!ISO_DATE.test(date)) return json({ error: "date must be YYYY-MM-DD" }, 400);

  const userComment = body.userComment ? String(body.userComment).slice(0, 4000) : null;
  const manualOverrides: ManualSegmentOverride[] = Array.isArray(body.manualOverrides)
    ? body.manualOverrides.filter((o) => o && typeof o.segmentKey === "string")
    : [];

  // ── Manuell dagrapport ──────────────────────────────────────
  // Modell: hela dagen (start/slut/rast) + en eller flera block (segments).
  // Varje block: id, startTime, endTime, target (krävs), comment, sourceSegmentId.
  // deletedSegmentIds = sourceSegmentId på GPS-förslag som användaren avvisat.
  interface NormalizedSegment {
    id: string;
    startTime: string;
    endTime: string;
    target: ManualWorkTargetInput;
    comment: string | null;
    sourceSegmentId: string | null;
  }
  interface NormalizedManualDay {
    dayStartTime: string;
    dayEndTime: string;
    breakMinutes: number;
    segments: NormalizedSegment[];
    deletedSegmentIds: string[];
    comment: string | null;
  }
  let manualDay: NormalizedManualDay | null = null;

  if (body.manualDay && typeof body.manualDay === "object") {
    const md = body.manualDay;
    const dayStart = String(md.dayStartTime ?? md.startTime ?? "").trim();
    const dayEnd = String(md.dayEndTime ?? md.endTime ?? "").trim();
    if (!HHMM.test(dayStart) || !HHMM.test(dayEnd)) {
      return json({ error: "manualDay.dayStartTime/dayEndTime krävs som HH:mm" }, 400);
    }
    const dayBreak = Math.max(0, Math.round(Number(md.breakMinutes ?? 0)));
    const deletedSegmentIds = Array.isArray(md.deletedSegmentIds)
      ? md.deletedSegmentIds.filter((x): x is string => typeof x === "string")
      : [];
    const comment = md.comment ? String(md.comment).slice(0, 4000) : null;

    const rawSegs = Array.isArray(md.segments) ? md.segments : [];
    const segs: NormalizedSegment[] = [];
    let idx = 0;
    for (const raw of rawSegs) {
      if (!raw || typeof raw !== "object") continue;
      const s = String(raw.startTime ?? "").trim();
      const e = String(raw.endTime ?? "").trim();
      if (!HHMM.test(s) || !HHMM.test(e)) {
        return json({ error: "manualDay.segments: startTime/endTime krävs som HH:mm" }, 400);
      }
      // filtrera 0-minutersblock — sparas aldrig som arbetstid
      const [sh, sm] = s.split(":").map(Number);
      const [eh, em] = e.split(":").map(Number);
      let mins = eh * 60 + em - (sh * 60 + sm);
      if (mins < 0) mins += 24 * 60;
      if (mins <= 0) continue;

      const target = (raw.target && typeof raw.target === "object")
        ? raw.target as ManualWorkTargetInput
        : null;
      if (!target) {
        return json({ error: "manualDay.segments: target krävs för varje block (välj plats/projekt eller 'Övrigt arbete')" }, 400);
      }
      segs.push({
        id: String(raw.id ?? `manual-${idx}`),
        startTime: s,
        endTime: e,
        target,
        comment: raw.comment ? String(raw.comment).slice(0, 2000) : null,
        sourceSegmentId: typeof raw.sourceSegmentId === "string" ? raw.sourceSegmentId : null,
      });
      idx++;
    }
    if (segs.length === 0) {
      return json({ error: "manualDay.segments: minst ett giltigt block krävs" }, 400);
    }

    manualDay = {
      dayStartTime: dayStart,
      dayEndTime: dayEnd,
      breakMinutes: dayBreak,
      segments: segs,
      deletedSegmentIds,
      comment,
    };
  }
  const manualDayComment = manualDay?.comment ?? null;

  const authResult = await authenticateStaffRequest(req, { requestedStaffId: staffId });
  if (!authResult.ok) return json({ error: authResult.err.error }, authResult.err.status);
  const access = await authorizeStaffAccess(authResult.auth, staffId);
  if (!access.ok) return json({ error: access.err.error }, access.err.status);

  const admin = authResult.auth.admin;
  const orgId = access.orgId;
  const isPrivilegedAdmin =
    authResult.auth.mode === "jwt" && authResult.auth.isPrivileged === true;

  // ── Lock-check + prior state ────────────────────────────────
  let priorStatus: string | null = null;
  try {
    const { data } = await admin
      .from("staff_day_submissions")
      .select("id, status")
      .eq("organization_id", orgId)
      .eq("staff_id", staffId)
      .eq("date", date)
      .maybeSingle();
    if (data) priorStatus = String((data as any).status ?? "");
  } catch (e) {
    console.error("[submit-mobile-gps-day-v2] prior fetch failed", e);
  }
  if ((priorStatus === "approved" || priorStatus === "payroll_approved") && !isPrivilegedAdmin) {
    return json(
      { error: "Tidrapporten är låst (godkänd / utbetald) och kan inte ändras av användaren" },
      409,
    );
  }

  // ── Staff name ───────────────────────────────────────────────
  let staffName: string | null = null;
  try {
    const { data } = await admin
      .from("staff").select("first_name, last_name, name").eq("id", staffId).maybeSingle();
    if (data) {
      const full = `${(data as any).first_name ?? ""} ${(data as any).last_name ?? ""}`.trim();
      staffName = full || (data as any).name || null;
    }
  } catch (_e) { /* ignore */ }

  // ── Bygg vyn på samma sätt som get-mobile-gps-day-view ──────
  let knownTargets: any[] = [];
  try { knownTargets = await loadKnownTargetsV2(admin, orgId, staffId, date); }
  catch (e) { console.error("[submit-mobile-gps-day-v2] target load failed", e); return json({ error: "target load failed" }, 500); }

  let pings: any[] = [];
  try { pings = await fetchPingsForDayV2(admin, staffId, date); }
  catch (e) { console.error("[submit-mobile-gps-day-v2] ping fetch failed", e); return json({ error: "ping fetch failed" }, 500); }

  const view = buildDayView({
    staffId, organizationId: orgId, date, pings, knownTargets, manualOverrides, staffName,
  });

  const sourceSnapshotId =
    `${date}:${staffId}:${view.rawPingCount}:${view.firstPingAt ?? "-"}:${view.lastPingAt ?? "-"}`;

  // ── Bestäm requested_start_at / requested_end_at / break ────
  // Manuell dag: dagens start/slut/rast styr requested_*; varje block sparas
  // exakt på sin valda target i display_timeline_snapshot_json.
  let requestedStartAt: string | null = null;
  let requestedEndAt: string | null = null;
  let breakMinutes = 0;
  let displaySnapshot: any[] = [];
  let totalMinutes = 0;

  if (manualDay) {
    // Dagens start/slut (Stockholm-lokal) → UTC ISO. Hanterar nattpass.
    let dayStartIso = stockholmLocalToUtcIso(date, manualDay.dayStartTime);
    let dayEndIso = stockholmLocalToUtcIso(date, manualDay.dayEndTime);
    if (Date.parse(dayEndIso) <= Date.parse(dayStartIso)) {
      const nextDay = new Date(`${date}T00:00:00Z`);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const nextDateStr = nextDay.toISOString().slice(0, 10);
      dayEndIso = stockholmLocalToUtcIso(nextDateStr, manualDay.dayEndTime);
    }
    requestedStartAt = dayStartIso;
    requestedEndAt = dayEndIso;
    breakMinutes = manualDay.breakMinutes;

    const rows: any[] = [];
    for (const seg of manualDay.segments) {
      let startIso = stockholmLocalToUtcIso(date, seg.startTime);
      let endIso = stockholmLocalToUtcIso(date, seg.endTime);
      if (Date.parse(endIso) <= Date.parse(startIso)) {
        const nextDay = new Date(`${date}T00:00:00Z`);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        const nextDateStr = nextDay.toISOString().slice(0, 10);
        endIso = stockholmLocalToUtcIso(nextDateStr, seg.endTime);
      }
      const mins = Math.max(0, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60000));
      if (mins <= 0) continue; // dubbel-säkerhet — 0m sparas aldrig
      totalMinutes += mins;

      const t = seg.target;
      const tt = (t.targetType ?? "other") as ManualTargetType;
      rows.push({
        id: seg.id,
        segmentKey: seg.id,
        sourceSegmentId: seg.sourceSegmentId,
        source: "mobile_time_v2_manual",
        kind: "manual_work",
        type: "manual_work",
        label: t.label ?? "Övrigt arbete",
        startedAt: startIso,
        endedAt: endIso,
        start: startIso,
        end: endIso,
        durationMinutes: mins,
        minutes: mins,
        booking_id: t.booking_id ?? (tt === "booking" ? t.targetId : null),
        project_id: t.project_id ?? (tt === "project" ? t.targetId : null),
        large_project_id: t.large_project_id ?? (tt === "large_project" ? t.targetId : null),
        location_id: t.location_id ?? (tt === "location" ? t.targetId : null),
        assignment_id: null,
        targetType: tt,
        targetId: t.targetId ?? null,
        warning: tt === "other" ? "unassigned_manual_time" : null,
        comment: seg.comment ?? null,
      });
    }
    displaySnapshot = rows;
  } else if (view.segments && view.segments.length > 0) {
    const first = view.segments[0];
    const last = view.segments[view.segments.length - 1];
    requestedStartAt = first?.currentStartTime ?? null;
    requestedEndAt = last?.currentEndTime ?? null;
    breakMinutes = 0;
    totalMinutes = view.totals?.totalDurationMinutes ?? 0;
    displaySnapshot = mapSegmentsForDisplaySnapshot(view.segments);
  }

  // ── Status ──────────────────────────────────────────────────
  const hasManualDay = !!manualDay;
  const userChanged = manualOverrides.length > 0 || hasManualDay;
  const nextStatus = userChanged ? "edited" : "submitted";
  const sourceTag = hasManualDay ? "mobile_time_v2_manual" : "mobile_gps_day_view_v2";

  const manualDayJson = manualDay ? {
    dayStartTime: manualDay.dayStartTime,
    dayEndTime: manualDay.dayEndTime,
    breakMinutes: manualDay.breakMinutes,
    segments: manualDay.segments,
    deletedSegmentIds: manualDay.deletedSegmentIds,
    comment: manualDayComment,
  } : null;

  // ── Payloads ────────────────────────────────────────────────
  const submittedPayload = {
    source: sourceTag,
    date,
    staffId,
    sourceSnapshotId,
    segments: view.segments,
    rows: view.rows,
    totals: view.totals,
    manualOverridesSummary: view.manualOverridesSummary,
    rawPingCount: view.rawPingCount,
    requestedStartAt,
    requestedEndAt,
    breakMinutes,
    displayTimelineSnapshot: displaySnapshot,
    manualDay: manualDayJson,
    submittedAt: new Date().toISOString(),
    submittedBy: authResult.auth.userId ?? null,
  };

  const userEditsJson = {
    manualOverrides,
    manualDay: manualDayJson,
    deletedSegmentIds: manualDay?.deletedSegmentIds ?? [],
    userChanged,
  };

  const sourceSummaryJson = {
    source: sourceTag,
    sourceSnapshotId,
    rawPingCount: view.rawPingCount,
    segmentCount: hasManualDay ? (manualDay?.segments.length ?? 0) : (view.segments?.length ?? 0),
    totalDurationMinutes: totalMinutes,
    totalDurationLabel: hasManualDay ? fmtDuration(totalMinutes) : (view.totals?.totalDurationLabel ?? null),
    workMinutes: view.totals?.workMinutes ?? null,
    travelMinutes: view.totals?.travelMinutes ?? null,
    gapMinutes: view.totals?.gapMinutes ?? null,
    overrideCount: manualOverrides.length,
    deletedSegmentCount: manualDay?.deletedSegmentIds.length ?? 0,
    hasManualDay,
  };

  const upsertPayload: Record<string, unknown> = {
    organization_id: orgId,
    staff_id: staffId,
    date,
    status: nextStatus,
    source: sourceTag,
    source_snapshot_id: sourceSnapshotId,
    submitted_at: new Date().toISOString(),
    submitted_by: authResult.auth.userId ?? null,
    submitted_payload_json: submittedPayload,
    display_timeline_snapshot_json: displaySnapshot,
    user_edits_json: userEditsJson,
    source_summary_json: sourceSummaryJson,
    comment: userComment,
    break_minutes: breakMinutes,
    requested_start_at: requestedStartAt,
    requested_end_at: requestedEndAt,
    start_time: stockholmTimeOf(requestedStartAt),
    end_time: stockholmTimeOf(requestedEndAt),
    engine_version: "mobile_time_v2",
  };

  const { data, error } = await admin
    .from("staff_day_submissions")
    .upsert(upsertPayload, { onConflict: "organization_id,staff_id,date" })
    .select()
    .single();

  if (error) {
    console.error("[submit-mobile-gps-day-v2] upsert failed", error);
    return json({ error: error.message }, 500);
  }

  // Spegla user_comment som staff-message så att admin ser hela konversationen
  if (userComment) {
    try {
      await admin.from("staff_day_submission_messages").insert({
        organization_id: orgId,
        submission_id: (data as any).id,
        staff_id: staffId,
        date,
        author_role: "staff",
        author_id: authResult.auth.userId ?? null,
        body: userComment,
      });
    } catch (e) {
      console.error("[submit-mobile-gps-day-v2] message insert failed", e);
    }
  }

  return json({
    ok: true,
    source: sourceTag,
    staffId,
    date,
    sourceSnapshotId,
    submission: {
      id: (data as any).id,
      status: nextStatus,
      submittedAt: (data as any).submitted_at,
      userComment,
    },
    priorStatus,
  });
});
