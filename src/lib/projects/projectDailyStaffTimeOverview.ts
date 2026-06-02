/**
 * projectDailyStaffTimeOverview
 * ============================================================================
 * Pure builder för dag-för-dag-status av personalen på ett projekt/large project.
 *
 * Inputs:
 *   - assignedDays:   (date, staff_id) — vem som var bemannad enligt BSA / LP-team
 *   - submissions:    staff_day_submissions per (date, staff_id) — vem rapporterat
 *   - approvedRows:   project_staff_time_cost_lines per (date, staff_id) — godkänd kostnad
 *
 * Status per (date, staff_id):
 *   - 'approved'        : assigned + approved cost line          → "Godkänd"
 *   - 'submitted'       : assigned + submission, ingen approved   → "Inskickad"
 *   - 'missing'         : assigned + ingen submission, ingen cost → "Saknas"
 *   - 'extra_approved'  : EJ assigned + approved cost line        → "Extra rapporterad"
 *   - 'extra_submitted' : EJ assigned + submission, ingen approved→ "Extra (inskickad)"
 *
 * Inga DB-anrop. Idempotent. 100% testbar.
 */

export type DailyStaffStatus =
  | 'approved'
  | 'submitted'
  | 'missing'
  | 'extra_approved'
  | 'extra_submitted';

export interface AssignedDay {
  date: string; // yyyy-MM-dd
  staff_id: string;
  source: 'bsa' | 'lp_team' | 'manual';
}

export interface SubmissionInput {
  date: string;
  staff_id: string;
  status: string; // draft | submitted | approved | payroll_approved | rejected | corrected | ...
  submitted_at: string | null;
}

export interface ApprovedRowInput {
  date: string;
  staff_id: string;
  minutes: number;
  cost: number;
  /**
   * Defaultas till 'approved' så befintliga tester och konsumenter inte
   * går sönder. Hooken sätter alltid det riktiga värdet baserat på
   * submission_status.
   */
  approvalState?: 'approved' | 'unapproved';
  hourlyRate?: number;
  startAt?: string | null;
  endAt?: string | null;
  rateSource?: string | null;
  submissionStatus?: string | null;
}

export interface DailyStaffRow {
  date: string;
  staff_id: string;
  staff_name: string | null;
  status: DailyStaffStatus;
  assigned: boolean;
  hasSubmission: boolean;
  submissionStatus: string | null;
  approvedMinutes: number;
  approvedCost: number;
  unapprovedMinutes: number;
  unapprovedCost: number;
  totalMinutes: number;
  totalCost: number;
  hourlyRate: number | null;
  rateSource: string | null;
  startAt: string | null;
  endAt: string | null;
  approvalState: 'approved' | 'unapproved' | 'none';
}

export interface DailyOverviewRow {
  date: string;
  rows: DailyStaffRow[];
  totals: {
    assigned: number;
    missing: number;
    submitted: number;
    approved: number;
    extra: number;
    approvedMinutes: number;
    approvedCost: number;
    unapprovedMinutes: number;
    unapprovedCost: number;
    totalMinutes: number;
    totalCost: number;
    staffCount: number;
    hasUnapproved: boolean;
  };
}

const STATUSES_THAT_MEAN_SUBMITTED = new Set([
  'submitted',
  'approved',
  'payroll_approved',
  'corrected',
]);

export function statusLabel(s: DailyStaffStatus): string {
  switch (s) {
    case 'approved':
      return 'Godkänd';
    case 'submitted':
      return 'Inskickad';
    case 'missing':
      return 'Saknas';
    case 'extra_approved':
      return 'Extra rapporterad';
    case 'extra_submitted':
      return 'Extra (inskickad)';
  }
}

interface BuildInput {
  assignedDays: AssignedDay[];
  submissions: SubmissionInput[];
  approvedRows: ApprovedRowInput[];
  staffNames?: Record<string, string | null>;
}

/**
 * Bygg dag-för-dag-overview.
 * Returnerar en lista per datum sorterad ASC, med rows sorterade på staff_name.
 */
