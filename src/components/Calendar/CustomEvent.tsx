import React, { useState, useRef, useCallback } from 'react';
import { CalendarEvent, Resource, getEventColor } from './ResourceData';
import { useEventNavigation } from '@/hooks/useEventNavigation';
import EventHoverCard from './EventHoverCard';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Clock, Calendar } from 'lucide-react';
import EditEventTimeDialog from './EditEventTimeDialog';
import MoveEventDateDialog from './MoveEventDateDialog';
import './CustomEvent.css';

interface CustomEventProps {
  event: CalendarEvent;
  resource: Resource;
  style?: React.CSSProperties;
  onEventResize?: () => Promise<void>;
}

const CustomEvent: React.FC<CustomEventProps> = React.memo(({
  event,
  resource,
  style,
  onEventResize
}) => {
  
  const eventRef = useRef<HTMLDivElement>(null);

  // Add event navigation hook for context menu
  const { handleEventClick } = useEventNavigation();
  
  // Dialog states
  const [showTimeDialog, setShowTimeDialog] = useState(false);
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

  // Calculate dynamic styles
  const getDynamicStyles = (): React.CSSProperties => {
    return {
      ...style,
      backgroundColor: eventColor,
      cursor: 'pointer',
      position: 'relative' as const,
      color: '#000000'
    };
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

  return (
    <>
      <EventHoverCard 
        event={event}
        onDoubleClick={handleViewDetails}
      >
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              ref={eventRef}
              className="custom-event hover:scale-105"
              style={getDynamicStyles()}
            >
              <div className="event-content" style={{ color: '#000000', pointerEvents: 'auto' }}>
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
          </ContextMenuTrigger>
          
          <ContextMenuContent className="w-40">
            <ContextMenuItem onClick={() => setShowTimeDialog(true)}>
              <Clock className="mr-2 h-4 w-4" />
              Edit Time
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setShowDateDialog(true)}>
              <Calendar className="mr-2 h-4 w-4" />
              Move to Date
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </EventHoverCard>

      {/* Time Edit Dialog */}
      <EditEventTimeDialog 
        open={showTimeDialog}
        onOpenChange={setShowTimeDialog}
        event={event}
        onUpdate={onEventResize}
      />
      
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
