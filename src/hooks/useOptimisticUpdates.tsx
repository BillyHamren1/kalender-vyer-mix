
import { useState, useCallback, useRef } from 'react';
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
  const debounceTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Optimized for smooth drag operations - reduced debouncing
  const addOptimisticUpdate = useCallback((
    type: 'add' | 'update' | 'delete',
    event: CalendarEvent,
    operation: () => Promise<void>,
    skipDebounce: boolean = false // Add option to skip debouncing for drag operations
  ) => {
    const updateId = `${type}-${event.id}-${Date.now()}`;
    
    // Clear any existing timeout for this event
    const existingTimeout = debounceTimeouts.current.get(event.id);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // For drag operations, use immediate updates with minimal debounce
    const debounceTime = skipDebounce ? 0 : (type === 'update' ? 50 : 100); // Reduced from 100ms to 50ms for updates

    const timeout = setTimeout(() => {
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
          
          // Remove from pending updates on failure
          setPendingUpdates(prev => prev.filter(u => u.id !== updateId));
          
          // Revert optimistic update on failure
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
        })
        .finally(() => {
          // Clean up timeout reference
          debounceTimeouts.current.delete(event.id);
        });
    }, debounceTime);

    // Store timeout reference
    debounceTimeouts.current.set(event.id, timeout);
  }, [setEvents]);

  // Clean up old pending updates and timeouts
  const cleanupPendingUpdates = useCallback(() => {
    const now = Date.now();
    setPendingUpdates(prev => 
      prev.filter(update => now - update.timestamp < 30000)
    );
    
    // Clean up old timeouts
    for (const [eventId, timeout] of debounceTimeouts.current) {
      if (timeout) {
        const timeoutExists = Array.from(debounceTimeouts.current.values()).includes(timeout);
        if (!timeoutExists) {
          debounceTimeouts.current.delete(eventId);
        }
      }
    }
  }, []);

  return {
    pendingUpdates,
    addOptimisticUpdate,
    cleanupPendingUpdates
  };
};
