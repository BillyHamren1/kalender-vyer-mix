export interface WeeklyApprovalsRealtimePayload {
  new?: {
    organization_id?: string | null;
    staff_id?: string | null;
    date?: string | null;
  } | null;
  old?: {
    organization_id?: string | null;
    staff_id?: string | null;
    date?: string | null;
  } | null;
}

interface MatchesWeeklyApprovalsRealtimeArgs {
  organizationId: string | null;
  weekStart: string;
  weekEnd: string;
  staffId?: string | null;
  payload: WeeklyApprovalsRealtimePayload;
}

const clampDate = (value: string | null | undefined): string | null => {
  if (!value) return null;
  return value.slice(0, 10);
};

export function matchesWeeklyApprovalsRealtime({
  organizationId,
  weekStart,
  weekEnd,
  staffId,
  payload,
}: MatchesWeeklyApprovalsRealtimeArgs): boolean {
  const row = payload.new ?? payload.old ?? null;
  if (!organizationId || !row) return false;
  if (row.organization_id !== organizationId) return false;
  if (staffId && row.staff_id !== staffId) return false;

  const date = clampDate(row.date);
  if (!date) return false;

  return date >= weekStart && date <= weekEnd;
}