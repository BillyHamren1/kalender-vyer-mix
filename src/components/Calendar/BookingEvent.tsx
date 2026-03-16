
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
  const isCancelled = event.bookingStatus === 'CANCELLED' || event.extendedProps?.bookingStatus === 'CANCELLED';

  const getEventTypeColor = (eventType: string) => {
    if (isCancelled) return '#FEE2E2';
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
      className="booking-event"
      style={{
        ...style,
        backgroundColor: getEventTypeColor(event.eventType || 'event'),
        color: isCancelled ? '#991B1B' : '#333',
        pointerEvents: 'auto',
        opacity: isCancelled ? 0.75 : 1,
        border: isCancelled ? '2px dashed #EF4444' : undefined,
      }}
      onClick={onClick}
    >
      <div className={`font-medium truncate ${isCancelled ? 'line-through text-red-800' : 'text-gray-800'}`}>
        {isCancelled && <span className="text-[8px] font-bold text-red-600 mr-1">AVBOKAD</span>}
        {event.title}
      </div>
      <div className={`text-xs ${isCancelled ? 'line-through text-red-600' : 'text-gray-600'}`}>
        {startTime} - {endTime}
      </div>
      {event.bookingNumber && (
        <div className={`text-xs ${isCancelled ? 'line-through text-red-500' : 'text-gray-500'}`}>
          #{event.bookingNumber}
        </div>
      )}
    </div>
  );
};

export default BookingEvent;
