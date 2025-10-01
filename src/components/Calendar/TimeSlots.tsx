import React from 'react';
import { CalendarEvent, Resource } from './ResourceData';
import { format } from 'date-fns';
import CustomEvent from './CustomEvent';

interface TimeSlotsProps {
  day: Date;
  resource: Resource;
  timeSlots: string[];
  events: CalendarEvent[];
}

const TimeSlots: React.FC<TimeSlotsProps> = ({
  day,
  resource,
  timeSlots,
  events
}) => {
  const elementRef = React.useRef<HTMLDivElement>(null);

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
      ref={elementRef}
      className="time-slots-container"
      style={{ 
        position: 'relative',
        minHeight: `${timeSlots.length * 25}px`
      }}
    >
      {/* Time slot grid */}
      {timeSlots.map((time) => (
        <div
          key={time}
          className="time-slot"
          style={{
            height: '25px',
            position: 'relative',
            borderBottom: '1px solid #e5e7eb'
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
