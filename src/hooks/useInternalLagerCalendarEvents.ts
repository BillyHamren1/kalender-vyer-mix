import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { addDays, format, startOfWeek } from 'date-fns';

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
    queryKey: ['internal-lager-projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, is_internal')
        .eq('is_internal', true);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const internalLagerEvents = useMemo<CalendarEvent[]>(() => {
    if (lagerProjects.length === 0) return [];

    // Bestäm intervall (dag = 1 dag, vecka/månad = visad vecka)
    let start: Date;
    let dayCount: number;
    if (view === 'day') {
      start = currentDate;
      dayCount = 1;
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
        viewed: true,
        editable: false,
        startEditable: false,
        durationEditable: false,
        backgroundColor: '#DBEAFE',
        borderColor: '#93C5FD',
        extendedProps: {
          isInternalLager: true,
          projectId: project.id,
          readOnly: true,
        },
      } as CalendarEvent);
    }
    return events;
  }, [lagerProjects, currentDate, view]);

  return { internalLagerEvents };
}
