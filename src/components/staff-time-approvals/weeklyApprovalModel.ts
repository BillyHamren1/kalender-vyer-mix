import { addDays, format, parseISO } from "date-fns";
import type {
  StaffDaySubmissionStatus,
  StaffWeeklyCacheRow,
  StaffWeeklyStaffMember,
  StaffWeeklySubmissionRow,
} from "@/hooks/staff/useStaffWeeklyTimeApprovals";

/**
 * Källa per dagcell.
 *  - submission  = personalen har skickat in (vinner alltid)
 *  - engine_cache = endast Time Engine/GPS-förslag (Väntar personalattest)
 *  - none        = varken submission eller användbar cache
 */
export type WeeklyDayCellSource = "submission" | "engine_cache" | "none";

/** Utvidgad uiStatus som täcker både submission-statusar och syntetiska tillstånd. */
export type WeeklyDayUiStatus =
  | StaffDaySubmissionStatus
  | "pending_staff_attest"
  | "pending_admin_attest"
  | "edited_pending_admin_attest"
  | "engine_error"
  | "no_report";

export const TODO_STATUSES: ReadonlySet<string> = new Set([
  "submitted",
  "edited",
  "ai_flagged",
  "needs_user_attention",
  "needs_control",
  "correction_requested",
  "missing_report",
  // UI-statusar
  "pending_staff_attest",
  "pending_admin_attest",
  "edited_pending_admin_attest",
  "engine_error",
]);

export const APPROVED_STATUSES: ReadonlySet<StaffDaySubmissionStatus> = new Set([
  "approved",
  "payroll_approved",
]);

/** Status som går att godkänna direkt via "Godkänn dag/vecka". */
export const APPROVABLE_STATUSES: ReadonlySet<StaffDaySubmissionStatus> = new Set([
  "submitted",
  "edited",
  "ai_flagged",
  "needs_control",
  "needs_user_attention",
]);

export interface WeeklyDayCell {
  date: string; // YYYY-MM-DD
  submission: StaffWeeklySubmissionRow | null;
  cache: StaffWeeklyCacheRow | null;
  source: WeeklyDayCellSource;

  /** Rå submission-status (för internt bruk). */
  status: WeeklyDayUiStatus;
  /** UI-status (samma som status här — separat för att tydliggöra avsikt). */
  uiStatus: WeeklyDayUiStatus;
  uiStatusLabel: string;

  minutes: number;
  startLabel: string | null;
  endLabel: string | null;

  hasComment: boolean;
  hasUserEdits: boolean;
  hasAiWarning: boolean;

  isStaffPending: boolean;       // väntar på personalattest
  isAdminPending: boolean;       // väntar på adminattest (riktig submission)
  isAdminApprovable: boolean;    // godkänn-knapp tillåten
  isBlocked: boolean;            // engine_error eller korrigeringsbegäran
}

export interface WeeklyStaffBundle {
  staff: StaffWeeklyStaffMember;
  days: WeeklyDayCell[]; // alltid 7
  submissions: StaffWeeklySubmissionRow[];
  totalMinutes: number;

  // Tidigare räknare – behålls för bakåtkompat.
  submittedCount: number;
  approvedCount: number;
  awaitingCount: number;
  needsFixCount: number;
  missingCount: number;
  correctionRequestedCount: number;
  needsUserAttentionCount: number;
  needsControlCount: number;
  aiFlaggedCount: number;
  approvableCount: number;

  // Nya räknare
  pendingStaffAttestCount: number;
  pendingAdminAttestCount: number;
  engineProposalCount: number;
  engineErrorCount: number;
  noReportCount: number;
  adminApprovableCount: number;

  allDone: boolean;
  hasTodo: boolean;
  /** Sorteringsprio: 1 = högst, 6 = lägst. */
  priorityRank: number;
  /** Centralt formulerad åtgärdsetikett admin kan lita på. */
  actionLabel: string;
}

// ---------- Helpers ----------

export function computeSubmissionMinutes(s: StaffWeeklySubmissionRow): number {
  if (s.start_time && s.end_time) {
    const [sh, sm] = s.start_time.split(":").map(Number);
    const [eh, em] = s.end_time.split(":").map(Number);
    let diff = eh * 60 + em - (sh * 60 + sm);
    if (diff < 0) diff += 24 * 60;
    diff -= s.break_minutes ?? 0;
    return Math.max(0, diff);
  }
  if (s.requested_start_at && s.requested_end_at) {
    const start = new Date(s.requested_start_at).getTime();
    const end = new Date(s.requested_end_at).getTime();
    const diff = Math.max(0, Math.round((end - start) / 60000) - (s.break_minutes ?? 0));
    return diff;
  }
  return 0;
}

