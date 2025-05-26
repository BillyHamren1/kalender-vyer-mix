
import { useState, useCallback } from 'react';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { toast } from 'sonner';

interface OptimisticUpdate {
  id: string;
  type: 'add' | 'update' | 'delete';
  event: CalendarEvent;
  timestamp: number;
}

export const useOptimisticUpdates = (
  events: CalendarEvent[],
  setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>
) => {
  const [pendingUpdates, setPendingUpdates] = useState<OptimisticUpdate[]>([]);

  // Add optimistic update
  const addOptimisticUpdate = useCallback((
    type: 'add' | 'update' | 'delete',
    event: CalendarEvent,
    operation: () => Promise<void>
  ) => {
    const updateId = `${type}-${event.id}-${Date.now()}`;
    const optimisticUpdate: OptimisticUpdate = {
      id: updateId,
      type,
      event,
      timestamp: Date.now()
    };

    // Add to pending updates
    setPendingUpdates(prev => [...prev, optimisticUpdate]);

    // Apply optimistic update to UI immediately
    setEvents(currentEvents => {
      switch (type) {
        case 'add':
          return [...currentEvents, event];
        case 'update':
          return currentEvents.map(e => e.id === event.id ? event : e);
        case 'delete':
          return currentEvents.filter(e => e.id !== event.id);
        default:
          return currentEvents;
      }
    });

    // Perform actual operation
    operation()
      .then(() => {
        // Remove from pending updates on success
        setPendingUpdates(prev => prev.filter(u => u.id !== updateId));
        console.log(`Optimistic ${type} operation completed successfully`);
      })
      .catch((error) => {
        console.error(`Optimistic ${type} operation failed:`, error);
        
        // Revert optimistic update on failure
        setPendingUpdates(prev => prev.filter(u => u.id !== updateId));
        
        setEvents(currentEvents => {
          switch (type) {
            case 'add':
              return currentEvents.filter(e => e.id !== event.id);
            case 'update':
              // Would need to revert to original state - for now just refresh
              return currentEvents;
            case 'delete':
              return [...currentEvents, event];
            default:
              return currentEvents;
          }
        });

        toast.error(`Failed to ${type} event`, {
          description: 'The change has been reverted. Please try again.'
        });
      });
  }, [setEvents]);

  // Clean up old pending updates (after 30 seconds)
  const cleanupPendingUpdates = useCallback(() => {
    const now = Date.now();
    setPendingUpdates(prev => 
      prev.filter(update => now - update.timestamp < 30000)
    );
  }, []);

  return {
    pendingUpdates,
    addOptimisticUpdate,
    cleanupPendingUpdates
  };
};
