import React from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import CustomEvent from './CustomEvent';
import { useDrop } from 'react-dnd';
import { toast } from 'sonner';
import { updateCalendarEvent } from '@/services/eventService';

interface TimeSlotsProps {
  day: Date;
  resource: Resource;
  timeSlots: string[];
  events: CalendarEvent[];
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date) => Promise<void>;
  onEventDrop?: (eventId: string, targetResourceId: string, targetDate: Date, targetTime: string) => Promise<void>;
}

const TimeSlots: React.FC<TimeSlotsProps> = ({
  day,
  resource,
  timeSlots,
  events,
  onStaffDrop,
  onEventDrop
}) => {
  // Create a proper DOM element ref
  const elementRef = React.useRef<HTMLDivElement>(null);

  // Calculate which time slot was dropped on based on Y position
  const getTimeSlotFromPosition = (clientY: number) => {
    if (!elementRef.current) {
      console.warn('Element ref not available for time calculation');
      return '12:00'; // fallback time
    }
    
    const rect = elementRef.current.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    const slotHeight = 60; // Each time slot is 60px high
    const slotIndex = Math.floor(relativeY / slotHeight);
    
    // Time slots start at 6 AM (index 0) and go to 22 PM
    const hour = Math.max(6, Math.min(22, 6 + slotIndex));
    return `${hour.toString().padStart(2, '0')}:00`;
  };

  // Enhanced event drop handler with better error handling
  const handleEventDropWithErrorHandling = async (
    eventId: string, 
    targetResourceId: string, 
    targetDate: Date, 
    targetTime: string
  ) => {
    try {
      console.log('TimeSlots: Handling event drop', {
        eventId,
        targetResourceId,
        targetDate: format(targetDate, 'yyyy-MM-dd'),
        targetTime
      });

      // Create the new start and end times
      const [hours, minutes] = targetTime.split(':').map(Number);
      const newStartTime = new Date(targetDate);
      newStartTime.setHours(hours, minutes, 0, 0);
      
      // Find the original event to maintain duration
      const originalEvent = events.find(e => e.id === eventId);
      if (!originalEvent) {
        throw new Error('Original event not found');
      }
      
      const originalStart = new Date(originalEvent.start);
      const originalEnd = new Date(originalEvent.end);
      const duration = originalEnd.getTime() - originalStart.getTime();
      
      const newEndTime = new Date(newStartTime.getTime() + duration);
      
      // Update the event in the database
      await updateCalendarEvent(eventId, {
        start: newStartTime.toISOString(),
        end: newEndTime.toISOString(),
        resourceId: targetResourceId
      });

      console.log('Event updated successfully');
      
      // Call the original handler if provided
      if (onEventDrop) {
        await onEventDrop(eventId, targetResourceId, targetDate, targetTime);
      }
    } catch (error) {
      console.error('Error handling event drop:', error);
      throw error; // Re-throw to be caught by the drop handler
    }
  };

  const [{ isOver, dragType }, drop] = useDrop({
    accept: ['staff', 'calendar-event', 'STAFF'],
    drop: async (item: any, monitor) => {
      const clientOffset = monitor.getClientOffset();
      
      console.log('TimeSlots: Item dropped', { 
        item, 
        day: format(day, 'yyyy-MM-dd'), 
        resourceId: resource.id,
        eventId: item.eventId,
        staffId: item.id 
      });
      
      try {
        // Handle event drops with time calculation
        if (item.eventId && clientOffset) {
          const targetTime = getTimeSlotFromPosition(clientOffset.y);
          
          console.log('Moving event with time:', {
            eventId: item.eventId,
            fromResource: item.resourceId,
            toResource: resource.id,
            targetTime,
            clientY: clientOffset.y
          });
          
          await handleEventDropWithErrorHandling(item.eventId, resource.id, day, targetTime);
          toast.success('Event moved successfully');
        }
        // Handle staff drops
        else if ((item.id || item.staffId) && onStaffDrop) {
          const staffId = item.id || item.staffId;
          console.log('Assigning staff', staffId, 'to', resource.id);
          await onStaffDrop(staffId, resource.id, day);
          toast.success('Staff assigned successfully');
        }
      } catch (error) {
        console.error('Error in drop operation:', error);
        toast.error(`Failed to complete operation: ${error.message || 'Unknown error'}`);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      dragType: monitor.getItemType(),
    }),
  });

  // Combine the refs properly
  const combinedRef = (node: HTMLDivElement) => {
    elementRef.current = node;
    drop(node);
  };

  // Calculate event positions based on time
  const getEventPosition = (event: CalendarEvent) => {
    const startTime = new Date(event.start);
    const endTime = new Date(event.end);
    
    // Get hours and minutes as decimal
    const startHour = startTime.getHours() + startTime.getMinutes() / 60;
    const endHour = endTime.getHours() + endTime.getMinutes() / 60;
    
    // Calculate position from 6 AM (our grid starts at 6 AM)
    const gridStartHour = 6;
    const gridEndHour = 22;
    
    // Ensure event is within our time range
    const clampedStartHour = Math.max(gridStartHour, Math.min(gridEndHour, startHour));
    const clampedEndHour = Math.max(gridStartHour, Math.min(gridEndHour, endHour));
    
    // Calculate position in pixels (60px per hour)
    const top = (clampedStartHour - gridStartHour) * 60;
    const height = Math.max(30, (clampedEndHour - clampedStartHour) * 60);
    
    return { top, height };
  };

  return (
    <div
      ref={combinedRef}
      className={`time-slots-container ${isOver ? 'drop-over' : ''}`}
      style={{ 
        position: 'relative',
        backgroundColor: isOver ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
        border: isOver ? '2px dashed #3b82f6' : '2px solid transparent',
        transition: 'all 0.2s ease',
        minHeight: `${timeSlots.length * 60}px`
      }}
    >
      {/* Time slot grid with visual indicators */}
      {timeSlots.map((time, index) => (
        <div
          key={time}
          className={`time-slot ${isOver ? 'highlight' : ''}`}
          style={{
            height: '60px',
            position: 'relative',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: isOver && dragType === 'calendar-event' ? 'rgba(59, 130, 246, 0.05)' : 'transparent'
          }}
          data-time={time}
        />
      ))}
      
      {/* Events positioned absolutely */}
      <div className="events-container" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
        {events.map((event) => {
          const position = getEventPosition(event);
          return (
            <div
              key={event.id}
              style={{
                position: 'absolute',
                top: `${position.top}px`,
                height: `${position.height}px`,
                left: '4px',
                right: '4px',
                zIndex: 10,
                pointerEvents: 'auto'
              }}
            >
              <CustomEvent
                event={event}
                resource={resource}
                style={{
                  width: '100%',
                  height: '100%',
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TimeSlots;
