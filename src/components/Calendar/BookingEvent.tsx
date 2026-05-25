
import React from 'react';
import { CalendarEvent } from './ResourceData';
import { format } from 'date-fns';
import { Lock } from 'lucide-react';

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
  const isLocked = event.extendedProps?.timeLocked === true;
  const isRentalOnly = event.extendedProps?.rentalOnly === true;

  const getEventTypeColor = (eventType: string) => {
    if (isCancelled) return '#FEE2E2';
    if (isRentalOnly) {
      // Klargrön för leverans UT (rig), klarröd för retur IN (rigDown)
      if (eventType === 'rig') return '#22C55E';
      if (eventType === 'rigDown') return '#EF4444';
    }
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

  // Cancelled border has priority; locked time gets red solid border
  const borderStyle = isCancelled
    ? '2px dashed #EF4444'
    : isLocked
      ? '2px solid #DC2626'
      : undefined;

  const rentalSolid = isRentalOnly && (event.eventType === 'rig' || event.eventType === 'rigDown') && !isCancelled;
  const textColor = isCancelled ? '#991B1B' : rentalSolid ? '#FFFFFF' : '#333';

  return (
    <div
      className="booking-event"
      style={{
        ...style,
        backgroundColor: getEventTypeColor(event.eventType || 'event'),
        color: textColor,
        pointerEvents: 'auto',
        opacity: isCancelled ? 0.75 : 1,
        border: borderStyle,
        position: 'relative',
      }}
      onClick={onClick}
      title={isLocked ? 'Fast tid – bocka ur "Fast tid" för att flytta' : isRentalOnly ? 'Endast uthyrning' : undefined}
    >
      {isLocked && !isCancelled && (
        <Lock
          className="absolute top-0.5 right-0.5 h-3 w-3 text-red-600"
          aria-label="Fast tid"
        />
      )}
      {rentalSolid && (
        <div className="text-[8px] font-bold uppercase tracking-wide opacity-90">
          {event.eventType === 'rig' ? 'Leverans UT' : 'Retur IN'}
        </div>
      )}
      <div className={`font-medium truncate ${isCancelled ? 'line-through text-red-800' : ''}`} style={!isCancelled && !rentalSolid ? { color: '#333' } : undefined}>
        {isCancelled && <span className="text-[8px] font-bold text-red-600 mr-1">AVBOKAD</span>}
        {event.title}
      </div>
      <div className="text-xs" style={{ color: isCancelled ? '#DC2626' : rentalSolid ? 'rgba(255,255,255,0.9)' : '#666' }}>
        {startTime} - {endTime}
      </div>
      {event.bookingNumber && !event.extendedProps?.isLargeProject && (
        <div className="text-xs" style={{ color: isCancelled ? '#EF4444' : rentalSolid ? 'rgba(255,255,255,0.85)' : '#888' }}>
          #{event.bookingNumber}
        </div>
      )}
      {event.extendedProps?.isLargeProject && (
        <div className="text-[9px] font-semibold uppercase tracking-wide text-purple-700">
          Projekt
        </div>
      )}
    </div>
  );
};

export default BookingEvent;
