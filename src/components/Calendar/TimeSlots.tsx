
import React from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import CustomEvent from './CustomEvent';
import { useDrop } from 'react-dnd';

interface TimeSlotsProps {
  day: Date;
  resource: Resource;
  timeSlots: string[];
  events: CalendarEvent[];
  onStaffDrop?: (staffId: string, resourceId: string | null, targetDate?: Date) => Promise<void>;
}

const TimeSlots: React.FC<TimeSlotsProps> = ({
  day,
  resource,
  timeSlots,
  events,
  onStaffDrop
}) => {
  const [{ isOver }, drop] = useDrop({
    accept: ['staff', 'event'],
    drop: (item: any) => {
      console.log('TimeSlots: Item dropped', item, 'on', format(day, 'yyyy-MM-dd'), resource.id);
      if (item.type === 'staff' && onStaffDrop) {
        onStaffDrop(item.id, resource.id, day);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });

  // Calculate event positions based on time - FIXED calculation
  const getEventPosition = (event: CalendarEvent) => {
    const startTime = new Date(event.start);
    const endTime = new Date(event.end);
    
    // Get hours and minutes as decimal
    const startHour = startTime.getHours() + startTime.getMinutes() / 60;
    const endHour = endTime.getHours() + endTime.getMinutes() / 60;
    
    console.log(`Event ${event.title}: ${startHour} - ${endHour}`);
    
    // Calculate position from 6 AM (our grid starts at 6 AM)
    const gridStartHour = 6;
    const gridEndHour = 22;
    
    // Ensure event is within our time range
    const clampedStartHour = Math.max(gridStartHour, Math.min(gridEndHour, startHour));
    const clampedEndHour = Math.max(gridStartHour, Math.min(gridEndHour, endHour));
    
    // Calculate position in pixels (60px per hour)
    const top = (clampedStartHour - gridStartHour) * 60;
    const height = Math.max(30, (clampedEndHour - clampedStartHour) * 60);
    
    console.log(`Event ${event.title} positioned at top: ${top}px, height: ${height}px`);
    
    return { top, height };
  };

  return (
    <div
      ref={drop}
      className={`time-slots-container ${isOver ? 'drop-over' : ''}`}
      style={{ position: 'relative' }}
    >
      {/* Time slot grid */}
      {timeSlots.map((time, index) => (
        <div
          key={time}
          className="time-slot"
          style={{
            height: '60px',
            position: 'relative',
          }}
        />
      ))}
      
      {/* Events positioned absolutely */}
      <div className="events-container">
        {events.map((event) => {
          const position = getEventPosition(event);
          return (
            <CustomEvent
              key={event.id}
              event={event}
              resource={resource}
              style={{
                position: 'absolute',
                top: `${position.top}px`,
                height: `${position.height}px`,
                left: '4px',
                right: '4px',
                zIndex: 10,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

export default TimeSlots;
