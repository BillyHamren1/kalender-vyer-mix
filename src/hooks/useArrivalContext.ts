import { useEffect, useState, useRef } from 'react';
import { mobileApi } from '@/services/mobileApiService';
import type { TravelCompletedInfo } from '@/hooks/useTravelDetection';

/**
 * useArrivalContext
 * -----------------
 * When a TravelCompletedInfo arrives WITHOUT a server-matched booking,
 * call classify-arrival-context to find out whether this destination is:
 *   - a planned job the user isn't assigned to (Scenario A)
 *   - a restaurant during lunch (Scenario B)
 *   - a supply store (Scenario C)
 *   - or unknown (no smart prompt)
 *
 * Returns null while loading or when no smart suggestion applies.
 */

export interface ArrivalContextSuggestion {
  kind: 'unplanned_job_candidate' | 'meal_break' | 'supply_store';
  confidence: number;
  suggestion_id: string | null;
  payload: Record<string, unknown>;
}

export function useArrivalContext(
  completed: TravelCompletedInfo | null,
  enabled: boolean,
): { suggestion: ArrivalContextSuggestion | null; loading: boolean } {
  const [suggestion, setSuggestion] = useState<ArrivalContextSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const lastTravelLogIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !completed) {
      setSuggestion(null);
      return;
    }
    // Only classify when server didn't already match a booking
    if (completed.matchedBookingId) {
      setSuggestion(null);
      return;
    }
    // Avoid duplicate classification for the same travel log
    if (lastTravelLogIdRef.current === completed.travelLogId) return;
    lastTravelLogIdRef.current = completed.travelLogId;

    let cancelled = false;
    setLoading(true);
    setSuggestion(null);

    mobileApi
      .classifyArrivalContext({
        travel_log_id: completed.travelLogId,
        lat: completed.toLat,
        lng: completed.toLng,
        to_address: completed.toAddress,
      })
      .then((res) => {
        if (cancelled) return;
        if (
          res.kind === 'unplanned_job_candidate' ||
          res.kind === 'meal_break' ||
          res.kind === 'supply_store'
        ) {
          if (res.confidence >= 0.5) {
            setSuggestion({
              kind: res.kind,
              confidence: res.confidence,
              suggestion_id: res.suggestion_id,
              payload: res.payload || {},
            });
          }
        }
      })
      .catch((err) => {
        console.warn('[useArrivalContext] classify failed:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, completed]);

  return { suggestion, loading };
}
