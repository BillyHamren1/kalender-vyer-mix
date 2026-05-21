import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { addDays, format, startOfWeek, startOfMonth, endOfMonth, differenceInCalendarDays } from 'date-fns';

/**
 * Genererar virtuella heldagsevent (07:00–16:00) för det interna Lagerprojektet
 * (`projects.is_internal = true`) för varje dag i synligt intervall.
 *
 * Eventet placeras i kolumnen `transport` (som nu heter "Lager") i planeringskalendern.
 * Read-only — det är bara en visuell schemaläggning, ingen post i calendar_events.
 */
export function useInternalLagerCalendarEvents(
  currentDate: Date,
  view: 'day' | 'weekly' | 'monthly' | 'list' = 'weekly',
) {
  const { data: lagerProjects = [] } = useQuery({
    queryKey: ['internal-lager-projects-with-booking'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, is_internal, booking_id, bookings:bookings!projects_booking_id_fkey(id, booking_number)')
        .eq('is_internal', true);
      if (error) throw error;
      return (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        bookingId: p.booking_id || p.bookings?.id || null,
        bookingNumber: p.bookings?.booking_number || null,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  const internalLagerEvents = useMemo<CalendarEvent[]>(() => {
    if (lagerProjects.length === 0) return [];

    // Bestäm intervall per vy.
    // - day: 1 dag
    // - weekly: 7 dagar från måndagen i veckan
    // - monthly/list: hela månaden + lite padding så veckor som spänner över
    //   månadsskiftet också täcks.
    let start: Date;
    let dayCount: number;
    if (view === 'day') {
      start = currentDate;
      dayCount = 1;
    } else if (view === 'monthly' || view === 'list') {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      start = startOfWeek(monthStart, { weekStartsOn: 1 });
      const end = addDays(monthEnd, 7); // padda 1 vecka framåt för månadsskiften
      dayCount = differenceInCalendarDays(end, start) + 1;
    } else {
      start = startOfWeek(currentDate, { weekStartsOn: 1 });
      dayCount = 7;
    }

    const project = lagerProjects[0]; // Använd första interna projektet
    const projectName = project.name || 'Lager';

    const events: CalendarEvent[] = [];
    for (let i = 0; i < dayCount; i++) {
      const day = addDays(start, i);
      const dateStr = format(day, 'yyyy-MM-dd');
      events.push({
        id: `internal-lager-${project.id}-${dateStr}`,
        title: projectName,
        start: `${dateStr}T07:00:00`,
        end: `${dateStr}T16:00:00`,
        resourceId: 'transport',
        eventType: 'internal_task',
        // INGEN bookingId — annars använder CustomEvent fallback (sista 8 tecken
        // av booking_id) som "#d0179463". Lager-kortet ska aldrig visa nummer.
        viewed: true,
        editable: false,
        startEditable: false,
        durationEditable: false,
        backgroundColor: '#DBEAFE',
        borderColor: '#93C5FD',
        extendedProps: {
          isInternalLager: true,
          projectId: project.id,
          hideBookingNumber: true,
          readOnly: true,
        },
      } as CalendarEvent);
    }
    return events;
  }, [lagerProjects, currentDate, view]);

  return { internalLagerEvents };
}
