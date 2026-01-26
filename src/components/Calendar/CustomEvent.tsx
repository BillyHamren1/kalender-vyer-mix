import React, { useState, useRef, useCallback } from 'react';
import { CalendarEvent, Resource, getEventColor } from './ResourceData';
import { useEventNavigation } from '@/hooks/useEventNavigation';
import EventHoverCard from './EventHoverCard';
import QuickTimeEditPopover from './QuickTimeEditPopover';
import MoveEventDateDialog from './MoveEventDateDialog';
import './CustomEvent.css';

interface CustomEventProps {
  event: CalendarEvent;
  resource: Resource;
  style?: React.CSSProperties;
  onEventResize?: () => Promise<void>;
  readOnly?: boolean;
}

const CustomEvent: React.FC<CustomEventProps> = React.memo(({
  event,
  resource,
  style,
  onEventResize,
  readOnly = false
}) => {
  
  const eventRef = useRef<HTMLDivElement>(null);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  // Add event navigation hook for context menu
  const { handleEventClick } = useEventNavigation();
  
  // Dialog state for date move
  const [showDateDialog, setShowDateDialog] = useState(false);

  const eventColor = getEventColor(event.eventType);

  // Context menu handlers
  const handleViewDetails = useCallback(() => {
    if (event.bookingId) {
      // Create mock event info for navigation
      const mockEventInfo = {
        event: {
          id: event.id,
          title: event.title,
          start: new Date(event.start),
          end: new Date(event.end),
          extendedProps: {
            bookingId: event.bookingId,
            booking_id: event.bookingId,
            ...event.extendedProps
          },
          _def: {
            extendedProps: {
              bookingId: event.bookingId,
              booking_id: event.bookingId
            }
          }
        },
        el: eventRef.current
      };
      handleEventClick(mockEventInfo);
    }
  }, [event, handleEventClick]);

  // Check if this is a warehouse event with source changes
  const hasSourceChanges = event.extendedProps?.has_source_changes === true && 
                           event.extendedProps?.manually_adjusted !== true;
  
  // Calculate dynamic styles
  const getDynamicStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      ...style,
      backgroundColor: eventColor,
      cursor: 'pointer',
      position: 'relative' as const,
      color: '#000000'
    };
    
    // Add orange border + animation for warehouse events with changes
    if (hasSourceChanges) {
      return {
        ...baseStyles,
        border: '2px solid #f97316',
        boxShadow: '0 0 8px rgba(249, 115, 22, 0.5)',
        animation: 'pulse-orange 2s infinite'
      };
    }
    
    return baseStyles;
  };

  // Get booking number and delivery city from event
  const rawBookingId = event.bookingNumber || event.extendedProps?.bookingNumber || event.extendedProps?.booking_id || 'No ID';
  const bookingNumber = rawBookingId.length > 20 ? rawBookingId.slice(-8) : rawBookingId;
  const deliveryCity = event.extendedProps?.deliveryCity || event.extendedProps?.delivery_city || '';

  console.log('CustomEvent data:', {
    eventId: event.id,
    title: event.title,
    bookingNumber,
    deliveryCity,
    extendedProps: event.extendedProps
  });

  // Render the event card content
  const eventCardContent = (
    <div
      ref={eventRef}
      className={`custom-event hover:scale-105 ${hasSourceChanges ? 'warehouse-changed' : ''} ${readOnly ? 'cursor-default' : ''}`}
      style={getDynamicStyles()}
    >
      <div className="event-content" style={{ color: '#000000', pointerEvents: 'auto' }}>
        {/* Changed badge for warehouse events */}
        {hasSourceChanges && (
          <div 
            className="absolute -top-1 -right-1 bg-orange-500 text-white text-[8px] px-1 py-0.5 rounded font-bold z-10"
          >
            Ändrad!
          </div>
        )}
        {/* Read-only badge for protected events */}
        {readOnly && (
          <div 
            className="absolute -top-1 -left-1 bg-slate-500 text-white text-[7px] px-1 py-0.5 rounded font-medium z-10"
            title="Skrivskyddad i lagerkalendern"
          >
            🔒
          </div>
        )}
        <div className="event-title" style={{ color: '#000000' }}>
          {event.title}
        </div>
        <div 
          className="event-booking" 
          style={{ 
            color: '#000000',
            fontSize: '10px'
          }}
        >
          #{bookingNumber}
        </div>
        {deliveryCity && (
          <div 
            className="event-city" 
            style={{ 
              color: '#000000',
              fontSize: '10px',
              opacity: 0.8
            }}
          >
            {deliveryCity}
          </div>
        )}
      </div>
    </div>
  );

  // If read-only, skip the edit popovers and dialogs
  if (readOnly) {
    return (
      <EventHoverCard 
        event={event}
        onDoubleClick={handleViewDetails}
        disabled={false}
      >
        {eventCardContent}
      </EventHoverCard>
    );
  }

  return (
    <>
      <EventHoverCard 
        event={event}
        onDoubleClick={handleViewDetails}
        disabled={isPopoverOpen}
      >
        <QuickTimeEditPopover
          event={event}
          onUpdate={onEventResize}
          onMoveDate={() => setShowDateDialog(true)}
          onOpenChange={setIsPopoverOpen}
        >
          {eventCardContent}
        </QuickTimeEditPopover>
      </EventHoverCard>
      
      {/* Date Move Dialog */}
      <MoveEventDateDialog
        open={showDateDialog}
        onOpenChange={setShowDateDialog}
        event={event}
        onUpdate={onEventResize}
      />
    </>
  );
});

CustomEvent.displayName = 'CustomEvent';

export default CustomEvent;
