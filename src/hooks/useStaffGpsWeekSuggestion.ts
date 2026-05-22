/**
 * useStaffGpsWeekSuggestion — GPS-baserat tidsförslag per dag i ett intervall.
 *
 * Speglar admin /staff-management/gps-map. Renderas i mobilens Time-flik som
 * grund för rapporten. Mobilen tolkar/summerar ALDRIG själv — allt sker
 * server-side i edge functionen `get-mobile-staff-gps-day-suggestion`.
 */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { callStaffSnapshotFunction } from '@/services/staffSnapshotApi';
import { useMobileAuth } from '@/contexts/MobileAuthContext';

export interface GpsPerTarget {
  kind: 'booking' | 'project' | 'location' | 'home' | 'unknown';
  id: string;
  name: string;
  minutes: number;
}

export interface GpsDaySuggestion {
  date: string;
  hasGps: boolean;
  suggestedStartIso: string | null;
  suggestedEndIso: string | null;
  suggestedWorkMinutes: number;
  suggestedTravelMinutes: number;
  suggestedBreakMinutes: number;
  perTarget: GpsPerTarget[];
  segmentCount: number;
  gapMinutesTotal: number;
  reportStatus:
    | 'empty' | 'draft' | 'submitted' | 'approved'
    | 'edited' | 'ai_flagged' | 'needs_user_attention' | 'payroll_approved';
}

interface SuggestionResponse {
  staffId: string;
  days: GpsDaySuggestion[];
  generatedAt: string;
}

export type PeriodKindForSuggestion = 'day' | 'week' | 'month';

export interface UseStaffGpsWeekSuggestionArgs {
  kind: PeriodKindForSuggestion;
  anchor: Date;
  staffId?: string | null;
}

export function useStaffGpsWeekSuggestion({ kind, anchor, staffId }: UseStaffGpsWeekSuggestionArgs) {
  const { effectiveStaffId } = useMobileAuth();
  const targetStaffId = staffId ?? effectiveStaffId ?? null;

  const { startDate, endDate } = useMemo(() => {
    if (kind === 'day') {
      const d = format(anchor, 'yyyy-MM-dd');
      return { startDate: d, endDate: d };
    }
    if (kind === 'week') {
      const s = startOfWeek(anchor, { weekStartsOn: 1 });
      const e = endOfWeek(anchor, { weekStartsOn: 1 });
      return { startDate: format(s, 'yyyy-MM-dd'), endDate: format(e, 'yyyy-MM-dd') };
    }
    const s = startOfMonth(anchor);
    const e = endOfMonth(anchor);
    return { startDate: format(s, 'yyyy-MM-dd'), endDate: format(e, 'yyyy-MM-dd') };
  }, [kind, anchor]);

  const query = useQuery<SuggestionResponse>({
    queryKey: ['mobile-gps-suggestion', targetStaffId, startDate, endDate],
    queryFn: async () => {
      if (!targetStaffId) {
        return { staffId: '', days: [], generatedAt: new Date().toISOString() };
      }
      try {
        return await callStaffSnapshotFunction<SuggestionResponse>(
          'get-mobile-staff-gps-day-suggestion',
          { staffId: targetStaffId, startDate, endDate },
        );
      } catch (err) {
        // GPS-förslag är ett mjukt komplement — backa till tom lista vid fel,
        // exponera felmeddelandet i `error`-kanalen så UI kan välja att tysta.
        const message = err instanceof Error ? err.message : 'snapshot_failed';
        if (message === 'snapshot_unauthorized') {
          return { staffId: targetStaffId, days: [], generatedAt: new Date().toISOString() };
        }
        throw err;
      }
    },
    enabled: !!targetStaffId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const suggestionsByDate = useMemo(() => {
    const map = new Map<string, GpsDaySuggestion>();
    for (const day of query.data?.days ?? []) {
      map.set(day.date, day);
    }
    return map;
  }, [query.data]);

  return {
    suggestionsByDate,
    rawDays: query.data?.days ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

/** Bygg en lista av dagar i intervallet (för fallback när hook ej körts). */
export function expandDateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(`${start}T00:00:00Z`).getTime();
  const e = new Date(`${end}T00:00:00Z`).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || s > e) return out;
  for (let t = s; t <= e; t += 24 * 3600 * 1000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Util för en dag (för DayView i Time-tabben). */
export function useStaffGpsDaySuggestion(date: string | null) {
  const { effectiveStaffId } = useMobileAuth();
  const query = useQuery<SuggestionResponse>({
    queryKey: ['mobile-gps-suggestion', 'day', effectiveStaffId, date],
    queryFn: async () => {
      if (!effectiveStaffId || !date) {
        return { staffId: '', days: [], generatedAt: new Date().toISOString() };
      }
      return await callStaffSnapshotFunction<SuggestionResponse>(
        'get-mobile-staff-gps-day-suggestion',
        { staffId: effectiveStaffId, date },
      );
    },
    enabled: !!effectiveStaffId && !!date,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  return {
    suggestion: query.data?.days?.[0] ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

// Markeras som använda så TS inte klagar i tester
addDays;
