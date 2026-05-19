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
  battery_level: number | null;
  battery_percent: number | null;
  is_charging: boolean | null;
  battery_captured_at: string | null;
  battery_source: string | null;
}

export interface RawPingBatterySummary {
  firstBatteryPercent: number | null;
  lastBatteryPercent: number | null;
  minBatteryPercent: number | null;
  maxBatteryPercent: number | null;
  latestIsCharging: boolean | null;
  batterySamplesCount: number;
  missingBatterySamplesCount: number;
  batteryDroppedFast: boolean;
  likelyBatteryRelatedSignalLoss: boolean;
}

export interface RawPingStaffEntry {
  staffId: string;
  staffName: string | null;
  pingCount: number;
  /** Total antal pings i window (samma som pingCount). */
  totalPingCount?: number;
  /** Antal rader som faktiskt returneras i sampleRows. */
  sampleRowsCount?: number;
  /** True när pingCount > sampleRows.length (rader klippta). */
  rowsTruncated?: boolean;
  /** Per-staff cap som Edge Function applicerade (null när includeRows=false). */
  maxRowsPerStaffApplied?: number | null;
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
  /** Battery diagnostics — alla fält kan vara null/0 om pings saknar batteridata. */
  battery?: RawPingBatterySummary;
  /** Senaste app health-event (diagnostik, skapar ALDRIG arbetstid). */
  appHealth?: {
    lastAppSeenAt: string;
    lastEventType: string;
    lastAppState: string | null;
    lastBatteryPercent: number | null;
    lastIsCharging: boolean | null;
    lastPlatform: string | null;
    lastAppVersion: string | null;
    lastAppBuild: string | null;
    lastOsVersion: string | null;
    lastDeviceModel: string | null;
    lastAppId: string | null;
    lastAppHealthAt: string | null;
    lastGpsAt: string | null;
    /** Källan till lastAppSeenAt: `health:<type>` | `gps_ping` | `staff_locations`. */
    lastAppSeenSource?: string;
    /** True när pings finns nyligen men inga health-events på 30+ min (gammal build). */
    heartbeatMissing?: boolean;
  } | null;
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
          // Höjt 2026-05-18: tidigare cap 200 dolde att tabellen faktiskt har
          // alla pingar — admin trodde att "rådatan var filtrerad".
          maxRowsPerStaff: 5000,
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
