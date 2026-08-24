/**
 * placeBookingWithDefaults — placerar EN bokning enligt exakt samma
 * default-läge som BookingPlacementDialog visar när den öppnas
 * (medelprojekt, seedade rig/rigDown-dagar, första lediga team).
 *
 * Används av "Planera alla" i NewBookingsPopup.
 */
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { findAvailableTeam } from '@/utils/teamAvailability';
import {
  isPhaseLocked,
  seedDaysFromBooking,
  mergeCalendarEventsIntoSeed,
  isDeliveryOnlyBooking,
  DELIVERY_DEFAULT_TEAM_ID,
  type PlanningDay,
} from '@/components/project/bookingPlacementSeed';

const BOOKING_FIELDS = `
  id, client, booking_number, deliveryaddress,
  customer_pickup, rental_only,
  eventdate, rigdaydate, rigdowndate,
  rig_start_time, rig_end_time, event_start_time, event_end_time,
  rigdown_start_time, rigdown_end_time,
  rig_time_locked, event_time_locked, rigdown_time_locked
`;

export interface DefaultPlacementResult {
  bookingId: string;
  projectId: string | null;
  daysPlanned: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function placeBookingWithDefaults(
  bookingId: string,
  teamResources: Array<{ id: string; title: string }>,
): Promise<DefaultPlacementResult> {
  const { data: booking, error: bErr } = await supabase
    .from('bookings')
    .select(BOOKING_FIELDS)
    .eq('id', bookingId)
    .maybeSingle();
  if (bErr) throw bErr;
  if (!booking) throw new Error('Bokningen kunde inte hittas');

  const deliveryOnly = isDeliveryOnlyBooking(booking);
  const baseSeed = seedDaysFromBooking(
    booking,
    deliveryOnly ? DELIVERY_DEFAULT_TEAM_ID : 'team-1',
  );

  const { data: bookingEventRows } = await supabase
    .from('calendar_events')
    .select('event_type, source_date, start_time, end_time, resource_id')
    .eq('booking_id', booking.id)
    .in('event_type', ['rig', 'event', 'rigDown']);

  const seed = mergeCalendarEventsIntoSeed(
    baseSeed,
    (bookingEventRows || []) as any,
    deliveryOnly ? DELIVERY_DEFAULT_TEAM_ID : 'team-1',
  );

  const dates = Array.from(new Set(seed.map((d) => d.date)));
  let dayEvents: any[] = [];
  if (dates.length > 0) {
    const { data } = await supabase
      .from('calendar_events')
      .select('start_time, end_time, resource_id, source_date, booking_id')
      .in('source_date', dates);
    dayEvents = data || [];
  }

  let rigTeamId: string | null = null;
  if (!deliveryOnly) {
    const rig = seed.find((d) => d.kind === 'rig');
    if (rig) {
      const start = new Date(`${rig.date}T${rig.startTime}:00`);
      const end = new Date(`${rig.date}T${rig.endTime}:00`);
      const eventsLike = dayEvents
        .filter((e) => e.source_date === rig.date && e.booking_id !== booking.id)
        .map((e) => ({
          id: e.resource_id,
          resourceId: e.resource_id,
          start: e.start_time,
          end: e.end_time,
          title: '',
        }));
      rigTeamId = findAvailableTeam(start, end, eventsLike as any, teamResources as any, true);
    }
  }

  const days: PlanningDay[] = seed.map((d) =>
    (d.kind === 'rig' || d.kind === 'rigDown') && rigTeamId ? { ...d, teamId: rigTeamId } : d,
  );
  const planSteps = days.filter((d) => d.kind !== 'event');
  if (planSteps.length === 0) {
    throw new Error('Inga rig- eller demonteringsdagar att planera');
  }

  // 1. Projekt (medel) — återanvänd befintligt aktivt projekt om det finns.
  const dateStr = booking.eventdate
    ? format(parseISO(booking.eventdate), 'd MMMM yyyy', { locale: sv })
    : '';
  const projectName = `${booking.client || 'Projekt'}${dateStr ? ` - ${dateStr}` : ''}`;

  const { data: existingProjects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('booking_id', booking.id)
    .not('status', 'in', '("completed","cancelled")')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  let projectId: string;
  if (existingProjects && existingProjects.length > 0) {
    projectId = existingProjects[0].id;
    await supabase
      .from('bookings')
      .update({
        assigned_to_project: true,
        assigned_project_id: projectId,
        assigned_project_name: existingProjects[0].name ?? projectName,
      })
      .eq('id', booking.id);
  } else {
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .insert({ name: projectName, booking_id: booking.id } as any)
      .select()
      .single();
    if (projErr) throw projErr;
    projectId = project.id;
    await supabase
      .from('bookings')
      .update({
        assigned_to_project: true,
        assigned_project_id: projectId,
        assigned_project_name: projectName,
      })
      .eq('id', booking.id);
  }

  // 2. Kalenderdagar (rig + rigDown)
  for (const day of planSteps) {
    const { data: existingEvent } = await supabase
      .from('calendar_events')
      .select('id')
      .eq('booking_id', booking.id)
      .eq('event_type', day.kind)
      .eq('source_date', day.date)
      .maybeSingle();

    const payload = {
      title: booking.client || 'Projekt',
      start_time: `${day.date}T${day.startTime}:00+00:00`,
      end_time: `${day.date}T${day.endTime}:00+00:00`,
      resource_id: day.teamId,
      booking_id: booking.id,
      event_type: day.kind,
      delivery_address: booking.deliveryaddress || null,
      booking_number: booking.booking_number || null,
      source_date: day.date,
    };

    if (existingEvent?.id) {
      const { error } = await supabase.from('calendar_events').update(payload).eq('id', existingEvent.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('calendar_events').insert(payload);
      if (error) throw error;
    }
  }

  // 3. Bokningens tider (om inte låsta)
  const firstRig = planSteps.find((d) => d.kind === 'rig');
  const firstDown = planSteps.find((d) => d.kind === 'rigDown');
  const updates: any = {};
  if (firstRig && !isPhaseLocked(booking, 'rig')) {
    updates.rig_start_time = `${firstRig.startTime}:00`;
    updates.rig_end_time = `${firstRig.endTime}:00`;
  }
  if (firstDown && !isPhaseLocked(booking, 'rigDown')) {
    updates.rigdown_start_time = `${firstDown.startTime}:00`;
    updates.rigdown_end_time = `${firstDown.endTime}:00`;
  }
  if (Object.keys(updates).length > 0) {
    await supabase.from('bookings').update(updates).eq('id', booking.id);
  }

  await supabase.from('projects').update({ planning_status: 'planned' }).eq('id', projectId);

  return { bookingId: booking.id, projectId, daysPlanned: planSteps.length };
}
