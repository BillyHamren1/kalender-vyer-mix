import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SyncAuditEntry {
  id: string;
  booking_id: string;
  organization_id: string;
  sync_action: string;
  booking_status: string | null;
  booking_dates: {
    rigdaydate?: string | null;
    eventdate?: string | null;
    rigdowndate?: string | null;
    rig_start_time?: string | null;
    rig_end_time?: string | null;
    event_start_time?: string | null;
    event_end_time?: string | null;
    rigdown_start_time?: string | null;
    rigdown_end_time?: string | null;
  } | null;
  expected_events: Array<{
    event_type: string;
    date: string;
    start_time: string;
    end_time: string;
  }> | null;
  actual_events: Array<{
    id: string;
    event_type: string;
    date: string;
    start_time: string;
    end_time: string;
    resource_id: string;
  }> | null;
  events_created: number;
  events_updated: number;
  events_deleted: number;
  has_mismatch: boolean;
  mismatch_details: string | null;
  error_message: string | null;
  created_at: string;
}

export const useSyncAuditLog = (limit = 50) => {
  return useQuery({
    queryKey: ['sync-audit-log', limit],
    queryFn: async (): Promise<SyncAuditEntry[]> => {
      const { data, error } = await supabase
        .from('sync_audit_log' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as unknown as SyncAuditEntry[];
    },
    refetchInterval: 30000, // Auto-refresh every 30s
  });
};

export const useSyncAuditMismatches = () => {
  return useQuery({
    queryKey: ['sync-audit-mismatches'],
    queryFn: async (): Promise<SyncAuditEntry[]> => {
      const { data, error } = await supabase
        .from('sync_audit_log' as any)
        .select('*')
        .eq('has_mismatch', true)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as unknown as SyncAuditEntry[];
    },
    refetchInterval: 30000,
  });
};

/**
 * Live comparison: fetch current calendar_events for a booking and compare
 * against the last audit log's expected_events.
 */
export const useLiveCalendarCheck = (bookingId: string | null) => {
  return useQuery({
    queryKey: ['live-calendar-check', bookingId],
    enabled: !!bookingId,
    queryFn: async () => {
      if (!bookingId) return null;

      // Get latest audit entry for this booking
      const { data: auditData } = await supabase
        .from('sync_audit_log' as any)
        .select('expected_events, booking_dates, booking_status')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: false })
        .limit(1);

      const lastAudit = (auditData as any)?.[0] as SyncAuditEntry | undefined;

      // Get current calendar events
      const { data: currentEvents } = await supabase
        .from('calendar_events')
        .select('id, event_type, start_time, end_time, resource_id, source_date')
        .eq('booking_id', bookingId);

      const expected = lastAudit?.expected_events || [];
      const actual = (currentEvents || []).map((e: any) => ({
        id: e.id,
        event_type: e.event_type,
        date: e.source_date || e.start_time?.split('T')[0],
        start_time: e.start_time,
        end_time: e.end_time,
        resource_id: e.resource_id,
      }));

      // Compare
      const expectedKeys = new Set(expected.map(e => `${e.event_type}|${e.date}`));
      const actualKeys = new Set(actual.map(a => `${a.event_type}|${a.date}`));
      const missing = [...expectedKeys].filter(k => !actualKeys.has(k));
      const extra = [...actualKeys].filter(k => !expectedKeys.has(k));

      // Check time mismatches
      const timeMismatches: string[] = [];
      for (const exp of expected) {
        const key = `${exp.event_type}|${exp.date}`;
        const act = actual.find(a => `${a.event_type}|${a.date}` === key);
        if (act && (act.start_time !== exp.start_time || act.end_time !== exp.end_time)) {
          timeMismatches.push(`${key}: expected ${exp.start_time}-${exp.end_time}, got ${act.start_time}-${act.end_time}`);
        }
      }

      return {
        bookingId,
        bookingStatus: lastAudit?.booking_status,
        expected,
        actual,
        missing,
        extra,
        timeMismatches,
        isHealthy: missing.length === 0 && extra.length === 0 && timeMismatches.length === 0,
        lastAuditAt: lastAudit ? (auditData as any)[0]?.created_at : null,
      };
    },
  });
};
