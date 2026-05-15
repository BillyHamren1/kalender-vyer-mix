/**
 * useDisplayTimelineV2 — read-only Lager 4 Display Timeline för mobilen.
 *
 * Anropar `get-staff-presence-day` och plockar ut V2-fälten:
 *   - displayTimelineBlocksV2
 *   - displayTimelineDayActionsV2
 *   - displayTimelineDiagnosticsV2
 *   - workdayAllocationProposals
 *   - aiWorkdayReviewProposals
 *
 * Lager 4.5 — endast visning. Hooken skriver ingenting och får aldrig
 * krascha den vanliga TodayTab-vyn. Vid fel/saknad data returneras
 * `{ data: null }` och UI-komponenten väljer att inte rendera.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DisplayTimelineV2Action {
  actionType: string;
  type?: string;
  label: string;
  requiresAiValidation?: boolean;
  requiresUserNote?: boolean;
  severity?: 'info' | 'primary' | 'warning' | 'critical';
  payload?: Record<string, unknown>;
}

export interface DisplayTimelineV2Block {
  id: string;
  startAt: string;
  endAt: string;
  title: string;
  subtitle: string | null;
  displayType: string;
  durationMinutes: number;
  confidence: 'high' | 'medium' | 'low';
  severity: 'normal' | 'info' | 'warning' | 'needs_user_review';
  warnings: string[];
  humanWarnings: string[];
  actions: DisplayTimelineV2Action[];
  address?: string | null;
  label?: string | null;
}

export interface DisplayTimelineV2Data {
  blocks: DisplayTimelineV2Block[];
  dayActions: DisplayTimelineV2Action[];
  diagnostics: any | null;
  proposals: any[];
  aiProposals: any[];
}

interface UseDisplayTimelineV2Args {
  staffId: string | null | undefined;
  date: string | null | undefined;
  /** Sätt true för att stänga av hooken (t.ex. när användaren inte är inloggad). */
  disabled?: boolean;
}

interface UseDisplayTimelineV2Result {
  data: DisplayTimelineV2Data | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useDisplayTimelineV2({
  staffId,
  date,
  disabled,
}: UseDisplayTimelineV2Args): UseDisplayTimelineV2Result {
  const [data, setData] = useState<DisplayTimelineV2Data | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  const load = async () => {
    if (disabled || !staffId || !date) {
      setData(null);
      setError(null);
      return;
    }
    const myId = ++reqIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const { data: resp, error: invokeErr } = await supabase.functions.invoke(
        'get-staff-presence-day',
        { body: { staffId, date } },
      );
      if (myId !== reqIdRef.current) return;
      if (invokeErr) throw invokeErr;
      if (!resp || (resp as any).ok === false) {
        // Auth-fel eller annan kontrollerad respons → tyst fallback.
        setData(null);
        setError(null);
        return;
      }
      const r: any = resp;
      const blocksRaw = Array.isArray(r.displayTimelineBlocksV2)
        ? r.displayTimelineBlocksV2
        : [];
      if (blocksRaw.length === 0 && !r.displayTimelineDiagnosticsV2) {
        setData(null);
        return;
      }
      setData({
        blocks: blocksRaw,
        dayActions: Array.isArray(r.displayTimelineDayActionsV2)
          ? r.displayTimelineDayActionsV2
          : [],
        diagnostics: r.displayTimelineDiagnosticsV2 ?? null,
        proposals: Array.isArray(r.workdayAllocationProposals)
          ? r.workdayAllocationProposals
          : [],
        aiProposals: Array.isArray(r.aiWorkdayReviewProposals)
          ? r.aiWorkdayReviewProposals
          : [],
      });
    } catch (e: any) {
      if (myId !== reqIdRef.current) return;
      // Tyst fallback: V2 är experimentellt, ska aldrig krascha vyn.
      console.warn('[useDisplayTimelineV2] load failed (fallback)', e?.message ?? e);
      setData(null);
      setError(e?.message ?? String(e));
    } finally {
      if (myId === reqIdRef.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffId, date, disabled]);

  return { data, isLoading, error, refresh: load };
}
