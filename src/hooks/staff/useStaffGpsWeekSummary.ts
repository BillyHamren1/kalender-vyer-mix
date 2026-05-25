import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { format } from 'date-fns';
import { callStaffSnapshotFunction } from '@/services/staffSnapshotApi';

export interface StaffGpsPlaceTime {
  name: string;
  minutes: number;
}

export interface StaffGpsDaySummary {
  date: string;
  pingsCount: number;
  firstIso: string | null;
  lastIso: string | null;
  durationMin: number;
  visitsCount: number;
  placeNames: string[];
  places: StaffGpsPlaceTime[];
  isLoading: boolean;
}

interface BatchResponse {
  staffId: string;
  days: Array<{
    date: string;
    pingsCount: number;
    firstIso: string | null;
    lastIso: string | null;
    durationMin: number;
    places: StaffGpsPlaceTime[];
    placeNames: string[];
    visitsCount: number;
  }>;
  generatedAt: string;
}

/**
 * Admin GPS week panel summary.
 *
 * Servern bygger summary från EXAKT samma snapshot som detaljkartan visar
 * (staff_gps_day_snapshots → buildExactGeofenceVisits). En enda batch-request
 * per (staff × vecka). Cachen träffas oftast direkt (input_signature = oförändrat
 * antal pings + max recorded_at), så detaljvyn delar samma snapshot utan nya
 * pings-läsningar.
 */
export function useStaffGpsWeekSummary(
  staffId: string | null,
  weekDates: Date[],
): StaffGpsDaySummary[] {
  const dateStrs = useMemo(
    () => weekDates.map(d => format(d, 'yyyy-MM-dd')),
    [weekDates],
  );

  const datesKey = dateStrs.join(',');

  const query = useQuery({
    queryKey: ['staff-gps-week-summary', staffId, datesKey],
    enabled: !!staffId && dateStrs.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      return callStaffSnapshotFunction<BatchResponse>(
        'get-staff-gps-week-summary',
        { staffId, dates: dateStrs },
      );
    },
  });

  return useMemo<StaffGpsDaySummary[]>(() => {
    const byDate = new Map<string, BatchResponse['days'][number]>();
    for (const d of query.data?.days ?? []) byDate.set(d.date, d);

    return dateStrs.map((date) => {
      const row = byDate.get(date);
      if (!row) {
        return {
          date,
          pingsCount: 0,
          firstIso: null,
          lastIso: null,
          durationMin: 0,
          visitsCount: 0,
          placeNames: [],
          places: [],
          isLoading: query.isLoading,
        };
      }
      return {
        date,
        pingsCount: row.pingsCount,
        firstIso: row.firstIso,
        lastIso: row.lastIso,
        durationMin: row.durationMin,
        visitsCount: row.visitsCount,
        placeNames: row.placeNames,
        places: row.places,
        isLoading: false,
      };
    });
  }, [dateStrs, query.data, query.isLoading]);
}
