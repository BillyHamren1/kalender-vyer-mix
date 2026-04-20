export type ApprovalSourceType = 'time_report' | 'travel_log';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface UnifiedApprovalRow {
  id: string;
  organizationId: string;
  sourceType: ApprovalSourceType;
  staffId: string;
  staffName: string;
  projectId: string;
  projectLabel: string;
  reportDate: string;
  startTime: string | null;
  endTime: string | null;
  hoursWorked: number;
  overtimeHours: number;
  description: string | null;
  approved: boolean;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectionComment: string | null;
  createdAt: string;
  typeLabel: string;
}

export interface ReportGroup {
  key: string;
  label: string;
  totalHours: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  rows: UnifiedApprovalRow[];
}

export function getApprovalStatus(row: Pick<UnifiedApprovalRow, 'approved' | 'rejectedAt'>): ApprovalStatus {
  if (row.rejectedAt) return 'rejected';
  if (row.approved) return 'approved';
  return 'pending';
}

function sortRows(rows: UnifiedApprovalRow[]) {
  return [...rows].sort((a, b) => {
    if (a.reportDate !== b.reportDate) {
      return b.reportDate.localeCompare(a.reportDate);
    }

    return (b.startTime || '').localeCompare(a.startTime || '');
  });
}

function buildGroups(
  rows: UnifiedApprovalRow[],
  getKey: (row: UnifiedApprovalRow) => string,
  getLabel: (row: UnifiedApprovalRow) => string,
): ReportGroup[] {
  const groups = new Map<string, ReportGroup>();

  for (const row of sortRows(rows)) {
    const key = getKey(row);
    const existing = groups.get(key) ?? {
      key,
      label: getLabel(row),
      totalHours: 0,
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
      rows: [],
    };

    existing.rows.push(row);
    existing.totalHours += row.hoursWorked;

    const status = getApprovalStatus(row);
    if (status === 'pending') existing.pendingCount += 1;
    if (status === 'approved') existing.approvedCount += 1;
    if (status === 'rejected') existing.rejectedCount += 1;

    groups.set(key, existing);
  }

  return [...groups.values()].sort((a, b) => {
    if (a.pendingCount !== b.pendingCount) return b.pendingCount - a.pendingCount;
    if (a.totalHours !== b.totalHours) return b.totalHours - a.totalHours;
    return a.label.localeCompare(b.label, 'sv');
  });
}

export function groupReportsByStaff(rows: UnifiedApprovalRow[]): ReportGroup[] {
  return buildGroups(rows, (row) => row.staffId, (row) => row.staffName);
}

export function groupReportsByProject(rows: UnifiedApprovalRow[]): ReportGroup[] {
  return buildGroups(rows, (row) => row.projectId, (row) => row.projectLabel);
}

export function buildExportRows(rows: UnifiedApprovalRow[]) {
  return sortRows(rows).map((row) => ({
    datum: row.reportDate,
    användare: row.staffName,
    projekt: row.projectLabel,
    typ: row.typeLabel,
    status: getApprovalStatus(row),
    start: row.startTime || '',
    slut: row.endTime || '',
    timmar: row.hoursWorked,
    övertid: row.overtimeHours,
    beskrivning: row.description || '',
    godkänd_av: row.approvedBy || '',
    godkänd_at: row.approvedAt || '',
    avvisad_av: row.rejectedBy || '',
    avvisad_at: row.rejectedAt || '',
    avvisningskommentar: row.rejectionComment || '',
  }));
}
