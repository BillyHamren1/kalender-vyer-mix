
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

  // Calculate event positions based on time
  const getEventPosition = (event: CalendarEvent) => {
    const startTime = new Date(event.start);
    const endTime = new Date(event.end);
    
    // Calculate position from 6 AM
    const startHour = startTime.getHours() + startTime.getMinutes() / 60;
    const endHour = endTime.getHours() + endTime.getMinutes() / 60;
    
    const top = Math.max(0, (startHour - 6) * 60); // 60px per hour
    const height = Math.max(30, (endHour - startHour) * 60); // Minimum 30px height
    
    return { top, height };
  };

  return (
    <div
      ref={drop}
      className={`time-slots-container ${isOver ? 'drop-over' : ''}`}
    >
      {/* Time slot grid */}
      {timeSlots.map((time, index) => (
        <div
          key={time}
          className="time-slot"
          style={{
            height: '60px',
            borderBottom: index < timeSlots.length - 1 ? '1px solid #e5e7eb' : 'none',
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
                left: '2px',
                right: '2px',
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
