import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { format } from 'date-fns';
import { callStaffSnapshotFunction } from '@/services/staffSnapshotApi';
import type { DaySegment } from '@/lib/staff-gps/dayPartition';

export interface StaffGpsPlaceTime {
  name: string;
  minutes: number;
}

export interface StaffGpsDaySummary {
  date: string;
  pingsCount: number;
  firstIso: string | null;
  lastIso: string | null;
  /** Arbetstid på kända platser (workMin). */
  durationMin: number;
  /** Hela fönstret last−first i minuter. */
  windowMin: number;
  workMin: number;
  privateMin: number;
  travelMin: number;
  unknownMin: number;
  gapMin: number;
  idleMin: number;
  visitsCount: number;
  placeNames: string[];
  places: StaffGpsPlaceTime[];
  /** Hela dagens partition — varje minut tillhör ett segment. */
  segments: DaySegment[];
  isLoading: boolean;
}

interface DayRow {
  date: string;
  pingsCount: number;
  firstIso: string | null;
  lastIso: string | null;
  durationMin: number;
  windowMin?: number;
  workMin?: number;
  privateMin?: number;
  travelMin?: number;
  unknownMin?: number;
  gapMin?: number;
  idleMin?: number;
  places: StaffGpsPlaceTime[];
  placeNames: string[];
  visitsCount: number;
  segments?: DaySegment[];
}

interface BatchResponse {
  staffId: string;
  days: DayRow[];
  generatedAt: string;
}

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
    const byDate = new Map<string, DayRow>();
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
          windowMin: 0,
          workMin: 0,
          privateMin: 0,
          travelMin: 0,
          unknownMin: 0,
          gapMin: 0,
          idleMin: 0,
          visitsCount: 0,
          placeNames: [],
          places: [],
          segments: [],
          isLoading: query.isLoading,
        };
      }
      return {
        date,
        pingsCount: row.pingsCount,
        firstIso: row.firstIso,
        lastIso: row.lastIso,
        durationMin: row.durationMin,
        windowMin: row.windowMin ?? row.durationMin,
        workMin: row.workMin ?? row.durationMin,
        privateMin: row.privateMin ?? 0,
        travelMin: row.travelMin ?? 0,
        unknownMin: row.unknownMin ?? 0,
        gapMin: row.gapMin ?? 0,
        idleMin: row.idleMin ?? 0,
        visitsCount: row.visitsCount,
        placeNames: row.placeNames,
        places: row.places,
        segments: row.segments ?? [],
        isLoading: false,
      };
    });
  }, [dateStrs, query.data, query.isLoading]);
}
