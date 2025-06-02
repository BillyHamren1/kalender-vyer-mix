
import React from 'react';
import { CalendarEvent } from './ResourceData';
import { format } from 'date-fns';

interface BookingEventProps {
  event: CalendarEvent;
  style: React.CSSProperties;
  onClick?: () => void;
}

const BookingEvent: React.FC<BookingEventProps> = ({
  event,
  style,
  onClick
}) => {
  const getEventTypeColor = (eventType: string) => {
    switch(eventType) {
      case 'rig':
        return '#F2FCE2';
      case 'event':
        return '#FEF7CD';
      case 'rigDown':
        return '#FFDEE2';
      default:
        return '#E2F5FC';
    }
  };

  const startTime = format(new Date(event.start), 'HH:mm');
  const endTime = format(new Date(event.end), 'HH:mm');

  return (
    <div
      className="booking-event absolute left-1 right-1 rounded text-xs p-1 border border-gray-300 cursor-pointer hover:shadow-md transition-shadow"
      style={{
        ...style,
        backgroundColor: getEventTypeColor(event.eventType || 'event'),
        color: '#333',
        zIndex: 20,
        minHeight: '30px'
      }}
      onClick={onClick}
    >
      <div className="font-medium truncate text-gray-800">
        {event.title}
      </div>
      <div className="text-xs text-gray-600">
        {startTime} - {endTime}
      </div>
      {event.bookingNumber && (
        <div className="text-xs text-gray-500">
          #{event.bookingNumber}
        </div>
      )}
    </div>
  );
};

export default BookingEvent;
