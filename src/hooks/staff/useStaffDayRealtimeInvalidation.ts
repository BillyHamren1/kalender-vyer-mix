/**
 * useStaffDayRealtimeInvalidation — gemensam realtime-bro för single-pipeline-flödet.
 *
 * Lyssnar på de TVÅ tabeller som resolveStaffDayReport läser:
 *   - staff_day_report_cache   (Time Engine-utdata, GPS-förslag)
 *   - staff_day_submissions    (användarens insändning / snapshot)
 *
 * Alla andra tabeller (time_reports, workdays, location_time_entries,
 * travel_time_logs, staff_location_history) ska INTE användas som källa
 * för dagrapportvyer och får därför inte lyssnas på här.
 *
 * Vid event invalideras de queryKeys som callern uppger. Debouncas så
 * att burst-uppdateringar (t.ex. många cache-upserts efter en GPS-batch)
 * blir EN refetch.
 *
 * Filtrering:
 *   - `staffId` filtrerar serverside per staff_id
 *   - `organizationId` filtrerar serverside per organization_id
 *   - utelämnas båda → alla events inom org/staff fångas (callern ansvarar)
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface UseStaffDayRealtimeInvalidationOptions {
  /** Unikt kanalnamn (annars kolliderar flera prenumerationer). */
  channelKey: string;
  /** Begränsa till en staff (rekommenderat för mobilappen). */
  staffId?: string | null;
  /** Begränsa till en org (rekommenderat för admin-vyer). */
  organizationId?: string | null;
  /** React-Query nycklar som ska invalideras. */
  queryKeys: (readonly unknown[])[];
  /** Extra callback efter invalidate (t.ex. dispatcha ett event). */
  onChange?: () => void;
  /** Debounce-fönster i ms (default 250). */
  debounceMs?: number;
  /** Stäng av subscription temporärt. */
  enabled?: boolean;
}

const REPORT_TABLES = ['staff_day_report_cache', 'staff_day_submissions'] as const;

function buildFilter(staffId?: string | null, organizationId?: string | null): string | undefined {
  if (staffId) return `staff_id=eq.${staffId}`;
  if (organizationId) return `organization_id=eq.${organizationId}`;
  return undefined;
}

export function useStaffDayRealtimeInvalidation(opts: UseStaffDayRealtimeInvalidationOptions): void {
  const {
    channelKey,
    staffId,
    organizationId,
    queryKeys,
    onChange,
    debounceMs = 250,
    enabled = true,
  } = opts;

  const qc = useQueryClient();
  const keysRef = useRef(queryKeys);
  const cbRef = useRef(onChange);
  keysRef.current = queryKeys;
  cbRef.current = onChange;

  useEffect(() => {
    if (!enabled) return;
    if (!staffId && !organizationId) return;

    const filter = buildFilter(staffId, organizationId);
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        keysRef.current.forEach((key) => {
          qc.invalidateQueries({ queryKey: key as unknown[] });
        });
        try { cbRef.current?.(); } catch { /* ignore */ }
      }, debounceMs);
    };

    let channel = supabase.channel(channelKey);
    REPORT_TABLES.forEach((table) => {
      const cfg: Record<string, unknown> = { event: '*', schema: 'public', table };
      if (filter) cfg.filter = filter;
      channel = (channel as any).on('postgres_changes', cfg, schedule);
    });
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [channelKey, staffId, organizationId, enabled, debounceMs, qc]);
}
