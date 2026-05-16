import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface StaffDaySubmissionRow {
  id: string;
  staff_id: string;
  date: string; // yyyy-MM-dd
  status: string;
  comment: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  user_edits_json: any | null;
  ai_validation_json: any | null;
  display_timeline_snapshot_json: any | null;
}

/**
 * Lager 5.7 — Read-only läsning av användarens egna submissions för en period.
 * Detta är INTE admin-approval; det är status på användarens inskickade dag.
 * RLS: select inom organisationen.
 */
export function useStaffDaySubmissionsRange(
  staffId: string | null | undefined,
  fromDate: string,
  toDate: string,
) {
  return useQuery({
    queryKey: ['staff-day-submissions-range', staffId, fromDate, toDate],
    enabled: !!staffId,
    staleTime: 30_000,
    queryFn: async (): Promise<StaffDaySubmissionRow[]> => {
      if (!staffId) return [];
      const { data, error } = await supabase
        .from('staff_day_submissions' as any)
        .select(
          'id, staff_id, date, status, comment, submitted_at, reviewed_at, user_edits_json, ai_validation_json, display_timeline_snapshot_json',
        )
        .eq('staff_id', staffId)
        .gte('date', fromDate)
        .lte('date', toDate);
      if (error) {
        // Fallback: tabellen kan saknas i äldre miljöer — krascha inte vyn.
        console.warn('[useStaffDaySubmissionsRange] read failed, returning empty:', error.message);
        return [];
      }
      return ((data ?? []) as unknown) as StaffDaySubmissionRow[];
    },
  });
}

export type SubmissionDisplayStatus =
  | 'no_activity'
  | 'awaiting_user'
  | 'submitted_by_user'
  | 'edited_by_user'
  | 'needs_user_attention'
  | 'ai_flagged';

export interface SubmissionDisplay {
  status: SubmissionDisplayStatus;
  label: string;
  tone: 'muted' | 'info' | 'success' | 'warning' | 'danger';
  editCount: number;
  warningCount: number;
  aiSummary: string | null;
  submittedAt: string | null;
  comment: string | null;
}

/**
 * Avleder visnings-status per dag utifrån submission + om dagen har någon aktivitet.
 * Skriver inget — ren projektion.
 */
export function deriveSubmissionDisplay(
  submission: StaffDaySubmissionRow | undefined,
  hasAnyActivity: boolean,
): SubmissionDisplay | null {
  if (!submission) {
    if (!hasAnyActivity) return null;
    return {
      status: 'awaiting_user',
      label: 'Väntar på användarens godkännande',
      tone: 'warning',
      editCount: 0,
      warningCount: 0,
      aiSummary: null,
      submittedAt: null,
      comment: null,
    };
  }

  const edits = Array.isArray(submission.user_edits_json?.edits)
    ? submission.user_edits_json.edits
    : Array.isArray(submission.user_edits_json)
      ? submission.user_edits_json
      : [];
  const editCount = edits.length;

  const ai = submission.ai_validation_json ?? null;
  const validationStatus: string | null = ai?.validationStatus ?? ai?.status ?? null;
  const warnings = Array.isArray(ai?.warnings) ? ai.warnings : [];
  const warningCount = warnings.length;
  const aiSummary =
    typeof ai?.summary === 'string'
      ? ai.summary
      : warnings[0]?.message ?? null;

  let status: SubmissionDisplayStatus;
  let label: string;
  let tone: SubmissionDisplay['tone'];

  if (validationStatus === 'flagged_conflicts_with_evidence') {
    status = 'ai_flagged';
    label = 'AI flaggade avvikelse';
    tone = 'danger';
  } else if (validationStatus === 'needs_user_confirmation') {
    status = 'needs_user_attention';
    label = 'Behöver användarens bekräftelse';
    tone = 'warning';
  } else if (editCount > 0) {
    status = 'edited_by_user';
    label = 'Redigerad av användare';
    tone = 'info';
  } else {
    status = 'submitted_by_user';
    label = 'Inskickad av användare';
    tone = 'success';
  }

  return {
    status,
    label,
    tone,
    editCount,
    warningCount,
    aiSummary,
    submittedAt: submission.submitted_at,
    comment: submission.comment,
  };
}