export function formatHm(minutes: number): string {
  if (!minutes || minutes <= 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function num(v: unknown): number {
  return typeof v === "number" && isFinite(v) ? v : 0;
}

/** Cache räknas "användbar" om vi har minst en uppfattning om dagen. */
export function isUsableCacheRow(cache: StaffWeeklyCacheRow | null): boolean {
  if (!cache) return false;
  if (cache.error) return false;
  const display = asArray(cache.display_blocks_json);
  if (display.length > 0) return true;
  const candidates = asArray(cache.report_candidate_blocks_json);
  if (candidates.length > 0) return true;
  const summary = (cache.summary_json ?? null) as any;
  if (summary && typeof summary === "object") {
    if (
      num(summary.workMinutes) > 0 ||
      num(summary.payableMinutes) > 0 ||
      num(summary.totalMinutes) > 0 ||
      num(summary.transportMinutes) > 0 ||
      num(summary.breakMinutes) > 0
    ) {
      return true;
    }
  }
  return false;
}

export function computeCacheMinutes(cache: StaffWeeklyCacheRow): number {
  const summary = (cache.summary_json ?? null) as any;
  if (summary && typeof summary === "object") {
    if (num(summary.payableMinutes) > 0) return Math.round(summary.payableMinutes);
    if (num(summary.workMinutes) > 0) return Math.round(summary.workMinutes);
    if (num(summary.totalMinutes) > 0) return Math.round(summary.totalMinutes);
  }
  const sumBlocks = (blocks: unknown[]): number => {
    let total = 0;
    for (const b of blocks) {
      if (!b || typeof b !== "object") continue;
      const any = b as any;
      const m = num(any.durationMinutes) || num(any.minutes) || num(any.duration_min);
      if (m > 0) total += m;
    }
    return Math.round(total);
  };
  const dispSum = sumBlocks(asArray(cache.display_blocks_json));
  if (dispSum > 0) return dispSum;
  const candSum = sumBlocks(asArray(cache.report_candidate_blocks_json));
  if (candSum > 0) return candSum;
  return 0;
}

function pickBlockTime(b: any, keys: string[]): string | null {
  for (const k of keys) {
    const v = b?.[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function fmtTimeMaybe(value: string | null): string | null {
  if (!value) return null;
  // Redan HH:mm?
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  if (/^\d{2}:\d{2}:\d{2}$/.test(value)) return value.slice(0, 5);
  // ISO-datetime?
  try {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return format(d, "HH:mm");
  } catch {
    /* noop */
  }
  return null;
}

const START_KEYS = ["start", "startedAt", "started_at", "start_time", "startTime", "from"];
const END_KEYS = ["end", "endedAt", "ended_at", "end_time", "endTime", "to"];

export function deriveCacheStartEnd(
  cache: StaffWeeklyCacheRow,
): { startLabel: string | null; endLabel: string | null } {
  const tryBlocks = (blocks: unknown[]): { startLabel: string | null; endLabel: string | null } | null => {
    if (blocks.length === 0) return null;
    const first = blocks[0] as any;
    const last = blocks[blocks.length - 1] as any;
    const startRaw = pickBlockTime(first, START_KEYS);
    const endRaw = pickBlockTime(last, END_KEYS);
    const startLabel = fmtTimeMaybe(startRaw);
    const endLabel = fmtTimeMaybe(endRaw);
    if (startLabel || endLabel) return { startLabel, endLabel };
    return null;
  };
  const disp = tryBlocks(asArray(cache.display_blocks_json));
  if (disp) return disp;
  const cand = tryBlocks(asArray(cache.report_candidate_blocks_json));
  if (cand) return cand;
  return { startLabel: null, endLabel: null };
}

function deriveBooleansFromSubmission(s: StaffWeeklySubmissionRow) {
  const userEdits = s.user_edits_json as any;
  const hasUserEdits = Array.isArray(userEdits)
    ? userEdits.length > 0
    : !!userEdits && Object.keys(userEdits ?? {}).length > 0;
  const ai = s.ai_validation_json as any;
  const aiWarnings = ai?.warnings ?? ai?.issues ?? (Array.isArray(ai) ? ai : null);
  const hasAiWarning = Array.isArray(aiWarnings)
    ? aiWarnings.length > 0
    : !!ai?.flagged || !!ai?.has_warning;
  return { hasUserEdits, hasAiWarning };
}

// ---------- UI-status mappning ----------

function uiStatusFromSubmission(s: StaffWeeklySubmissionRow): {
  uiStatus: WeeklyDayUiStatus;
  uiStatusLabel: string;
} {
  const st = s.status as StaffDaySubmissionStatus;
  switch (st) {
    case "submitted":
      return { uiStatus: "pending_admin_attest", uiStatusLabel: "Väntar adminattest" };
    case "edited":
      return { uiStatus: "edited_pending_admin_attest", uiStatusLabel: "Väntar adminattest · ändrad" };
    case "ai_flagged":
      return { uiStatus: "ai_flagged", uiStatusLabel: "Kontrollera (AI)" };
    case "needs_user_attention":
      return { uiStatus: "needs_user_attention", uiStatusLabel: "Behöver svar" };
    case "needs_control":
      return { uiStatus: "needs_control", uiStatusLabel: "Intern kontroll" };
    case "correction_requested":
      return { uiStatus: "correction_requested", uiStatusLabel: "Behöver kompletteras" };
    case "approved":
      return { uiStatus: "approved", uiStatusLabel: "Godkänd" };
    case "payroll_approved":
      return { uiStatus: "payroll_approved", uiStatusLabel: "Godkänd för utbetalning" };
    case "missing_report":
      return { uiStatus: "missing_report", uiStatusLabel: "Saknar rapport" };
    default:
      return { uiStatus: st, uiStatusLabel: String(st) };
  }
}

function makeNoReportDay(date: string): WeeklyDayCell {
  return {
    date,
    submission: null,
    cache: null,
    source: "none",
    status: "no_report",
    uiStatus: "no_report",
    uiStatusLabel: "Ingen rapport",
    minutes: 0,
    startLabel: null,
    endLabel: null,
    hasComment: false,
    hasUserEdits: false,
    hasAiWarning: false,
    isStaffPending: false,
    isAdminPending: false,
    isAdminApprovable: false,
    isBlocked: false,
  };
}

function makeCacheDay(date: string, cache: StaffWeeklyCacheRow): WeeklyDayCell {
  if (cache.error) {
    return {
      date,
      submission: null,
      cache,
      source: "engine_cache",
      status: "engine_error",
      uiStatus: "engine_error",
      uiStatusLabel: "Beräkningsfel",
      minutes: 0,
      startLabel: null,
      endLabel: null,
      hasComment: false,
      hasUserEdits: false,
      hasAiWarning: false,
      isStaffPending: false,
      isAdminPending: false,
      isAdminApprovable: false,
      isBlocked: true,
    };
  }
  const { startLabel, endLabel } = deriveCacheStartEnd(cache);
  return {
    date,
    submission: null,
    cache,
    source: "engine_cache",
    status: "pending_staff_attest",
    uiStatus: "pending_staff_attest",
    uiStatusLabel: "Väntar personalattest",
    minutes: computeCacheMinutes(cache),
    startLabel,
    endLabel,
    hasComment: false,
    hasUserEdits: false,
    hasAiWarning: false,
    isStaffPending: true,
    isAdminPending: false,
    isAdminApprovable: false,
    isBlocked: false,
  };
}

function makeSubmissionDay(
  date: string,
  sub: StaffWeeklySubmissionRow,
  cache: StaffWeeklyCacheRow | null,
): WeeklyDayCell {
  const { uiStatus, uiStatusLabel } = uiStatusFromSubmission(sub);
  const { hasUserEdits, hasAiWarning } = deriveBooleansFromSubmission(sub);
  const startLabel = sub.start_time ? sub.start_time.slice(0, 5) : null;
  const endLabel = sub.end_time ? sub.end_time.slice(0, 5) : null;
  const isApproved = uiStatus === "approved" || uiStatus === "payroll_approved";
  const isAdminApprovable = APPROVABLE_STATUSES.has(sub.status as StaffDaySubmissionStatus);
  const isAdminPending =
    uiStatus === "pending_admin_attest" ||
    uiStatus === "edited_pending_admin_attest" ||
    uiStatus === "ai_flagged" ||
    uiStatus === "needs_control" ||
    uiStatus === "needs_user_attention";
  return {
    date,
    submission: sub,
    cache,
    source: "submission",
    status: uiStatus,
    uiStatus,
    uiStatusLabel,
    minutes: computeSubmissionMinutes(sub),
    startLabel,
    endLabel,
    hasComment: !!sub.comment?.trim(),
    hasUserEdits,
    hasAiWarning,
    isStaffPending: false,
    isAdminPending,
    isAdminApprovable,
    isBlocked: uiStatus === "correction_requested" && !isApproved,
  };
}

// ---------- Action label ----------

function deriveActionLabel(b: Omit<WeeklyStaffBundle, "actionLabel" | "priorityRank">): {
  label: string;
  rank: number;
} {
  const dayWord = (n: number) => `${n} dag${n === 1 ? "" : "ar"}`;
  if (b.correctionRequestedCount > 0) {
    return { label: `Behöver kompletteras · ${dayWord(b.correctionRequestedCount)}`, rank: 1 };
  }
  if (b.needsUserAttentionCount > 0) {
    return { label: `Behöver svar · ${dayWord(b.needsUserAttentionCount)}`, rank: 2 };
  }
  if (b.pendingAdminAttestCount > 0) {
    return { label: `Väntar adminattest · ${dayWord(b.pendingAdminAttestCount)}`, rank: 3 };
  }
  if (b.pendingStaffAttestCount > 0) {
    return { label: `Väntar personalattest · ${dayWord(b.pendingStaffAttestCount)}`, rank: 4 };
  }
  if (b.engineErrorCount > 0) {
    return { label: `Beräkningsfel · ${dayWord(b.engineErrorCount)}`, rank: 5 };
  }
  if (b.allDone && (b.approvedCount > 0 || b.submittedCount > 0)) {
    return { label: "Godkänd vecka", rank: 6 };
  }
  if (b.approvedCount > 0) {
    return { label: `${b.approvedCount} godkända dagar`, rank: 6 };
  }
  return { label: "Inget att göra", rank: 6 };
}

// ---------- Builder ----------

export function buildWeeklyBundles(
  staff: StaffWeeklyStaffMember[],
  submissions: StaffWeeklySubmissionRow[],
  cacheRows: StaffWeeklyCacheRow[],
  weekStart: Date,
): WeeklyStaffBundle[] {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) dates.push(format(addDays(weekStart, i), "yyyy-MM-dd"));

  // Senaste submission per staff+date
  const subKey = (sid: string, d: string) => `${sid}|${d}`;
  const latestSubmission = new Map<string, StaffWeeklySubmissionRow>();
  const submissionsByStaff = new Map<string, StaffWeeklySubmissionRow[]>();
  const subsSorted = submissions.slice().sort((a, b) => {
    if (a.staff_id !== b.staff_id) return a.staff_id.localeCompare(b.staff_id);
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return b.submitted_at.localeCompare(a.submitted_at);
  });
  for (const s of subsSorted) {
    const k = subKey(s.staff_id, s.date);
    if (!latestSubmission.has(k)) latestSubmission.set(k, s);
    const list = submissionsByStaff.get(s.staff_id) ?? [];
    list.push(s);
    submissionsByStaff.set(s.staff_id, list);
  }

  // Senaste cache per staff+date (built_at desc)
  const latestCache = new Map<string, StaffWeeklyCacheRow>();
  const cacheSorted = cacheRows.slice().sort((a, b) => {
    if (a.staff_id !== b.staff_id) return a.staff_id.localeCompare(b.staff_id);
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const at = a.built_at ?? "";
    const bt = b.built_at ?? "";
    return bt.localeCompare(at);
  });
  for (const c of cacheSorted) {
    const k = subKey(c.staff_id, c.date);
    if (!latestCache.has(k)) latestCache.set(k, c);
  }

  // Bara personer som faktiskt har submission eller användbar cache i veckan.
  const visibleStaffIds = new Set<string>();
  for (const sid of submissionsByStaff.keys()) visibleStaffIds.add(sid);
  for (const c of cacheRows) {
    if (isUsableCacheRow(c) || c.error) visibleStaffIds.add(c.staff_id);
  }

  const staffMap = new Map(staff.map((s) => [s.id, s]));
  for (const sid of visibleStaffIds) {
    if (!staffMap.has(sid)) {
      staffMap.set(sid, { id: sid, name: sid, email: null, avatar_url: null });
    }
  }

  const bundles: WeeklyStaffBundle[] = [];
  for (const sid of visibleStaffIds) {
    const member = staffMap.get(sid)!;
    const subs = submissionsByStaff.get(sid) ?? [];

    const days: WeeklyDayCell[] = dates.map((d) => {
      const sub = latestSubmission.get(subKey(sid, d)) ?? null;
      const cache = latestCache.get(subKey(sid, d)) ?? null;
      if (sub) return makeSubmissionDay(d, sub, cache);
      if (cache && (isUsableCacheRow(cache) || cache.error)) return makeCacheDay(d, cache);
      return makeNoReportDay(d);
    });

    let totalMinutes = 0;
    let submittedCount = 0;
    let approvedCount = 0;
    let awaitingCount = 0;
    let needsFixCount = 0;
    let missingCount = 0;
    let correctionRequestedCount = 0;
    let needsUserAttentionCount = 0;
    let needsControlCount = 0;
    let aiFlaggedCount = 0;
    let approvableCount = 0;
    let pendingStaffAttestCount = 0;
    let pendingAdminAttestCount = 0;
    let engineProposalCount = 0;
    let engineErrorCount = 0;
    let noReportCount = 0;
    let adminApprovableCount = 0;

    for (const d of days) {
      totalMinutes += d.minutes;

      if (d.uiStatus === "no_report") {
        noReportCount++;
        continue;
      }
      if (d.uiStatus === "engine_error") {
        engineErrorCount++;
        continue;
      }
      if (d.uiStatus === "pending_staff_attest") {
        pendingStaffAttestCount++;
        engineProposalCount++;
        continue;
      }

      if (!d.submission) continue;
      submittedCount++;
      const st = d.submission.status as StaffDaySubmissionStatus;

      if (APPROVED_STATUSES.has(st)) approvedCount++;
      if (st === "submitted" || st === "edited" || st === "ai_flagged") awaitingCount++;
      if (st === "needs_control" || st === "needs_user_attention" || st === "correction_requested")
        needsFixCount++;
      if (st === "missing_report") missingCount++;
      if (st === "correction_requested") correctionRequestedCount++;
      if (st === "needs_user_attention") needsUserAttentionCount++;
      if (st === "needs_control") needsControlCount++;
      if (st === "ai_flagged") aiFlaggedCount++;
      if (APPROVABLE_STATUSES.has(st)) {
        approvableCount++;
        adminApprovableCount++;
      }
      if (d.isAdminPending) pendingAdminAttestCount++;
    }

    const visibleWithData = days.filter((d) => d.uiStatus !== "no_report");
    const hasTodo = visibleWithData.some((d) => TODO_STATUSES.has(d.uiStatus));
    const allDone =
      visibleWithData.length > 0 &&
      visibleWithData.every((d) => d.uiStatus === "approved" || d.uiStatus === "payroll_approved");

    const base = {
      staff: member,
      days,
      submissions: subs,
      totalMinutes,
      submittedCount,
      approvedCount,
      awaitingCount,
      needsFixCount,
      missingCount,
      correctionRequestedCount,
      needsUserAttentionCount,
      needsControlCount,
      aiFlaggedCount,
      approvableCount,
      pendingStaffAttestCount,
      pendingAdminAttestCount,
      engineProposalCount,
      engineErrorCount,
      noReportCount,
      adminApprovableCount,
      allDone,
      hasTodo,
    };

    const { label, rank } = deriveActionLabel(base);
    bundles.push({ ...base, priorityRank: rank, actionLabel: label });
  }

  // Sortera på prioritet (lägre = högre upp), sedan namn A–Ö.
  bundles.sort((a, b) => {
    if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
    return a.staff.name.localeCompare(b.staff.name, "sv");
  });

  return bundles;
}

export function isWeekFullyApprovable(bundle: WeeklyStaffBundle): boolean {
  return bundle.adminApprovableCount > 0;
}

/** True om hela veckans kvarvarande arbete kan godkännas i ett svep. */
export function isCleanWeekApproval(bundle: WeeklyStaffBundle): boolean {
  return (
    bundle.adminApprovableCount > 0 &&
    bundle.correctionRequestedCount === 0 &&
    bundle.missingCount === 0 &&
    bundle.needsUserAttentionCount === 0 &&
    bundle.pendingStaffAttestCount === 0 &&
    bundle.engineErrorCount === 0
  );
}

export function parseDate(d: string): Date {
  return parseISO(d);
}
