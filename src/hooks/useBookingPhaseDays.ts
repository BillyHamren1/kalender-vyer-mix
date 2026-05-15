import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type Phase = 'rig' | 'event' | 'rigDown';

export interface PhaseDay {
  id: string;
  date: string;             // yyyy-MM-dd (source_date or derived from start_time)
  startTime: string | null; // ISO
  endTime: string | null;   // ISO
  resourceId: string | null;
  timesLocked: boolean;
}

export interface PhaseDays {
  rig: PhaseDay[];
  event: PhaseDay[];
  rigDown: PhaseDay[];
}

const EMPTY: PhaseDays = { rig: [], event: [], rigDown: [] };

const toDateStr = (iso: string | null | undefined, fallback: string | null): string => {
  if (fallback) return fallback;
  if (!iso) return '';
  return String(iso).slice(0, 10);
};

/**
 * Single source of truth for phase days on a booking (rig/event/rigDown).
 *
 * Reads ALL calendar_events for the given booking(s) — same source the
 * personalkalender renders. Layered phase locks (booking.<phase>_time_locked)
 * are merged in so the project page reflects "Fast tid" identically to the
 * EventActionPopover.
 */
export function useBookingPhaseDays(bookingIds: string | string[] | null | undefined) {
  const ids = Array.isArray(bookingIds)
    ? bookingIds.filter(Boolean)
    : (bookingIds ? [bookingIds] : []);
  const key = ids.join('|');

  const [days, setDays] = useState<PhaseDays>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let active = true;
    if (ids.length === 0) {
      setDays(EMPTY);
      return;
    }
    setLoading(true);

    (async () => {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('id, event_type, start_time, end_time, source_date, resource_id, times_locked, booking_id')
        .in('booking_id', ids)
        .in('event_type', ['rig', 'event', 'rigDown'])
        .order('start_time', { ascending: true });

      if (!active) return;
      if (error) {
        console.warn('[useBookingPhaseDays]', error);
        setDays(EMPTY);
        setLoading(false);
        return;
      }

      // Merge phase-level booking locks
      const { data: bRows } = await supabase
        .from('bookings')
        .select('id, rig_time_locked, event_time_locked, rigdown_time_locked')
        .in('id', ids);
      const lockByBooking = new Map<string, any>();
      (bRows || []).forEach((b: any) => lockByBooking.set(b.id, b));

      const buckets: PhaseDays = { rig: [], event: [], rigDown: [] };
      (data || []).forEach((r: any) => {
        const phase = r.event_type as Phase;
        if (phase !== 'rig' && phase !== 'event' && phase !== 'rigDown') return;
        const b = r.booking_id ? lockByBooking.get(r.booking_id) : null;
        const phaseLock = b
          ? (phase === 'rig' ? b.rig_time_locked === true
            : phase === 'event' ? b.event_time_locked === true
            : b.rigdown_time_locked === true)
          : false;
        buckets[phase].push({
          id: r.id,
          date: toDateStr(r.start_time, r.source_date),
          startTime: r.start_time ?? null,
          endTime: r.end_time ?? null,
          resourceId: r.resource_id ?? null,
          timesLocked: r.times_locked === true || phaseLock,
        });
      });

      setDays(buckets);
      setLoading(false);
    })();

    return () => { active = false; };
  }, [key, refreshTick]);

  // Realtime invalidation: any change to calendar_events for these bookings refreshes
  useEffect(() => {
    if (ids.length === 0) return;
    const channel = supabase
      .channel(`booking-phase-days-${key}`)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'calendar_events' },
        (payload: any) => {
          const bid = payload?.new?.booking_id ?? payload?.old?.booking_id;
          if (bid && ids.includes(bid)) setRefreshTick((t) => t + 1);
        },
      )
      .on(
        'postgres_changes' as any,
        { event: 'UPDATE', schema: 'public', table: 'bookings' },
        (payload: any) => {
          const bid = payload?.new?.id ?? payload?.old?.id;
          if (bid && ids.includes(bid)) setRefreshTick((t) => t + 1);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [key]);

  return { days, loading, refresh: () => setRefreshTick((t) => t + 1) };
}
