import { supabase } from '@/integrations/supabase/client';
import { findExistingDayRow, getStickyTeamForBooking } from '@/lib/calendar/projectTeamStickiness';

export type Phase = 'rig' | 'event' | 'rigDown';

const PHASE_BOOKING_FIELDS: Record<Phase, { date: string; start: string; end: string }> = {
  rig: { date: 'rigdaydate', start: 'rig_start_time', end: 'rig_end_time' },
  event: { date: 'eventdate', start: 'event_start_time', end: 'event_end_time' },
  rigDown: { date: 'rigdowndate', start: 'rigdown_start_time', end: 'rigdown_end_time' },
};

/**
 * Sync the full set of phase days for a booking directly to calendar_events.
 *
 * This is the single write path used by the project page so that the project
 * view and personalkalendern share identical state — no more drift between
 * bookings.<phase>date (single) and the multi-row calendar_events.
 *
 * Behaviour per phase:
 *  - For each desired date: update existing row's start/end, or insert a new
 *    row using the booking's sticky team.
 *  - Any existing row whose date is no longer in the desired set is deleted.
 *  - The first chronological date is mirrored into bookings.<phase>date /
 *    <phase>_start_time / <phase>_end_time so legacy readers stay consistent.
 */
export async function syncBookingPhaseDays(params: {
  bookingId: string;
  phase: Phase;
  dates: string[];          // yyyy-MM-dd
  startTime: string;        // HH:mm
  endTime: string;          // HH:mm
}): Promise<void> {
  const { bookingId, phase, startTime, endTime } = params;
  const dates = Array.from(new Set(params.dates.filter(Boolean))).sort();

  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select('id, organization_id, booking_number, deliveryaddress, delivery_city, client')
    .eq('id', bookingId)
    .single();
  if (bErr || !booking) throw new Error(bErr?.message || 'Bokning saknas');

  const { data: existingRows, error: eErr } = await supabase
    .from('calendar_events')
    .select('id, source_date, start_time')
    .eq('booking_id', bookingId)
    .eq('event_type', phase);
  if (eErr) throw eErr;

  const existingByDate = new Map<string, { id: string }>();
  (existingRows || []).forEach((r: any) => {
    const d = (r.source_date as string | null) ?? String(r.start_time).slice(0, 10);
    if (d) existingByDate.set(d, { id: r.id });
  });

  const desired = new Set(dates);
  const toDelete = (existingRows || []).filter((r: any) => {
    const d = (r.source_date as string | null) ?? String(r.start_time).slice(0, 10);
    return d && !desired.has(d);
  });

  const deliveryAddress =
    [booking.deliveryaddress, booking.delivery_city].filter(Boolean).join(', ') || null;
  const title = booking.client || booking.booking_number || 'Bokning';

  // Delete removed days
  for (const r of toDelete) {
    const { error } = await supabase.from('calendar_events').delete().eq('id', (r as any).id);
    if (error) throw error;
  }

  // Upsert each desired date
  for (const date of dates) {
    const startDateTime = `${date}T${startTime}:00Z`;
    const endDateTime = `${date}T${endTime}:00Z`;
    const existing = existingByDate.get(date);

    if (existing) {
      const { error } = await supabase
        .from('calendar_events')
        .update({
          start_time: startDateTime,
          end_time: endDateTime,
          source_date: date,
          delivery_address: deliveryAddress,
          booking_number: booking.booking_number,
        })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const stickyTeam = await getStickyTeamForBooking(bookingId, booking.organization_id);
      // Fall back to first existing row's team for this booking if no sticky team
      let resourceId = stickyTeam ?? null;
      if (!resourceId) {
        const { data: anyRow } = await supabase
          .from('calendar_events')
          .select('resource_id')
          .eq('booking_id', bookingId)
          .not('resource_id', 'is', null)
          .limit(1)
          .maybeSingle();
        resourceId = (anyRow as any)?.resource_id ?? null;
      }
      if (!resourceId) {
        throw new Error('Bokningen saknar team i kalendern – placera den först.');
      }

      // Defensive: re-check if a row appeared for the same key
      const dup = await findExistingDayRow(bookingId, booking.organization_id, phase, date);
      if (dup) {
        const { error } = await supabase
          .from('calendar_events')
          .update({
            start_time: startDateTime,
            end_time: endDateTime,
            source_date: date,
            delivery_address: deliveryAddress,
            booking_number: booking.booking_number,
          })
          .eq('id', dup.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('calendar_events').insert({
          title,
          start_time: startDateTime,
          end_time: endDateTime,
          resource_id: resourceId,
          booking_id: bookingId,
          event_type: phase,
          organization_id: booking.organization_id,
          booking_number: booking.booking_number,
          delivery_address: deliveryAddress,
          source_date: date,
        });
        if (error) throw error;
      }

      try {
        await supabase.rpc('recompute_booking_staff_for_day' as any, {
          p_booking_id: bookingId,
          p_date: date,
        });
      } catch (rpcErr) {
        console.warn('[syncBookingPhaseDays] BSA recompute failed (non-fatal)', rpcErr);
      }
    }
  }

  // Mirror first chronological date into bookings columns so legacy readers
  // (project page header, exports, etc.) stay consistent.
  const fields = PHASE_BOOKING_FIELDS[phase];
  if (dates.length === 0) {
    const { error } = await supabase
      .from('bookings')
      .update({ [fields.date]: null, [fields.start]: null, [fields.end]: null })
      .eq('id', bookingId);
    if (error) throw error;
  } else {
    const first = dates[0];
    const { error } = await supabase
      .from('bookings')
      .update({
        [fields.date]: first,
        [fields.start]: `${first}T${startTime}:00Z`,
        [fields.end]: `${first}T${endTime}:00Z`,
      })
      .eq('id', bookingId);
    if (error) throw error;
  }
}
