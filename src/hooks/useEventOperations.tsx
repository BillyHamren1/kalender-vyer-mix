
import { useState } from 'react';
import { updateCalendarEvent } from '@/services/eventService';
import { updateBookingTimes } from '@/services/booking/bookingTimeService';
import { CalendarEvent, Resource } from '@/components/Calendar/ResourceData';
import { toast } from 'sonner';

export const useEventOperations = ({ 
  resources, 
  refreshEvents 
}: { 
  resources: Resource[], 
  refreshEvents?: () => Promise<void | CalendarEvent[]> 
}) => {
  const [isUpdating, setIsUpdating] = useState(false);

  // Enhanced event change handler 
  const handleEventChange = async (info: any) => {
    console.log('🔄 Event change detected:', {
      eventId: info.event.id,
      eventTitle: info.event.title,
      oldResource: info.oldResource?.id,
      newResource: info.newResource?.id,
      oldStart: info.oldEvent?.start?.toISOString(),
      newStart: info.event.start?.toISOString(),
      oldEnd: info.oldEvent?.end?.toISOString(),
      newEnd: info.event.end?.toISOString(),
      changeType: info.oldResource?.id !== info.newResource?.id ? 'TEAM_MOVE' : 'TIME_CHANGE',
      eventType: info.event.extendedProps?.eventType,
      bookingId: info.event.extendedProps?.bookingId
    });

    if (isUpdating) {
      console.log('⚠️ Update already in progress, skipping');
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
        console.log('📋 Team change detected:', { 
          from: info.oldResource?.id, 
          to: info.newResource.id 
        });
      }

      // Handle time changes
      if (info.event.start && info.oldEvent?.start?.getTime() !== info.event.start.getTime()) {
        eventData.start = info.event.start.toISOString();
        shouldUpdateBookingTimes = true;
        console.log('⏰ Start time change:', { from: info.oldEvent?.start, to: info.event.start });
      }

      if (info.event.end && info.oldEvent?.end?.getTime() !== info.event.end.getTime()) {
        eventData.end = info.event.end.toISOString();
        shouldUpdateBookingTimes = true;
        console.log('⏰ End time change:', { from: info.oldEvent?.end, to: info.event.end });
      }

      // If no meaningful changes, skip update
      if (Object.keys(eventData).length === 0) {
        console.log('ℹ️ No changes detected, skipping database update');
        setIsUpdating(false);
        return;
      }

      console.log('💾 Updating event in database:', {
        eventId: info.event.id,
        updates: eventData
      });

      // Update calendar event
      const result = await updateCalendarEvent(info.event.id, eventData);
      console.log('✅ Event updated successfully in database:', result);

      // Update booking times if this is a time change and we have booking info
      if (shouldUpdateBookingTimes && info.event.extendedProps?.bookingId && info.event.extendedProps?.eventType) {
        console.log('📅 Updating booking times for booking:', info.event.extendedProps.bookingId);
        
        try {
          await updateBookingTimes(
            info.event.extendedProps.bookingId,
            info.event.extendedProps.eventType,
            info.event.start.toISOString(),
            info.event.end.toISOString()
          );
          console.log('✅ Booking times updated successfully');
        } catch (bookingError) {
          console.error('❌ Error updating booking times:', bookingError);
          // Don't revert calendar change if booking update fails, just warn
          toast.error('Event updated but failed to sync booking times');
        }
      }

      // Show success message
      if (changeDescription) {
        toast.success(changeDescription);
      } else if (shouldUpdateBookingTimes) {
        toast.success('Event time updated successfully');
      } else {
        toast.success('Event updated successfully');
      }

      // Force refresh the calendar to show updated data
      if (refreshEvents) {
        console.log('🔄 Refreshing calendar events...');
        await refreshEvents();
        console.log('✅ Calendar refreshed');
      } else {
        console.error('❌ No refreshEvents function provided!');
      }

    } catch (error) {
      console.error('❌ Error updating event:', error);
      
      // Revert the visual change on error
      info.revert();
      
      toast.error('Failed to update event. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle external events being dropped onto the calendar
  const handleEventReceive = async (info: any) => {
    console.log('📥 External event received:', info);
    // This would handle new events being added, which we'll keep simple for now
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
