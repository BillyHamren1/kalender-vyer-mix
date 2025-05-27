
import { useState } from 'react';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/calendarService';
import { StaffAssignmentSyncService } from '@/services/staffAssignmentSyncService';
import { Resource } from '@/components/Calendar/ResourceData';

interface UseEventOperationsProps {
  resources: Resource[];
  refreshEvents?: () => Promise<void | any[]>;
}

export const useEventOperations = ({
  resources,
  refreshEvents
}: UseEventOperationsProps) => {
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

        // Sync staff assignments for the updated event
        console.log('Syncing staff assignments for updated event...');
        await StaffAssignmentSyncService.syncCalendarEventStaffAssignments(info.event.id);
        
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

  // Add a new handler specifically for cross-calendar event receiving
  const handleEventReceive = async (info: any) => {
    try {
      console.log('Event received from another calendar:', info);
      
      // Get the resource ID from the event
      const resourceId = info.event.getResources?.()?.[0]?.id || 
                         info.event._def?.resourceIds?.[0] ||
                         info.event.extendedProps?.resourceId;
      
      console.log('Resource ID for the received event:', resourceId);
      
      if (!resourceId) {
        console.error('No resource ID found for the received event');
        toast.error('Could not determine the team for this event');
        return;
      }

      if (info.event.id) {
        console.log('Updating received event in database:', {
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

        // Sync staff assignments for the received event
        console.log('Syncing staff assignments for received event...');
        await StaffAssignmentSyncService.syncCalendarEventStaffAssignments(info.event.id);
        
        // Find the resource name for the toast message
        const resourceName = resources.find(r => r.id === resourceId)?.title || resourceId;
        
        toast.success("Event moved to new day", {
          description: `Event moved to ${resourceName} on ${info.event.start.toLocaleDateString()} at ${info.event.start.toLocaleTimeString()}`,
        });
        
        // Refresh the events to ensure UI displays the latest data
        if (refreshEvents) {
          console.log('Refreshing events after cross-calendar update');
          await refreshEvents();
        }
      } else {
        console.error('No event ID found for the received event');
        toast.error('Could not update event');
      }
    } catch (error) {
      console.error('Error updating received event:', error);
      toast.error('Failed to update event');
    }
  };

  return {
    handleEventChange,
    handleEventReceive
  };
};
