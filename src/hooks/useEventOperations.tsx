import { useState } from 'react';
import { updateCalendarEvent } from '@/services/eventService';
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
      changeType: info.oldResource?.id !== info.newResource?.id ? 'TEAM_MOVE' : 'TIME_CHANGE'
    });

    if (isUpdating) {
      console.log('⚠️ Update already in progress, skipping');
      return;
    }

    setIsUpdating(true);

    try {
      const eventData: Partial<CalendarEvent> = {};
      let changeDescription = '';

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
        console.log('⏰ Start time change:', { from: info.oldEvent?.start, to: info.event.start });
      }

      if (info.event.end && info.oldEvent?.end?.getTime() !== info.event.end.getTime()) {
        eventData.end = info.event.end.toISOString();
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

      const result = await updateCalendarEvent(info.event.id, eventData);
      
      console.log('✅ Event updated successfully in database:', result);

      // Show success message
      if (changeDescription) {
        toast.success(changeDescription);
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
