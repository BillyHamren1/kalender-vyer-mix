import React from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import CustomEvent from './CustomEvent';
import { useDrop } from 'react-dnd';
import { toast } from 'sonner';

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
  // Calculate which time slot was dropped on based on Y position
  const getTimeSlotFromPosition = (clientY: number, dropZoneElement: HTMLElement) => {
    const rect = dropZoneElement.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    const slotHeight = 60; // Each time slot is 60px high
    const slotIndex = Math.floor(relativeY / slotHeight);
    
    // Time slots start at 6 AM (index 0) and go to 22 PM
    const hour = Math.max(6, Math.min(22, 6 + slotIndex));
    return `${hour.toString().padStart(2, '0')}:00`;
  };

  const [{ isOver, dragType }, drop] = useDrop({
    accept: ['staff', 'calendar-event', 'STAFF'],
    drop: async (item: any, monitor) => {
      const clientOffset = monitor.getClientOffset();
      const dropElement = drop as any; // Fix TypeScript issue
      
      console.log('TimeSlots: Item dropped', item, 'on', format(day, 'yyyy-MM-dd'), resource.id);
      
      try {
        // Handle event drops with time calculation
        if (item.eventId && onEventDrop && clientOffset && dropElement) {
          const targetTime = getTimeSlotFromPosition(clientOffset.y, dropElement);
          
          console.log('Moving event with time:', {
            eventId: item.eventId,
            fromResource: item.resourceId,
            toResource: resource.id,
            targetTime,
            clientY: clientOffset.y
          });
          
          await onEventDrop(item.eventId, resource.id, day, targetTime);
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
        toast.error('Failed to complete operation. Please try again.');
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      dragType: monitor.getItemType(),
    }),
  });

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
      ref={drop}
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
