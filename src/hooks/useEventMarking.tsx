import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/eventService';

interface MarkedEvent {
  id: string;
  title: string;
  resourceId: string;
  originalStart: Date;
  originalEnd: Date;
}

interface TimeSelection {
  startTime: Date | null;
  endTime: Date | null;
}

export const useEventMarking = () => {
  const [markedEvent, setMarkedEvent] = useState<MarkedEvent | null>(null);
  const [timeSelection, setTimeSelection] = useState<TimeSelection>({
    startTime: null,
    endTime: null
  });
  const [isUpdating, setIsUpdating] = useState(false);

  const markEvent = useCallback((eventInfo: any) => {
    const event = eventInfo.event;
    const eventId = event.id;
    const title = event.title;
    const resourceId = event.extendedProps?.resourceId || event._def?.resourceIds?.[0];
    const originalStart = event.start;
    const originalEnd = event.end;

    setMarkedEvent({
      id: eventId,
      title,
      resourceId,
      originalStart,
      originalEnd
    });
    
    // Reset time selection
    setTimeSelection({
      startTime: null,
      endTime: null
    });

    toast.info("Event marked", {
      description: "Click on time slots to set new start and end times"
    });
  }, []);

  const unmarkEvent = useCallback(() => {
    setMarkedEvent(null);
    setTimeSelection({
      startTime: null,
      endTime: null
    });
  }, []);

  const setStartTime = useCallback((time: Date) => {
    if (!markedEvent) return;

    setTimeSelection(prev => ({
      ...prev,
      startTime: time
    }));

    toast.success("Start time set", {
      description: "Click another time slot to set the end time"
    });
  }, [markedEvent]);

  const setEndTime = useCallback(async (time: Date) => {
    if (!markedEvent || !timeSelection.startTime) return;

    // Validate that end time is after start time
    if (time <= timeSelection.startTime) {
      toast.error("Invalid time selection", {
        description: "End time must be after start time"
      });
      return;
    }

    setIsUpdating(true);

    try {
      // Update the event in the database
      await updateCalendarEvent(markedEvent.id, {
        start: timeSelection.startTime.toISOString(),
        end: time.toISOString()
      });

      toast.success("Event time updated", {
        description: `${markedEvent.title} has been rescheduled`
      });

      // Reset state
      unmarkEvent();
    } catch (error) {
      console.error('Error updating event time:', error);
      toast.error("Failed to update event", {
        description: "Please try again"
      });
    } finally {
      setIsUpdating(false);
    }
  }, [markedEvent, timeSelection.startTime, unmarkEvent]);

  const handleTimeSlotClick = useCallback((clickedTime: Date) => {
    if (!markedEvent) return;

    if (!timeSelection.startTime) {
      setStartTime(clickedTime);
    } else if (!timeSelection.endTime) {
      setEndTime(clickedTime);
    }
  }, [markedEvent, timeSelection.startTime, timeSelection.endTime, setStartTime, setEndTime]);

  return {
    markedEvent,
    timeSelection,
    isUpdating,
    markEvent,
    unmarkEvent,
    handleTimeSlotClick
  };
};
