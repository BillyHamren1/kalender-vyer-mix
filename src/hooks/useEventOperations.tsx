
import { useState } from 'react';
import { updateCalendarEvent } from '@/services/eventService';
import { updateBookingTimes } from '@/services/booking/bookingTimeService';
import { CalendarEvent, Resource } from '@/components/Calendar/ResourceData';
import { toast } from 'sonner';
import { format } from 'date-fns';

export const useEventOperations = ({ 
  resources, 
  refreshEvents 
}: { 
  resources: Resource[], 
  refreshEvents?: () => Promise<void | CalendarEvent[]> 
}) => {
  const [isUpdating, setIsUpdating] = useState(false);

  // Simplified event change handler
  const handleEventChange = async (info: any) => {
    console.log('Event change:', {
      eventId: info.event.id,
      oldResource: info.oldResource?.id,
      newResource: info.newResource?.id,
      newStart: info.event.start?.toISOString(),
      newEnd: info.event.end?.toISOString()
    });

    if (isUpdating) {
      console.log('Update already in progress, skipping');
      return;
    }

    setIsUpdating(true);

    try {
      const eventData: Partial<CalendarEvent> = {};
      let changeDescription = '';
      let shouldUpdateBookingTimes = false;

      // Handle resource (team) changes
      if (info.newResource && info.oldResource?.id !== info.newResource.id) {
        eventData.resourceId = info.newResource.id;
        const oldTeam = resources.find(r => r.id === info.oldResource?.id)?.title || info.oldResource?.id;
        const newTeam = resources.find(r => r.id === info.newResource.id)?.title || info.newResource.id;
        changeDescription = `Event moved from ${oldTeam} to ${newTeam}`;
      }

      // Handle time changes - simple ISO string updates
      if (info.event.start && info.oldEvent?.start?.getTime() !== info.event.start.getTime()) {
        eventData.start = info.event.start.toISOString();
        shouldUpdateBookingTimes = true;
      }

      if (info.event.end && info.oldEvent?.end?.getTime() !== info.event.end.getTime()) {
        eventData.end = info.event.end.toISOString();
        shouldUpdateBookingTimes = true;
      }

      // If no meaningful changes, skip update
      if (Object.keys(eventData).length === 0) {
        console.log('No changes detected, skipping update');
        setIsUpdating(false);
        return;
      }

      console.log('Updating event:', eventData);

      // Update calendar event
      await updateCalendarEvent(info.event.id, eventData);

      // Update booking times if needed
      if (shouldUpdateBookingTimes && info.event.extendedProps?.bookingId && info.event.extendedProps?.eventType) {
        try {
          await updateBookingTimes(
            info.event.extendedProps.bookingId,
            info.event.extendedProps.eventType,
            info.event.start.toISOString(),
            info.event.end.toISOString()
          );
        } catch (bookingError) {
          console.error('Error updating booking times:', bookingError);
          toast.error('Event updated but failed to sync booking times');
        }
      }

      // Show success message
      if (changeDescription) {
        toast.success(changeDescription);
      } else if (shouldUpdateBookingTimes) {
        const timeDisplay = `${format(info.event.start, 'HH:mm')} - ${format(info.event.end, 'HH:mm')}`;
        toast.success(`Event time updated to ${timeDisplay}`);
      } else {
        toast.success('Event updated successfully');
      }

      // Refresh the calendar
      if (refreshEvents) {
        await refreshEvents();
      }

    } catch (error) {
      console.error('Error updating event:', error);
      info.revert();
      toast.error('Failed to update event. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle external events being dropped onto the calendar
  const handleEventReceive = async (info: any) => {
    console.log('External event received:', info);
    if (refreshEvents) {
      await refreshEvents();
    }
  };

  return {
    handleEventChange,
    handleEventReceive,
    isUpdating
  };
};
