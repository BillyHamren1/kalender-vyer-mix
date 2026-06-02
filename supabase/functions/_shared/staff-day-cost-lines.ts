/**
 * staff-day-cost-lines.ts
 * =======================
 *
 * Bygger `project_staff_time_cost_lines` från en
 * `staff_day_submissions`-rad.
 *
 * REGLER:
 *  - staff_day_report_cache = Time Engine/GPS-FÖRSLAG. Får ALDRIG användas
 *    som faktisk projektkostnad.
 *  - staff_day_submissions = sanningen. Alla "countable" statusar (se
 *    COUNTABLE_SUBMISSION_STATUSES) ger upphov till kostnadsrader,
 *    inte enbart approved/payroll_approved. Tiden ska synas i projektet
 *    direkt när personalen rapporterat — admin-attest ändrar bara
 *    status (oattesterad → godkänd), inte själva förekomsten.
 *  - Vi rör ALDRIG: time_reports, workdays, location_time_entries,
 *    travel_time_logs, day_attestations.
 *
 * Anropas från:
 *   - submit-staff-day-v3                (personal skickar in / korrigerar)
 *   - submit-mobile-gps-day-v2           (personal skickar in via GPS-dag)
 *   - update-staff-day-submission-status (admin ändrar status)
 */

// deno-lint-ignore-file no-explicit-any
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type AdminClient = SupabaseClient | ReturnType<typeof createClient>;

interface BlockLike {
  id?: string | null;
  block_id?: string | null;
  kind?: string | null;
  type?: string | null;
  label?: string | null;
  target_label?: string | null;
  targetLabel?: string | null;

  start_at?: string | null;
  end_at?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  durationMinutes?: number | null;
  minutes?: number | null;

  booking_id?: string | null;
  project_id?: string | null;
  large_project_id?: string | null;
  assignment_id?: string | null;
  location_id?: string | null;

  targetType?: string | null;
  targetId?: string | null;
  target?: { type?: string | null; id?: string | null; kind?: string | null } | null;

  evidence?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;

  [k: string]: unknown;
}

const WORK_KINDS = new Set(["work", "work_session", "work_block", "project_work"]);
const PRIVATE_KINDS = new Set(["private_residence", "private", "home", "private_or_background"]);
const TRANSPORT_KINDS = new Set(["transport", "travel", "resa"]);
const BREAK_KINDS = new Set(["break", "rast", "lunch"]);
const NON_WORK_KINDS = new Set([
  "signal_gap",
  "gps_gap",
  "gps_gap_in_workday",
  "unknown",
  "unknown_place",
  "needs_review",
  "no_report",
  "other_place",
  "unclear_movement",
  "unclear_transport",
]);

/**
 * Submission-statusar som ska räknas in i projektets total. Dessa ger
 * upphov till project_staff_time_cost_lines-rader.
 *
 * Approved-grupp:  approved, payroll_approved
 * Oattesterade men inräknade: submitted, edited, ai_flagged,
 *                             needs_user_attention, needs_control
 */
export const COUNTABLE_SUBMISSION_STATUSES = new Set<string>([
  "submitted",
  "edited",
  "ai_flagged",
  "needs_user_attention",
  "needs_control",
  "approved",
  "payroll_approved",
]);

/**
 * Submission-statusar där tiden ALDRIG ska räknas in i projektets total.
 * För dessa raderar vi project_staff_time_cost_lines-rader.
 */
export const EXCLUDED_SUBMISSION_STATUSES = new Set<string>([
  "draft",
  "correction_requested",
  "rejected",
  "deleted",
  "cancelled",
]);

function readKind(b: BlockLike): string | null {
  const k = (b?.kind ?? b?.type) as string | null | undefined;
  return k ? String(k).toLowerCase() : null;
}

