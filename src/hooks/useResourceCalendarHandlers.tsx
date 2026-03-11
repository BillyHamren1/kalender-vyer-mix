
import { useState } from 'react';
import { CalendarEvent, Resource } from '@/components/Calendar/ResourceData';
import { useCalendarEventHandlers } from '@/hooks/useCalendarEventHandlers';
import { useEventActions } from '@/hooks/useEventActions';
import { useEventDeletion } from '@/hooks/useEventDeletion';
import { useEventOperations } from '@/hooks/useEventOperations';
import { getEventHandlers } from '@/components/Calendar/CalendarEventHandlers';

export const useResourceCalendarHandlers = (
  events: CalendarEvent[],
  resources: Resource[],
  refreshEvents: () => Promise<void>
) => {
  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<{ id: string; title: string } | null>(null);

  // Get the event actions hook
  const { duplicateEvent } = useEventActions(events, () => {}, resources);
  
  // Use event deletion hook
  const { deleteEvent, isDeleting } = useEventDeletion(async () => {
    await refreshEvents();
  });
  
  // Use the calendar event handlers with the duplicate event function
  const { handleEventClick, DuplicateEventDialog } = useCalendarEventHandlers(
    resources, 
    refreshEvents,
    duplicateEvent
  );

  // Use enhanced event operations for handling event changes with better logging
  const { handleEventChange, handleEventReceive, isUpdating } = useEventOperations({
    resources,
    refreshEvents
  });

  // Get event handlers - using our enhanced handleEventChange
  const { handleEventDrop } = getEventHandlers(handleEventChange, handleEventClick, handleEventReceive);

  const handleDuplicateButtonClick = (eventId: string) => {
    const event = events.find(event => event.id === eventId);
    if (event) {
      const customEvent = new CustomEvent('openDuplicateDialog', { 
        detail: { 
          id: event.id,
          title: event.title,
          resourceId: event.resourceId,
          fullEvent: event
        } 
      });
      document.dispatchEvent(customEvent);
    }
  };

  const handleDeleteButtonClick = (eventId: string) => {
    const event = events.find(event => event.id === eventId);
    if (event) {
      setEventToDelete({ id: event.id, title: event.title });
      setDeleteDialogOpen(true);
    }
  };

  // Handle confirmed deletion
  const handleConfirmDelete = async () => {
    if (eventToDelete) {
      await deleteEvent(eventToDelete.id, eventToDelete.title);
      setDeleteDialogOpen(false);
      setEventToDelete(null);
    }
  };

  return {
    handleEventDrop,
    handleEventChange,
    handleEventClick,
    handleEventReceive,
    handleDuplicateButtonClick,
    handleDeleteButtonClick,
    handleConfirmDelete,
    deleteDialogOpen,
    setDeleteDialogOpen,
    eventToDelete,
    isDeleting: isDeleting || isUpdating,
    DuplicateEventDialog
  };
};