export function buildProjectDailyStaffTimeOverview(
  input: BuildInput,
): DailyOverviewRow[] {
  const { assignedDays, submissions, approvedRows, staffNames = {} } = input;

  // Index alla källor på (date|staff_id)
  const assignedSet = new Set<string>();
  assignedDays.forEach((a) => assignedSet.add(`${a.date}|${a.staff_id}`));

  const submissionByKey = new Map<string, SubmissionInput>();
  submissions.forEach((s) => {
    const k = `${s.date}|${s.staff_id}`;
    const prev = submissionByKey.get(k);
    // Behåll den "starkaste" — payroll_approved > approved > submitted > corrected > draft
    if (!prev || statusWeight(s.status) > statusWeight(prev.status)) {
      submissionByKey.set(k, s);
    }
  });

  const approvedByKey = new Map<string, { minutes: number; cost: number }>();
  approvedRows.forEach((r) => {
    const k = `${r.date}|${r.staff_id}`;
    const prev = approvedByKey.get(k) ?? { minutes: 0, cost: 0 };
    prev.minutes += Number(r.minutes) || 0;
    prev.cost += Number(r.cost) || 0;
    approvedByKey.set(k, prev);
  });

  // Bygg union av alla (date|staff_id)
  const allKeys = new Set<string>();
  assignedSet.forEach((k) => allKeys.add(k));
  submissionByKey.forEach((_v, k) => allKeys.add(k));
  approvedByKey.forEach((_v, k) => allKeys.add(k));

  const rowsByDate = new Map<string, DailyStaffRow[]>();

  for (const key of allKeys) {
    const [date, staff_id] = key.split('|');
    const assigned = assignedSet.has(key);
    const submission = submissionByKey.get(key) ?? null;
    const approved = approvedByKey.get(key) ?? null;

    const hasSubmission =
      !!submission && STATUSES_THAT_MEAN_SUBMITTED.has(submission.status);
    const hasApproved = !!approved && approved.minutes > 0;

    let status: DailyStaffStatus;
    if (assigned && hasApproved) status = 'approved';
    else if (assigned && hasSubmission) status = 'submitted';
    else if (assigned) status = 'missing';
    else if (hasApproved) status = 'extra_approved';
    else status = 'extra_submitted';

    const row: DailyStaffRow = {
      date,
      staff_id,
      staff_name: staffNames[staff_id] ?? null,
      status,
      assigned,
      hasSubmission,
      submissionStatus: submission?.status ?? null,
      approvedMinutes: approved?.minutes ?? 0,
      approvedCost: approved?.cost ?? 0,
    };

    const list = rowsByDate.get(date) ?? [];
    list.push(row);
    rowsByDate.set(date, list);
  }

  const result: DailyOverviewRow[] = Array.from(rowsByDate.entries())
    .map(([date, rows]) => {
      rows.sort((a, b) => {
        const an = a.staff_name ?? '';
        const bn = b.staff_name ?? '';
        if (an && bn) return an.localeCompare(bn, 'sv');
        return a.staff_id.localeCompare(b.staff_id);
      });
      const totals = rows.reduce(
        (acc, r) => {
          if (r.assigned) acc.assigned++;
          if (r.status === 'missing') acc.missing++;
          if (r.status === 'submitted') acc.submitted++;
          if (r.status === 'approved') acc.approved++;
          if (r.status === 'extra_approved' || r.status === 'extra_submitted') acc.extra++;
          acc.approvedMinutes += r.approvedMinutes;
          acc.approvedCost += r.approvedCost;
          return acc;
        },
        {
          assigned: 0,
          missing: 0,
          submitted: 0,
          approved: 0,
          extra: 0,
          approvedMinutes: 0,
          approvedCost: 0,
        },
      );
      return { date, rows, totals };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return result;
}

function statusWeight(s: string): number {
  switch (s) {
    case 'payroll_approved':
      return 5;
    case 'approved':
      return 4;
    case 'corrected':
      return 3;
    case 'submitted':
      return 2;
    case 'rejected':
      return 1;
    case 'draft':
      return 0;
    default:
      return 0;
  }
}
