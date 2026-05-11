import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export type AiReviewStatus =
  | 'suggested'
  | 'accepted'
  | 'rejected'
  | 'superseded'
  | 'needs_human_review';

export type AiReviewClassification =
  | 'work'
  | 'transport'
  | 'unknown'
  | 'break'
  | 'private'
  | 'exclude_from_report'
  | 'needs_human_review';

export type AiReviewConfidence = 'very_high' | 'high' | 'medium' | 'low';

export type AiReviewActionType =
  | 'mark_as_transport'
  | 'mark_as_work'
  | 'exclude_pre_work'
  | 'keep_needs_review'
  | 'request_user_input'
  | 'merge_with_previous'
  | 'merge_with_next';

export interface TimeReportAiReviewRow {
  id: string;
  organization_id: string;
  staff_id: string;
  date: string;
  block_id: string;
  engine_version: string | null;
  review_status: AiReviewStatus;
  current_classification: string | null;
  current_kind: string | null;
  current_confidence: string | null;
  suggested_classification: AiReviewClassification | null;
  suggested_kind: string | null;
  suggested_label: string | null;
  suggested_minutes: number | null;
  confidence: AiReviewConfidence | null;
  confidence_score: number | null;
  reasoning_summary: string | null;
  evidence_json: Record<string, unknown> | null;
  suggested_action_json: { actionType: AiReviewActionType; payload?: Record<string, unknown> } | null;
  concerns_json: string[] | null;
  evidence_used_json: string[] | null;
  admin_feedback: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RequestAiReviewInput {
  organizationId: string;
  staffId: string;
  date: string;
  blockId: string;
  engineVersion?: string;
  blockSnapshot: Record<string, unknown>;
  contextSnapshot?: Record<string, unknown>;
  dryRun?: boolean;
}

export async function requestAiReview(input: RequestAiReviewInput) {
  const { data, error } = await supabase.functions.invoke('analyze-time-report-block', {
    body: input,
  });
  if (error) throw error;
  return data as { review: unknown; row?: TimeReportAiReviewRow; dryRun?: boolean };
}

export async function resolveAiReview(input: {
  reviewId: string;
  decision: 'accepted' | 'rejected' | 'needs_human_review';
  adminFeedback?: string;
}) {
  const { data, error } = await supabase.functions.invoke('resolve-time-report-ai-review', {
    body: input,
  });
  if (error) throw error;
  return data as { row: TimeReportAiReviewRow };
}

export function useAiReviewsForDay(args: {
  staffId: string | null | undefined;
  date: string | null | undefined;
}) {
  const enabled = Boolean(args.staffId && args.date);
  return useQuery({
    queryKey: ['time-report-ai-reviews', args.staffId, args.date],
    enabled,
    queryFn: async (): Promise<TimeReportAiReviewRow[]> => {
      if (!args.staffId || !args.date) return [];
      const { data, error } = await supabase
        .from('time_report_ai_reviews')
        .select('*')
        .eq('staff_id', args.staffId)
        .eq('date', args.date)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TimeReportAiReviewRow[];
    },
  });
}

export function useRequestAiReviewMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: requestAiReview,
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['time-report-ai-reviews', vars.staffId, vars.date] });
    },
  });
}

export function useResolveAiReviewMutation(args: {
  staffId: string | null | undefined;
  date: string | null | undefined;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: resolveAiReview,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time-report-ai-reviews', args.staffId, args.date] });
    },
  });
}

/**
 * Bestämmer om ett rapportkandidatblock är "osäkert nog" för AI-granskning.
 */
export function isBlockEligibleForAiReview(block: {
  kind?: string;
  reviewState?: string;
  confidence?: string;
}): boolean {
  if (!block) return false;
  if (block.reviewState === 'needs_review') return true;
  if (block.kind === 'unknown' || block.kind === 'needs_review') return true;
  if (
    (block.kind === 'transport' || block.kind === 'work') &&
    (block.confidence === 'low' || block.confidence === 'medium')
  ) {
    return true;
  }
  return false;
}
