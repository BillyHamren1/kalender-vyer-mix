import { useQuery } from '@tanstack/react-query';
import { useMemo, useEffect } from 'react';
import { fetchInternalWarehouseIdentity } from '@/services/internalWarehouseIdentityService';
import { toast } from 'sonner';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { addDays, format, startOfWeek, startOfMonth, endOfMonth, differenceInCalendarDays } from 'date-fns';
import { useInternalLagerEnabled } from './useInternalLagerEnabled';

/**
 * Genererar virtuella heldagsevent (07:00–16:00) för det interna Lagerprojektet
 * (kopplat till `bookings.internal_type = warehouse`) för varje dag i synligt intervall.
 *
 * Visas ENDAST för organisationer med `organizations.internal_lager_enabled = true`.
 * Övriga organisationer får inga Lager-block alls, även om de har en gammal
 * intern projektrad kvar i databasen.
 *
 * Eventet placeras i UI-kolumnen `warehouse`. Legacy staff-data kan fortfarande använda team_id='transport'.
 * Read-only — det är bara en visuell schemaläggning, ingen post i calendar_events.
 */
export function useInternalLagerCalendarEvents(
  currentDate: Date,
  view: 'day' | 'weekly' | 'monthly' | 'list' = 'weekly',
) {
  const { lagerEnabled } = useInternalLagerEnabled();

  const { data: lagerProjects = [], error } = useQuery({
    queryKey: ['internal-lager-projects-with-booking'],
    enabled: lagerEnabled,
    queryFn: async () => {
      const project = await fetchInternalWarehouseIdentity();
      return project ? [project] : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (error) toast.error('Lagerprojektet kunde inte visas. Kontrollera lagerkopplingen och uppdatera kalendern.', { id: 'internal-lager-read-error' });
  }, [error]);

  const internalLagerEvents = useMemo<CalendarEvent[]>(() => {
    if (!lagerEnabled) return [];
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

    const project = lagerProjects[0]; // Identiteten har verifierats som entydigt Lager.
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
        resourceId: 'warehouse',
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
  }, [lagerEnabled, lagerProjects, currentDate, view]);

  return { internalLagerEvents, error };
}
