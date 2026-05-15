import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { CalendarEvent } from '@/components/Calendar/ResourceData';

export interface BookingDayRow {
  id: string;
  event_type: string;
  start_time: string;
  end_time: string;
  source_date: string | null;
  resource_id: string | null;
  times_locked: boolean;
}

/**
 * Returns all rig/event/rigDown calendar_events tied to the same booking
 * (or, for large projects, all sibling bookings via consolidatedBookingIds).
 */
export function useEventBookingDays(event: CalendarEvent, refreshKey: number = 0) {
  const [days, setDays] = useState<BookingDayRow[]>([]);
  const [loading, setLoading] = useState(false);

  const ext: any = event.extendedProps || {};
  const consolidatedBookingIds: string[] = Array.isArray(ext.consolidatedBookingIds)
    ? ext.consolidatedBookingIds.filter(Boolean) : [];
  const bookingIds = consolidatedBookingIds.length > 0
    ? consolidatedBookingIds
    : (event.bookingId ? [event.bookingId] : []);

  useEffect(() => {
    let active = true;
    if (bookingIds.length === 0) {
      setDays([]);
      return;
    }
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('id, event_type, start_time, end_time, source_date, resource_id, times_locked, booking_id')
        .in('booking_id', bookingIds)
        .neq('event_type', 'activity')
        .order('start_time', { ascending: true });
      if (!active) return;
      if (error) {
        console.warn('[useEventBookingDays]', error);
        setDays([]);
        setLoading(false);
        return;
      }

      // Merge in the canonical booking-level "Fast tid" lock so a row that was
      // locked at booking-import time (bookings.<phase>_time_locked) shows as
      // locked here too — even if calendar_events.times_locked wasn't mirrored.
      const { data: bookingsRows } = await supabase
        .from('bookings')
        .select('id, rig_time_locked, event_time_locked, rigdown_time_locked')
        .in('id', bookingIds);
      const lockByBooking = new Map<string, any>();
      (bookingsRows || []).forEach((b: any) => lockByBooking.set(b.id, b));

      const merged = (data || []).map((r: any) => {
        const b = r.booking_id ? lockByBooking.get(r.booking_id) : null;
        let phaseLock = false;
        if (b) {
          if (r.event_type === 'rig') phaseLock = b.rig_time_locked === true;
          else if (r.event_type === 'event') phaseLock = b.event_time_locked === true;
          else if (r.event_type === 'rigDown') phaseLock = b.rigdown_time_locked === true;
        }
        return { ...r, times_locked: r.times_locked === true || phaseLock };
      });

      setDays(merged as any);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [bookingIds.join('|'), refreshKey]);

  return { days, loading };
}
