import React from 'react';
import { CalendarEvent, Resource, getEventColor } from './ResourceData';
import { format } from 'date-fns';
import { useDrag } from 'react-dnd';
import './CustomEvent.css';

interface CustomEventProps {
  event: CalendarEvent;
  resource: Resource;
  style?: React.CSSProperties;
}

const CustomEvent: React.FC<CustomEventProps> = ({
  event,
  resource,
  style
}) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'event',
    item: { 
      id: event.id, 
      type: 'event',
      resourceId: event.resourceId,
      originalEvent: event
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const eventColor = getEventColor(event.eventType);
  const startTime = format(new Date(event.start), 'HH:mm');
  const endTime = format(new Date(event.end), 'HH:mm');

  return (
    <div
      ref={drag}
      className={`custom-event ${isDragging ? 'dragging' : ''}`}
      style={{
        ...style,
        backgroundColor: eventColor,
        opacity: isDragging ? 0.5 : 1,
        cursor: 'move',
      }}
    >
      <div className="event-content">
        <div className="event-title">
          {event.title}
        </div>
        <div className="event-time">
          {startTime} - {endTime}
        </div>
        {event.bookingNumber && (
          <div className="event-booking">
            #{event.bookingNumber}
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomEvent;
