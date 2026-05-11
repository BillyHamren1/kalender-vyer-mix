/**
 * useAiReviewedBlocks
 * ───────────────────
 * Läser staff_day_report_cache.report_candidate_blocks_json för (staffId, date)
 * och plockar ut aiReview-meta per blockId. Lyssnar på Supabase Realtime så
 * UI:t uppdateras direkt när AI-edge-funktionen patchar cachen.
 *
 * Read-only — ändrar inget.
 */
import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { AiReviewMeta } from '@/lib/staff/aiReview';

interface CachedBlock {
  id?: string;
  aiReview?: AiReviewMeta | null;
}

export function useAiReviewedBlocks(staffId: string | null | undefined, date: string | null | undefined) {
  const qc = useQueryClient();
  const queryKey = ['ai-reviewed-blocks', staffId ?? null, date ?? null];

  const query = useQuery({
    queryKey,
    enabled: !!staffId && !!date,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staff_day_report_cache')
        .select('report_candidate_blocks_json, ai_review_pending, ai_review_at')
        .eq('staff_id', staffId!)
        .eq('date', date!)
        .maybeSingle();
      if (error) throw error;
      const blocks: CachedBlock[] = Array.isArray(data?.report_candidate_blocks_json)
        ? (data!.report_candidate_blocks_json as CachedBlock[])
        : [];
      const map = new Map<string, AiReviewMeta>();
      for (const b of blocks) {
        if (b?.id && b.aiReview && b.aiReview.reviewed) {
          map.set(b.id, b.aiReview);
        }
      }
      return {
        byId: map,
        pending: !!data?.ai_review_pending,
        reviewedAt: (data?.ai_review_at as string | null) ?? null,
      };
    },
  });

  useEffect(() => {
    if (!staffId || !date) return;
    const channel = supabase
      .channel(`ai-review-${staffId}-${date}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'staff_day_report_cache',
          filter: `staff_id=eq.${staffId}`,
        },
        (payload: any) => {
          const row = (payload.new ?? payload.old) as { date?: string } | null;
          if (row?.date === date) {
            qc.invalidateQueries({ queryKey });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId, date]);

  return useMemo(
    () => ({
      byId: query.data?.byId ?? new Map<string, AiReviewMeta>(),
      pending: query.data?.pending ?? false,
      reviewedAt: query.data?.reviewedAt ?? null,
      isLoading: query.isLoading,
    }),
    [query.data, query.isLoading],
  );
}