function pickStr(...vs: Array<unknown>): string | null {
  for (const v of vs) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function getRefs(b: BlockLike) {
  const ev = (b.evidence ?? {}) as Record<string, unknown>;
  const md = (b.metadata ?? {}) as Record<string, unknown>;
  const tType = (b.targetType ?? b.target?.type ?? b.target?.kind ?? null) as string | null;
  const tId = (b.targetId ?? b.target?.id ?? null) as string | null;
  const fromT = (k: string) => (tType && tType.toLowerCase() === k ? tId : null);
  return {
    booking_id: pickStr(b.booking_id, ev.booking_id, md.booking_id, fromT("booking")),
    project_id: pickStr(b.project_id, ev.project_id, md.project_id, fromT("project")),
    large_project_id: pickStr(
      b.large_project_id,
      ev.large_project_id,
      md.large_project_id,
      fromT("large_project"),
    ),
    assignment_id: pickStr(
      b.assignment_id,
      ev.assignment_id,
      md.assignment_id,
      ev.booking_staff_assignment_id,
      md.booking_staff_assignment_id,
    ),
    location_id: pickStr(
      b.location_id,
      ev.location_id,
      md.location_id,
      fromT("location"),
      fromT("organization_location"),
    ),
  };
}

function getMinutes(b: BlockLike): number {
  const d = typeof b.durationMinutes === "number" ? b.durationMinutes : null;
  if (d != null && Number.isFinite(d) && d > 0) return Math.round(d);
  const m = typeof b.minutes === "number" ? b.minutes : null;
  if (m != null && Number.isFinite(m) && m > 0) return Math.round(m);
  const s = (b.startAt ?? b.start_at) as string | null | undefined;
  const e = (b.endAt ?? b.end_at) as string | null | undefined;
  if (!s || !e) return 0;
  const sm = Date.parse(s);
  const em = Date.parse(e);
  if (!Number.isFinite(sm) || !Number.isFinite(em) || em <= sm) return 0;
  return Math.round((em - sm) / 60_000);
}

function getStartEnd(b: BlockLike): { start: string | null; end: string | null } {
  return {
    start: (b.startAt ?? b.start_at) as string | null,
    end: (b.endAt ?? b.end_at) as string | null,
  };
}

function isCountableWork(b: BlockLike): boolean {
  const k = readKind(b);
  if (!k) return false;
  if (PRIVATE_KINDS.has(k)) return false;
  if (TRANSPORT_KINDS.has(k)) return false;
  if (BREAK_KINDS.has(k)) return false;
  if (NON_WORK_KINDS.has(k)) return false;
  if (WORK_KINDS.has(k)) return true;
  return k.startsWith("work");
}

function pickBlocksFromSubmissionSnapshot(snap: unknown): BlockLike[] {
  if (Array.isArray(snap)) return snap as BlockLike[];
  if (snap && typeof snap === "object") {
    const obj = snap as Record<string, unknown>;
    for (const key of ["display_blocks", "blocks", "timeline", "items"]) {
      const v = obj[key];
      if (Array.isArray(v)) return v as BlockLike[];
    }
  }
  return [];
}

function pickBlocksFromCacheRow(row: any): BlockLike[] {
  if (!row) return [];
  const cands = [row.display_blocks_json, row.report_candidate_blocks_json];
  for (const c of cands) {
    if (Array.isArray(c)) return c as BlockLike[];
    if (c && typeof c === "object" && Array.isArray((c as any).blocks)) {
      return (c as any).blocks as BlockLike[];
    }
  }
  return [];
}

async function resolveRate(
  admin: AdminClient,
  staffId: string,
  bookingId: string | null,
): Promise<{ hourly_rate: number; rate_source: "completion_staff" | "staff_members" | "missing_rate" }> {
  if (bookingId) {
    const { data: cs } = await admin
      .from("completion_staff")
      .select("hourly_rate, work_date")
      .eq("completion_id", bookingId)
      .eq("staff_id", staffId)
      .order("work_date", { ascending: false })
      .limit(1);
    const r = (cs ?? [])[0];
    if (r && r.hourly_rate != null && Number(r.hourly_rate) > 0) {
      return { hourly_rate: Number(r.hourly_rate), rate_source: "completion_staff" };
    }
  }
  const { data: m } = await admin
    .from("staff_members")
    .select("hourly_rate")
    .eq("id", staffId)
    .maybeSingle();
  const rate = Number((m as any)?.hourly_rate ?? 0);
  if (rate > 0) return { hourly_rate: rate, rate_source: "staff_members" };
  return { hourly_rate: 0, rate_source: "missing_rate" };
}

async function resolveStaffName(admin: AdminClient, staffId: string): Promise<string | null> {
  const { data } = await admin.from("staff_members").select("name").eq("id", staffId).maybeSingle();
  return (data as any)?.name ?? null;
}

export interface RebuildResult {
  created: number;
  deleted: number;
  reason?: string;
}

/**
 * Bygger om project_staff_time_cost_lines för en specifik
 * staff_day_submission. Idempotent: tar alltid bort gamla rader för samma
 * submission innan ev. nya rader skrivs.
 */
export async function rebuildProjectStaffTimeCostLinesForSubmission(
  admin: AdminClient,
  submissionId: string,
): Promise<RebuildResult> {
  const { data: sub, error: loadErr } = await admin
    .from("staff_day_submissions")
    .select(
      "id, organization_id, staff_id, date, status, display_timeline_snapshot_json, submitted_payload_json",
    )
    .eq("id", submissionId)
    .maybeSingle();
  if (loadErr) throw new Error(`submission_load_failed: ${loadErr.message}`);
  if (!sub) return { created: 0, deleted: 0, reason: "submission_not_found" };

  // Always wipe old rows for this submission first.
  const { error: delErr, count: deletedCount } = await admin
    .from("project_staff_time_cost_lines")
    .delete({ count: "exact" })
    .eq("staff_day_submission_id", submissionId);
  if (delErr) throw new Error(`delete_failed: ${delErr.message}`);
  const deleted = deletedCount ?? 0;

  const status = String((sub as any).status ?? "");
  if (status !== "approved" && status !== "payroll_approved") {
    return { created: 0, deleted, reason: "not_approved" };
  }

  // 1) Primary source: submission snapshot (frozen at submit-time)
  let blocks = pickBlocksFromSubmissionSnapshot((sub as any).display_timeline_snapshot_json);
  if (blocks.length === 0) {
    blocks = pickBlocksFromSubmissionSnapshot((sub as any).submitted_payload_json);
  }

  // 2) Fallback: latest cache row for same staff/date (segment structure only).
  if (blocks.length === 0) {
    const { data: cacheRow } = await admin
      .from("staff_day_report_cache")
      .select("display_blocks_json, report_candidate_blocks_json")
      .eq("organization_id", (sub as any).organization_id)
      .eq("staff_id", (sub as any).staff_id)
      .eq("date", (sub as any).date)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    blocks = pickBlocksFromCacheRow(cacheRow);
  }

  if (blocks.length === 0) {
    return { created: 0, deleted, reason: "no_blocks" };
  }

  const staffName = await resolveStaffName(admin, (sub as any).staff_id);

  // Cache rate lookups per (booking_id|"") so we don't hammer the DB.
  const rateCache = new Map<string, { hourly_rate: number; rate_source: string }>();

  const rowsToInsert: any[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b || typeof b !== "object") continue;
    if (!isCountableWork(b)) continue;

    const refs = getRefs(b);
    const hasTarget = !!(refs.booking_id || refs.project_id || refs.large_project_id || refs.location_id);
    if (!hasTarget) continue;

    const minutes = getMinutes(b);
    if (minutes <= 0) continue;

    const { start, end } = getStartEnd(b);
    if (!start || !end) continue;

    const rateKey = refs.booking_id ?? "";
    let rate = rateCache.get(rateKey);
    if (!rate) {
      rate = await resolveRate(admin, (sub as any).staff_id, refs.booking_id);
      rateCache.set(rateKey, rate);
    }

    const hours = minutes / 60;
    const cost = hours * rate.hourly_rate;
    const blockId =
      pickStr(b.id, b.block_id) ?? `sub:${submissionId}:${i}`;
    const label = pickStr(b.label, b.target_label, b.targetLabel);

    rowsToInsert.push({
      organization_id: (sub as any).organization_id,
      staff_day_submission_id: submissionId,
      staff_id: (sub as any).staff_id,
      staff_name: staffName,
      date: (sub as any).date,
      booking_id: refs.booking_id,
      project_id: refs.project_id,
      large_project_id: refs.large_project_id,
      assignment_id: refs.assignment_id,
      location_id: refs.location_id,
      source_block_id: blockId,
      source_block_kind: readKind(b),
      source_label: label,
      start_at: start,
      end_at: end,
      minutes,
      hours,
      hourly_rate: rate.hourly_rate,
      cost,
      rate_source: rate.rate_source,
      submission_status: status,
    });
  }

  if (rowsToInsert.length === 0) {
    return { created: 0, deleted, reason: "no_countable_segments" };
  }

  const { error: insErr } = await admin
    .from("project_staff_time_cost_lines")
    .insert(rowsToInsert);
  if (insErr) throw new Error(`insert_failed: ${insErr.message}`);

  return { created: rowsToInsert.length, deleted };
}

/**
 * Tar bort kostnadsrader för en submission (utan att försöka bygga nya).
 * Används när admin sätter status till `correction_requested` eller
 * `needs_control`.
 */
export async function deleteProjectStaffTimeCostLinesForSubmission(
  admin: AdminClient,
  submissionId: string,
): Promise<{ deleted: number }> {
  const { error, count } = await admin
    .from("project_staff_time_cost_lines")
    .delete({ count: "exact" })
    .eq("staff_day_submission_id", submissionId);
  if (error) throw new Error(`delete_failed: ${error.message}`);
  return { deleted: count ?? 0 };
}
