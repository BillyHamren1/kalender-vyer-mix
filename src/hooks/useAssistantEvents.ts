/**
 * useAssistantEvents — React Query hook för assistenthändelse-modellen.
 *
 * Två separata listor (samma underliggande tabell):
 *   - pending: events att aktivt visa i prompt-kön (resolution=pending,
 *     stale_for_prompt=false). Driver UI-flöden som "missed arrival recovery".
 *   - review:  events relevanta för dagavstämning (still_relevant_for_review=true).
 *     Driver framtida day-review-vy. Ett event kan vara stale_for_prompt=true
 *     OCH still_relevant_for_review=true samtidigt — det är poängen.
 *
 * Realtime: lyssnar på postgres_changes mot assistant_events och invaliderar
 * båda listorna vid INSERT/UPDATE för aktuell staff. Gör att andra device/sessions
 * (eller cron som markerar stale) reflekteras direkt i UI:t.
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mobileApi } from '@/services/mobileApiService';
import { supabase } from '@/integrations/supabase/client';
import type { AssistantEvent } from '@/types/assistantEvent';

const PENDING_KEY = ['assistant-events', 'pending'] as const;
const REVIEW_KEY = ['assistant-events', 'review'] as const;

export function useAssistantEventsPending(staffId: string | null | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: PENDING_KEY,
    enabled: !!staffId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await mobileApi.assistantEvents.listPending();
      return (res.events ?? []) as AssistantEvent[];
    },
  });

  useEffect(() => {
    if (!staffId) return;
    const channel = supabase
      .channel(`assistant-events-pending-${staffId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'assistant_events', filter: `staff_id=eq.${staffId}` },
        () => {
          qc.invalidateQueries({ queryKey: PENDING_KEY });
          qc.invalidateQueries({ queryKey: REVIEW_KEY });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [staffId, qc]);

  return query;
}

export function useAssistantEventsReview(
  staffId: string | null | undefined,
  sinceIso?: string,
) {
  return useQuery({
    queryKey: [...REVIEW_KEY, sinceIso ?? 'all'],
    enabled: !!staffId,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await mobileApi.assistantEvents.listReview(sinceIso);
      return (res.events ?? []) as AssistantEvent[];
    },
  });
}

/**
 * Imperative helpers for resolve / dismiss / mark stale flows. Wraps mobileApi
 * and invalidates both pending and review queries on success so any open
 * dialogs reflect the new state immediately.
 */
export function useAssistantEventActions() {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: PENDING_KEY });
    qc.invalidateQueries({ queryKey: REVIEW_KEY });
  };

  return {
    resolve: async (input: Parameters<typeof mobileApi.assistantEvents.resolve>[0]) => {
      const res = await mobileApi.assistantEvents.resolve(input);
      invalidate();
      return res;
    },
    markStale: async (eventId: string) => {
      const res = await mobileApi.assistantEvents.markStale(eventId);
      invalidate();
      return res;
    },
    create: async (input: Parameters<typeof mobileApi.assistantEvents.create>[0]) => {
      const res = await mobileApi.assistantEvents.create(input);
      invalidate();
      return res;
    },
  };
}
