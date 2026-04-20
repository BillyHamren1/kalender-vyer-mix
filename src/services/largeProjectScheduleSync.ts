import { supabase } from "@/integrations/supabase/client";
import { updateBookingDatesViaApi } from "@/services/planningApiService";

export type DateType = 'rig' | 'event' | 'rigDown';

/**
 * Expand a period [start, end] (inclusive) into an array of yyyy-MM-dd strings.
 * Returns [] if start/end missing. Returns [start] if start === end.
 */
export function expandPeriodToDates(start: string | null | undefined, end: string | null | undefined): string[] {
  if (!start) return [];
  const s = new Date(start + 'T00:00:00');
  const e = end ? new Date(end + 'T00:00:00') : s;
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return [start];
  const out: string[] = [];
  const cur = new Date(s);
  while (cur <= e) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/**
 * Compute period [min, max] from a date array.
 */
export function arrayToPeriod(dates: string[] | null | undefined): { start: string | null; end: string | null } {
  if (!dates || dates.length === 0) return { start: null, end: null };
  const sorted = [...dates].sort();
  return { start: sorted[0], end: sorted[sorted.length - 1] };
}

const FIELD_MAP = {
  rig: { single: 'rigdaydate', array: 'rig_dates', start: 'rig_start_time', end: 'rig_end_time' },
  event: { single: 'eventdate', array: 'event_dates', start: 'event_start_time', end: 'event_end_time' },
  rigDown: { single: 'rigdowndate', array: 'rigdown_dates', start: 'rigdown_start_time', end: 'rigdown_end_time' },
} as const;

/**
 * Propagate one phase's full date array (and optional times) to every linked sub-booking.
 * Sends both the array (rig_dates[] etc.) and the legacy single field (first date) for backward compatibility.
 * After writing, triggers `import-bookings` per booking so calendar_events are regenerated for ALL days.
 */
export async function propagateProjectDatesToBookings(params: {
  bookingIds: string[];
  dateType: DateType;
  dates: string[];
  startTime?: string | null;
  endTime?: string | null;
}): Promise<void> {
  const { bookingIds, dateType, dates, startTime, endTime } = params;
  if (bookingIds.length === 0) return;

  const fields = FIELD_MAP[dateType];
  const firstDate = dates.length > 0 ? dates[0] : null;

  // 1. Write to each sub-booking via Booking API
  await Promise.all(
    bookingIds.map(bid => {
      const updateData: Record<string, any> = {
        // Legacy single-date field (first date) for backward compatibility
        [fields.single]: firstDate,
        // Full array — Booking system stores all days
        [fields.array]: dates,
      };
      if (firstDate && startTime) updateData[fields.start] = `${firstDate}T${startTime}:00Z`;
      if (firstDate && endTime) updateData[fields.end] = `${firstDate}T${endTime}:00Z`;
      return updateBookingDatesViaApi(bid, updateData);
    })
  );

  // 2. Trigger calendar_events regeneration per booking (one event per day)
  const { data: { user } } = await supabase.auth.getUser();
  let orgId: string | undefined;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('user_id', user.id)
      .single();
    orgId = profile?.organization_id ?? undefined;
  }

  await Promise.all(
    bookingIds.map(bid =>
      supabase.functions.invoke('import-bookings', {
        body: { booking_id: bid, syncMode: 'single', organization_id: orgId, localOnly: true, skip_review: true },
      })
    )
  );
}
