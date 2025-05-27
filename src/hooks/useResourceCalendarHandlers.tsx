
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

  // Use event operations for handling event changes
  const { handleEventChange, handleEventReceive } = useEventOperations({
    resources,
    refreshEvents
  });

  // Get event handlers
  const { handleEventDrop } = getEventHandlers(handleEventChange, handleEventClick, handleEventReceive);

  // Handler for duplicate button click
  const handleDuplicateButtonClick = (eventId: string) => {
    console.log('Duplicate button clicked for event:', eventId);
    // Find the event in the events array
    const event = events.find(event => event.id === eventId);
    if (event) {
      // Store the selected event for the duplicate dialog
      const dialogEvent = {
        id: event.id,
        title: event.title,
        resourceId: event.resourceId
      };
      
      // Trigger the duplicate dialog via the event handlers
      if (typeof window !== 'undefined') {
        // Set the selected event in the window object for the dialog to use
        // @ts-ignore
        window._selectedEventForDuplicate = dialogEvent;
        
        // Create and dispatch a custom event to trigger the dialog
        const customEvent = new CustomEvent('openDuplicateDialog', { detail: dialogEvent });
        document.dispatchEvent(customEvent);
      }
    }
  };

  // Handler for delete button click
  const handleDeleteButtonClick = (eventId: string) => {
    console.log('Delete button clicked for event:', eventId);
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
    isDeleting,
    DuplicateEventDialog
  };
};
