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
  const elementRef = React.useRef<HTMLDivElement>(null);

  // Enhanced time calculation with better boundary handling for bidirectional movement
  const getTimeSlotFromPosition = (clientY: number) => {
    if (!elementRef.current) {
      console.warn('Element ref not available for time calculation');
      return '12:00';
    }
    
    const rect = elementRef.current.getBoundingClientRect();
    
    // Account for header offset: day header (40px) + team header (40px) + staff row (80px) = 160px
    const headerOffset = 160;
    const relativeY = clientY - rect.top - headerOffset;
    
    console.log('Enhanced time calculation debug:', {
      clientY,
      rectTop: rect.top,
      headerOffset,
      relativeY,
      direction: relativeY < 0 ? 'upward' : 'downward'
    });
    
    // Use 25px per hour for consistency
    const pixelsPerHour = 25;
    const startHour = 5; // Grid starts at 5 AM
    
    // Calculate precise time with enhanced boundary handling
    const totalHours = relativeY / pixelsPerHour;
    const targetHour = startHour + totalHours;
    
    // Ensure we stay within calendar bounds (5 AM to 11 PM)
    const clampedHour = Math.max(5, Math.min(23, targetHour));
    
    // Round to nearest 5-minute interval for smoother drops
    const totalMinutes = clampedHour * 60;
    const roundedMinutes = Math.round(totalMinutes / 5) * 5;
    
    const finalHour = Math.floor(roundedMinutes / 60);
    const finalMinutes = roundedMinutes % 60;
    
    const calculatedTime = `${finalHour.toString().padStart(2, '0')}:${finalMinutes.toString().padStart(2, '0')}`;
    
    console.log('Enhanced calculated time:', calculatedTime, 'from position:', relativeY, 'direction:', relativeY < 0 ? 'UP' : 'DOWN');
    
    return calculatedTime;
  };

  // Optimized event drop handler - NO MANUAL REFRESH
  const handleEventDropOptimized = async (
    eventId: string, 
    targetResourceId: string, 
    targetDate: Date, 
    targetTime: string
  ) => {
    try {
      console.log('TimeSlots: Handling optimized event drop', {
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
      
      // Update the event in the database - real-time subscription will handle UI updates
      await updateCalendarEvent(eventId, {
        start: newStartTime.toISOString(),
        end: newEndTime.toISOString(),
        resourceId: targetResourceId
      });

      console.log('Event updated successfully - real-time will refresh UI');
      
      // NO manual refresh - real-time subscription handles this
      
    } catch (error) {
      console.error('Error handling event drop:', error);
      throw error; // Re-throw to be caught by the drop handler
    }
  };

  const [{ isOver, dragType, canDrop }, drop] = useDrop({
    accept: ['staff', 'calendar-event', 'STAFF'],
    drop: async (item: any, monitor) => {
      const clientOffset = monitor.getClientOffset();
      
      console.log('Enhanced TimeSlots: Item dropped with bidirectional support', { 
        item, 
        day: format(day, 'yyyy-MM-dd'), 
        resourceId: resource.id,
        eventId: item.eventId,
        staffId: item.id,
        dropPosition: clientOffset?.y
      });
      
      try {
        // Handle event drops with enhanced time calculation
        if (item.eventId && clientOffset) {
          const targetTime = getTimeSlotFromPosition(clientOffset.y);
          
          console.log('Enhanced event move with bidirectional support:', {
            eventId: item.eventId,
            fromResource: item.resourceId,
            toResource: resource.id,
            targetTime,
            clientY: clientOffset.y,
            direction: 'bidirectional'
          });
          
          await handleEventDropOptimized(item.eventId, resource.id, day, targetTime);
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
        console.error('Error in enhanced drop operation:', error);
        toast.error(`Failed to complete operation: ${error.message || 'Unknown error'}`);
      }
    },
    canDrop: (item) => {
      // Enhanced drop validation - allow drops from any direction
      return item && (item.eventId || item.id || item.staffId);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
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
      className={`time-slots-container ${isOver ? 'drop-over' : ''} ${canDrop ? 'can-drop' : ''}`}
      style={{ 
        position: 'relative',
        backgroundColor: isOver && canDrop ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
        border: isOver && canDrop ? '2px dashed #3b82f6' : '2px solid transparent',
        transition: 'all 0.2s ease',
        minHeight: `${timeSlots.length * 25}px`,
        // Enhanced drop zone coverage
        minWidth: '100%',
        zIndex: isOver ? 10 : 1
      }}
    >
      {/* Enhanced time slot grid with better visual indicators */}
      {timeSlots.map((time, index) => (
        <div
          key={time}
          className={`time-slot ${isOver ? 'highlight' : ''} ${canDrop ? 'drop-ready' : ''}`}
          style={{
            height: '25px',
            position: 'relative',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: isOver && canDrop && dragType === 'calendar-event' 
              ? 'rgba(59, 130, 246, 0.05)' 
              : 'transparent',
            // Enhanced hover feedback
            transition: 'background-color 0.1s ease'
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
