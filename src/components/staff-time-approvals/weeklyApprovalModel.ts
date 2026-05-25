import { addDays, format, parseISO } from "date-fns";
import type {
  StaffDaySubmissionStatus,
  StaffWeeklyStaffMember,
  StaffWeeklySubmissionRow,
} from "@/hooks/staff/useStaffWeeklyTimeApprovals";

export const TODO_STATUSES: ReadonlySet<StaffDaySubmissionStatus> = new Set([
  "submitted",
  "edited",
  "ai_flagged",
  "needs_user_attention",
  "needs_control",
  "correction_requested",
  "missing_report",
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
  status: StaffDaySubmissionStatus | "no_report";
  minutes: number;
  hasComment: boolean;
  hasUserEdits: boolean;
  hasAiWarning: boolean;
}

export interface WeeklyStaffBundle {
  staff: StaffWeeklyStaffMember;
  days: WeeklyDayCell[]; // alltid 7
  submissions: StaffWeeklySubmissionRow[];
  totalMinutes: number;
  submittedCount: number;
  approvedCount: number;
  awaitingCount: number;
  needsFixCount: number;
  missingCount: number;
  /** Antal dagar med correction_requested. */
  correctionRequestedCount: number;
  /** Antal dagar med needs_user_attention. */
  needsUserAttentionCount: number;
  /** Antal dagar med needs_control. */
  needsControlCount: number;
  /** Antal dagar med ai_flagged. */
  aiFlaggedCount: number;
  /** Antal dagar som är direkt godkännbara (submitted/edited/ai_flagged/needs_control/needs_user_attention). */
  approvableCount: number;
  allDone: boolean;
  hasTodo: boolean;
  /** Sorteringsprio: 1 = högst (correction), 6 = lägst (godkända). */
  priorityRank: number;
  /** Centralt formulerad åtgärdsetikett admin kan lita på. */
  actionLabel: string;
}

export function computeSubmissionMinutes(s: StaffWeeklySubmissionRow): number {
  if (s.start_time && s.end_time) {
    const [sh, sm] = s.start_time.split(":").map(Number);
    const [eh, em] = s.end_time.split(":").map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
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

function deriveBooleans(s: StaffWeeklySubmissionRow) {
  const userEdits = s.user_edits_json as any;
  const hasUserEdits = Array.isArray(userEdits)
    ? userEdits.length > 0
    : !!userEdits && Object.keys(userEdits ?? {}).length > 0;
  const ai = s.ai_validation_json as any;
  const aiWarnings =
    ai?.warnings ?? ai?.issues ?? (Array.isArray(ai) ? ai : null);
  const hasAiWarning = Array.isArray(aiWarnings)
    ? aiWarnings.length > 0
    : !!ai?.flagged || !!ai?.has_warning;
  return { hasUserEdits, hasAiWarning };
}

function deriveActionLabel(b: Omit<WeeklyStaffBundle, "actionLabel" | "priorityRank">): {
  label: string;
  rank: number;
} {
  if (b.correctionRequestedCount > 0) {
    return {
      label: `Behöver komplettering · ${b.correctionRequestedCount} dag${b.correctionRequestedCount === 1 ? "" : "ar"}`,
      rank: 1,
    };
  }
  if (b.needsUserAttentionCount > 0) {
    return {
      label: `Behöver svar · ${b.needsUserAttentionCount} dag${b.needsUserAttentionCount === 1 ? "" : "ar"}`,
      rank: 2,
    };
  }
  const controlCount = b.needsControlCount + b.aiFlaggedCount;
  if (controlCount > 0) {
    return {
      label: `Kontrollera · ${controlCount} dag${controlCount === 1 ? "" : "ar"}`,
      rank: 3,
    };
  }
  if (b.awaitingCount > 0) {
    return {
      label: `Väntar attest · ${b.awaitingCount} dag${b.awaitingCount === 1 ? "" : "ar"}`,
      rank: 4,
    };
  }
  if (b.missingCount > 0) {
    return {
      label: `Saknar rapport · ${b.missingCount} dag${b.missingCount === 1 ? "" : "ar"}`,
      rank: 5,
    };
  }
  if (b.allDone && b.submittedCount > 0) {
    return { label: "Godkänd vecka", rank: 6 };
  }
  if (b.approvedCount > 0) {
    return { label: `${b.approvedCount} godkända dagar`, rank: 6 };
  }
  return { label: "Inget att göra", rank: 6 };
}

export function buildWeeklyBundles(
  staff: StaffWeeklyStaffMember[],
  submissions: StaffWeeklySubmissionRow[],
  weekStart: Date,
): WeeklyStaffBundle[] {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) dates.push(format(addDays(weekStart, i), "yyyy-MM-dd"));

  const byStaff = new Map<string, StaffWeeklySubmissionRow[]>();
  for (const s of submissions) {
    const list = byStaff.get(s.staff_id) ?? [];
    list.push(s);
    byStaff.set(s.staff_id, list);
  }

  const staffMap = new Map(staff.map((s) => [s.id, s]));
  for (const sid of byStaff.keys()) {
    if (!staffMap.has(sid)) {
      staffMap.set(sid, { id: sid, name: sid, email: null, avatar_url: null });
    }
  }

  const bundles: WeeklyStaffBundle[] = [];
  for (const member of staffMap.values()) {
    const subs = (byStaff.get(member.id) ?? []).slice().sort((a, b) =>
      a.date.localeCompare(b.date) || b.submitted_at.localeCompare(a.submitted_at),
    );
    const latestPerDate = new Map<string, StaffWeeklySubmissionRow>();
    for (const s of subs) if (!latestPerDate.has(s.date)) latestPerDate.set(s.date, s);

    const days: WeeklyDayCell[] = dates.map((d) => {
      const sub = latestPerDate.get(d) ?? null;
      if (!sub) {
        return {
          date: d,
          submission: null,
          status: "no_report",
          minutes: 0,
          hasComment: false,
          hasUserEdits: false,
          hasAiWarning: false,
        };
      }
      const { hasUserEdits, hasAiWarning } = deriveBooleans(sub);
      return {
        date: d,
        submission: sub,
        status: sub.status as StaffDaySubmissionStatus,
        minutes: computeSubmissionMinutes(sub),
        hasComment: !!sub.comment?.trim(),
        hasUserEdits,
        hasAiWarning,
      };
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
    for (const d of days) {
      totalMinutes += d.minutes;
      if (!d.submission) continue;
      submittedCount++;
      const st = d.status as StaffDaySubmissionStatus;
      if (APPROVED_STATUSES.has(st)) approvedCount++;
      if (st === "submitted" || st === "edited" || st === "ai_flagged") awaitingCount++;
      if (st === "needs_control" || st === "needs_user_attention" || st === "correction_requested")
        needsFixCount++;
      if (st === "missing_report") missingCount++;
      if (st === "correction_requested") correctionRequestedCount++;
      if (st === "needs_user_attention") needsUserAttentionCount++;
      if (st === "needs_control") needsControlCount++;
      if (st === "ai_flagged") aiFlaggedCount++;
      if (APPROVABLE_STATUSES.has(st)) approvableCount++;
    }

    const hasTodo = days.some(
      (d) => d.submission && TODO_STATUSES.has(d.status as StaffDaySubmissionStatus),
    );
    const allDone =
      submittedCount > 0 &&
      days.every(
        (d) =>
          !d.submission ||
          APPROVED_STATUSES.has(d.status as StaffDaySubmissionStatus),
      );

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
  return bundle.approvableCount > 0;
}

/** True om hela veckans kvarvarande arbete kan godkännas i ett svep. */
export function isCleanWeekApproval(bundle: WeeklyStaffBundle): boolean {
  return (
    bundle.approvableCount > 0 &&
    bundle.correctionRequestedCount === 0 &&
    bundle.missingCount === 0 &&
    bundle.needsUserAttentionCount === 0
  );
}

export function parseDate(d: string): Date {
  return parseISO(d);
}
