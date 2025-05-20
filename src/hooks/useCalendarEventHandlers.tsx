
import React from 'react';
import { Resource, CalendarEvent } from '@/components/Calendar/ResourceData';
import { useEventOperations } from './useEventOperations';
import { useEventNavigation } from './useEventNavigation';
import { useEventDuplicateDialog } from './useEventDuplicateDialog';

export const useCalendarEventHandlers = (
  resources: Resource[], 
  refreshEvents?: () => Promise<void | CalendarEvent[]>,
  duplicateEvent?: (eventId: string, targetResourceId: string) => Promise<string | null>
) => {
  // Use our specialized hooks
  const { handleEventChange } = useEventOperations({ resources, refreshEvents });
  const { handleEventClick } = useEventNavigation();
  const { DuplicateEventDialog } = useEventDuplicateDialog({ 
    resources, 
    duplicateEvent, 
    refreshEvents 
  });

  return {
    handleEventChange,
    handleEventClick,
    DuplicateEventDialog
  };
};
