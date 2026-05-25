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
  allDone: boolean;
  hasTodo: boolean;
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

  // Inkludera även personer som inte finns i staff-listan (fallback)
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
    // Senaste per datum
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
    for (const d of days) {
      totalMinutes += d.minutes;
      if (d.submission) {
        submittedCount++;
        if (APPROVED_STATUSES.has(d.status as StaffDaySubmissionStatus)) approvedCount++;
        if (d.status === "submitted" || d.status === "edited" || d.status === "ai_flagged") awaitingCount++;
        if (
          d.status === "needs_control" ||
          d.status === "needs_user_attention" ||
          d.status === "correction_requested"
        ) needsFixCount++;
      } else {
        missingCount++;
      }
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

    bundles.push({
      staff: member,
      days,
      submissions: subs,
      totalMinutes,
      submittedCount,
      approvedCount,
      awaitingCount,
      needsFixCount,
      missingCount,
      allDone,
      hasTodo,
    });
  }

  // Sortera: hasTodo först (mest att göra), sedan namn
  bundles.sort((a, b) => {
    if (a.hasTodo !== b.hasTodo) return a.hasTodo ? -1 : 1;
    if (a.needsFixCount !== b.needsFixCount) return b.needsFixCount - a.needsFixCount;
    if (a.awaitingCount !== b.awaitingCount) return b.awaitingCount - a.awaitingCount;
    return a.staff.name.localeCompare(b.staff.name, "sv");
  });

  return bundles;
}

export function isWeekFullyApprovable(bundle: WeeklyStaffBundle): boolean {
  // Vi godkänner endast bundlen via knappen om det finns minst en approvable dag
  // OCH inga correction_requested / missing_report blockar.
  const blocking = bundle.days.some(
    (d) =>
      (d.submission && (d.status === "correction_requested" || d.status === "payroll_approved")) ||
      d.status === "missing_report",
  );
  const anyApprovable = bundle.days.some(
    (d) =>
      d.submission &&
      (d.status === "submitted" ||
        d.status === "edited" ||
        d.status === "ai_flagged" ||
        d.status === "needs_control" ||
        d.status === "needs_user_attention"),
  );
  return !blocking && anyApprovable;
}

export function parseDate(d: string): Date {
  return parseISO(d);
}
