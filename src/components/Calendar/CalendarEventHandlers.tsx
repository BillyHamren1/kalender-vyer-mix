import { useState, useContext, useEffect } from 'react';
import { toast } from 'sonner';
import { updateCalendarEvent, fetchCalendarEvents } from '@/services/eventService';
import { Resource, CalendarEvent } from '@/components/Calendar/ResourceData';
import { useNavigate } from 'react-router-dom';
import { CalendarContext } from '@/App';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import React from 'react';

export const useCalendarEventHandlers = (
  resources: Resource[], 
  refreshEvents?: () => Promise<void | CalendarEvent[]>,
  duplicateEvent?: (eventId: string, targetResourceId: string) => Promise<string | null>
) => {
  const navigate = useNavigate();
  const { setLastViewedDate, setLastPath } = useContext(CalendarContext);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [targetTeam, setTargetTeam] = useState<string>("");

  // Effect to listen for custom duplicate dialog event
  useEffect(() => {
    const handleOpenDuplicateDialog = (event: CustomEvent) => {
      const eventData = event.detail;
      console.log('Received duplicate dialog event with data:', eventData);
      setSelectedEvent(eventData);
      setShowDuplicateDialog(true);
    };

    // Add event listener for the custom event
    document.addEventListener('openDuplicateDialog', handleOpenDuplicateDialog as EventListener);

    // Check for window selected event (alternative method)
    const checkWindowSelectedEvent = () => {
      // @ts-ignore
      if (window._selectedEventForDuplicate) {
        // @ts-ignore
        setSelectedEvent(window._selectedEventForDuplicate);
        setShowDuplicateDialog(true);
        // @ts-ignore
        delete window._selectedEventForDuplicate;
      }
    };

    // Check once on mount
    checkWindowSelectedEvent();

    // Cleanup
    return () => {
      document.removeEventListener('openDuplicateDialog', handleOpenDuplicateDialog as EventListener);
    };
  }, []);

  const handleEventChange = async (info: any) => {
    try {
      console.log('Event change detected:', info);
      
      // Get the resource ID from the event
      // Try multiple ways to get the resource ID as FullCalendar handles it differently depending on view
      const resourceId = info.event.getResources?.()?.[0]?.id || 
                         info.event._def?.resourceIds?.[0] || 
                         info.newResource?.id ||
                         info.event.extendedProps?.resourceId;
      
      console.log('Resource ID for the moved event:', resourceId);

      if (!resourceId) {
        console.error('No resource ID found for the event');
        toast.error('Could not determine the team for this event');
        return;
      }

      if (info.event.id) {
        console.log('Updating event in database:', {
          id: info.event.id,
          start: info.event.start.toISOString(),
          end: info.event.end.toISOString(),
          resourceId: resourceId
        });
        
        // Call the service to update the event in the database
        await updateCalendarEvent(info.event.id, {
          start: info.event.start.toISOString(),
          end: info.event.end.toISOString(),
          resourceId: resourceId
        });
        
        // Find the resource name for the toast message
        const resourceName = resources.find(r => r.id === resourceId)?.title || resourceId;

        toast.success("Event updated", {
          description: `Event moved to ${resourceName} at ${info.event.start.toLocaleTimeString()}`,
        });
        
        // Refresh the events to ensure UI displays the latest data
        if (refreshEvents) {
          console.log('Refreshing events after update');
          await refreshEvents();
        }
      } else {
        console.error('No event ID found for the moved event');
        toast.error('Could not update event');
      }
    } catch (error) {
      console.error('Error updating event:', error);
      toast.error('Failed to update event');
    }
  };

  const handleDuplicateEvent = async () => {
    if (!selectedEvent || !duplicateEvent) {
      toast.error("Cannot duplicate event");
      return;
    }

    if (!targetTeam) {
      toast.warning("Please select a target team");
      return;
    }

    await duplicateEvent(selectedEvent.id, targetTeam);
    setShowDuplicateDialog(false);
    
    // Refresh the events to show the duplicated event
    if (refreshEvents) {
      await refreshEvents();
    }
  };

  const handleEventClick = (info: any) => {
    const bookingId = info.event.extendedProps.bookingId;
    console.log('Event clicked:', info.event);
    console.log('Booking ID:', bookingId);
    
    // Show context menu with options
    const showContextMenu = (e: any) => {
      e.preventDefault();
      
      // Store the selected event for later use
      setSelectedEvent({
        id: info.event.id,
        title: info.event.title,
        resourceId: info.event.extendedProps.resourceId
      });
      
      // Show duplicate dialog
      setShowDuplicateDialog(true);
    };
    
    // Add right-click event listener to show context menu
    const eventEl = info.el;
    eventEl.addEventListener('contextmenu', showContextMenu);
    
    // Handle normal click (navigation to booking)
    if (bookingId) {
      // Save current date and path before navigating
      setLastViewedDate(info.event.start);
      setLastPath(window.location.pathname);
      
      navigate(`/booking/${bookingId}`);
      console.log(`Navigating to /booking/${bookingId}`);
    } else {
      console.warn('No booking ID found for this event');
      toast.warning("Cannot open booking details", {
        description: "This event is not linked to a booking"
      });
    }
  };

  // Duplicate dialog component
  const DuplicateEventDialog = () => (
    <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Duplicate Event</DialogTitle>
          <DialogDescription>
            {selectedEvent?.title ? `Duplicate "${selectedEvent.title}" to another team` : 'Select a team to duplicate this event to'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="sourceTeam" className="text-right">
              Source Team
            </Label>
            <div className="col-span-3 text-sm text-gray-700">
              {resources.find(r => r.id === selectedEvent?.resourceId)?.title || selectedEvent?.resourceId || 'Unknown'}
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="teamSelect" className="text-right">
              Target Team
            </Label>
            <Select onValueChange={setTargetTeam} value={targetTeam}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select a team" />
              </SelectTrigger>
              <SelectContent>
                {resources
                  .filter(resource => resource.id !== selectedEvent?.resourceId)
                  .map(resource => (
                    <SelectItem key={resource.id} value={resource.id}>
                      {resource.title}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowDuplicateDialog(false)}>
            Cancel
          </Button>
          <Button onClick={handleDuplicateEvent}>
            Duplicate Event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return {
    handleEventChange,
    handleEventClick,
    DuplicateEventDialog
  };
};
