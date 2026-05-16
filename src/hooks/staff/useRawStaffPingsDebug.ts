import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RawPingSampleRow {
  id: string;
  staff_id: string;
  recorded_at: string;
  created_at: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  speed_mps: number | null;
  time_report_id: string | null;
}

export interface RawPingStaffEntry {
  staffId: string;
  staffName: string | null;
  pingCount: number;
  firstRecordedAt: string;
  lastRecordedAt: string;
  firstCreatedAt: string | null;
  lastCreatedAt: string | null;
  minAccuracy: number | null;
  medianAccuracy: number | null;
  p90Accuracy: number | null;
  maxAccuracy: number | null;
  averagePingGapMinutes: number | null;
  maxPingGapMinutes: number | null;
  gapCountOver15Min: number;
  gapCountOver60Min: number;
  hasPingsBeforeWorkdayLikely: boolean;
  hasPingsAfterWorkdayLikely: boolean;
  sampleRows: RawPingSampleRow[];
}

export interface RawPingsResponse {
  summary: {
    totalStaffWithPings: number;
    totalPingCount: number;
    staffWithOnlyFewPings: string[];
    staffWithLargeGaps: string[];
    staffWithNoRecentPing: string[];
    earliestPingAt: string | null;
    latestPingAt: string | null;
    intervalStart: string;
    intervalEnd: string;
    timezoneUsed: string;
  };
  perStaff: RawPingStaffEntry[];
  diagnostics: {
    queryWindow: { intervalStart: string; intervalEnd: string; timezoneUsed: string };
    rowLimitApplied: number | null;
    paginationUsed: { pageSize: number; pageCount: number; truncated: boolean };
    warnings: string[];
    readOnly: boolean;
    sourceTable: string;
    ignoredLayers: string[];
  };
}

interface Args {
  organizationId: string | null;
  date: string; // YYYY-MM-DD
  staffIds?: string[];
  includeRows?: boolean;
  enabled?: boolean;
}

export function useRawStaffPingsDebug({
  organizationId,
  date,
  staffIds,
  includeRows = false,
  enabled = true,
}: Args) {
  return useQuery<RawPingsResponse>({
    queryKey: ['debug-raw-staff-pings', organizationId, date, staffIds?.join(',') ?? '', includeRows],
    enabled: enabled && !!organizationId && !!date,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('debug-raw-staff-pings', {
        body: {
          organizationId,
          date,
          staffIds: staffIds && staffIds.length > 0 ? staffIds : undefined,
          includeRows,
          maxRowsPerStaff: 200,
        },
      });
      if (error) throw error;
      return data as RawPingsResponse;
    },
  });
}

export function isRawPingsDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('time-engine:raw-pings') === '1';
  } catch {
    return false;
  }
}
