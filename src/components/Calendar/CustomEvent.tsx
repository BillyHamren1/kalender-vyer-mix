import React, { useState, useRef, useCallback } from 'react';
import { CalendarEvent, Resource, getEventColor } from './ResourceData';
import { useEventNavigation } from '@/hooks/useEventNavigation';
import { createDialogHandlers } from '@/hooks/useEventEditController';
import { useGlobalEditController } from '@/contexts/EditControllerContext';
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
  
  // EDIT CONTROLLER: Global mutex via context — shared across all events
  const editController = useGlobalEditController();
  const quickTimeHandlers = createDialogHandlers(editController, 'quickTime');
  const moveDateHandlers = createDialogHandlers(editController, 'moveDate');
  
  // Dialog state for date move — LEGACY: still uses local state,
  // but now gated by editController for conflict prevention
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
        {/* Read-only events no longer show a badge */}
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

  // If read-only, just render the card with double-click for details
  if (readOnly) {
    return (
      <div onDoubleClick={handleViewDetails} style={{ width: '100%', height: '100%' }}>
        {eventCardContent}
      </div>
    );
  }

  return (
    <>
      <div onDoubleClick={handleViewDetails} style={{ width: '100%', height: '100%' }}>
        {eventCardContent}
      </div>
      
      {/* Date Move Dialog — LEGACY local state, gated by editController */}
      <MoveEventDateDialog
        open={showDateDialog}
        onOpenChange={(open) => {
          setShowDateDialog(open);
          if (!open) {
            moveDateHandlers.onClose();
          }
        }}
        event={event}
        onUpdate={onEventResize}
      />
    </>
  );
});

CustomEvent.displayName = 'CustomEvent';

export default CustomEvent;
