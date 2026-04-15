import React, { useState, useRef, useCallback, useMemo } from 'react';
import { CalendarEvent, Resource, getEventColor, loadResourcesFromStorage } from './ResourceData';
import { useEventNavigation } from '@/hooks/useEventNavigation';
import { createDialogHandlers } from '@/hooks/useEventEditController';
import { useGlobalEditController } from '@/contexts/EditControllerContext';
import { deleteCalendarEvent } from '@/services/eventService';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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
  setEvents?: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
}

const CustomEvent: React.FC<CustomEventProps> = React.memo(({
  event,
  resource,
  style,
  onEventResize,
  readOnly = false,
  setEvents
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
  const availableResources = useMemo(() => loadResourcesFromStorage(), []);

  const eventColor = getEventColor(event.eventType);

  // Check if booking is cancelled
  const isCancelled = event.bookingStatus === 'CANCELLED' || event.extendedProps?.bookingStatus === 'CANCELLED';

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

  // Handle removing a cancelled event from the calendar
  const handleRemoveCancelledEvent = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await deleteCalendarEvent(event.id);
      toast.success('Avbokad händelse borttagen från kalendern');
    } catch (error) {
      console.error('Error removing cancelled event:', error);
      toast.error('Kunde inte ta bort händelsen');
    }
  }, [event.id]);

  // Check if this is a warehouse event
  const isWarehouseEvent = event.resourceId === 'warehouse';
  
  // Check if this is a warehouse event with source changes
  const hasSourceChanges = event.extendedProps?.has_source_changes === true && 
                           event.extendedProps?.manually_adjusted !== true;
  
  // Calculate dynamic styles
  const getDynamicStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      ...style,
      backgroundColor: isCancelled ? '#FEE2E2' : eventColor,
      cursor: 'pointer',
      position: 'relative' as const,
      color: '#000000',
      opacity: isCancelled ? 0.75 : 1,
    };
    
    // Cancelled events get a red dashed border
    if (isCancelled) {
      return {
        ...baseStyles,
        border: '2px dashed #EF4444',
        boxShadow: '0 0 6px rgba(239, 68, 68, 0.3)',
      };
    }
    
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
        {/* Cancelled badge */}
        {isCancelled && (
          <div 
            className="absolute -top-1 -right-1 bg-red-600 text-white text-[8px] px-1 py-0.5 rounded font-bold z-10"
          >
            AVBOKAD
          </div>
        )}
        {/* Large project badge — inline, not overlapping */}
        {!isCancelled && event.extendedProps?.isLargeProject && (
          <div 
            className="text-[7px] font-bold uppercase tracking-wide rounded px-1 py-px mb-0.5 w-fit"
            style={{
              backgroundColor: 'hsl(var(--primary) / 0.15)',
              color: 'hsl(var(--primary))',
            }}
          >
            Projekt
          </div>
        )}
        {/* Changed badge for warehouse events */}
        {hasSourceChanges && !isCancelled && !event.extendedProps?.isLargeProject && (
          <div 
            className="absolute -top-1 -right-1 bg-orange-500 text-white text-[8px] px-1 py-0.5 rounded font-bold z-10"
          >
            Ändrad!
          </div>
        )}
        {/* Read-only events no longer show a badge */}
        <div className={`event-title ${isCancelled ? 'line-through' : ''}`} style={{ color: isCancelled ? '#991B1B' : '#000000' }}>
          {event.title}
        </div>
        <div 
          className={`event-booking ${isCancelled ? 'line-through' : ''}`}
          style={{ 
            color: isCancelled ? '#991B1B' : '#000000',
            fontSize: '10px'
          }}
        >
          #{bookingNumber}
        </div>
        {deliveryCity && (
          <div 
            className={`event-city ${isCancelled ? 'line-through' : ''}`}
            style={{ 
              color: isCancelled ? '#991B1B' : '#000000',
              fontSize: '10px',
              opacity: 0.8
            }}
          >
            {deliveryCity}
          </div>
        )}
        {/* Trash icon for cancelled events */}
        {isCancelled && (
          <button
            onClick={handleRemoveCancelledEvent}
            className="absolute bottom-0.5 right-0.5 p-0.5 rounded bg-red-100 hover:bg-red-300 transition-colors z-20"
            title="Ta bort från kalendern"
          >
            <Trash2 className="h-3 w-3 text-red-700" />
          </button>
        )}
      </div>
    </div>
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (moveDateHandlers.canOpen()) {
      moveDateHandlers.onOpen({ id: event.id, title: event.title, start: event.start, end: event.end });
      setShowDateDialog(true);
    }
  }, [moveDateHandlers, event.id, event.title]);

  // If read-only, just render the card with double-click for details
  if (readOnly) {
    return (
      <EventHoverCard event={event} onDoubleClick={handleViewDetails}>
        {eventCardContent}
      </EventHoverCard>
    );
  }

  return (
    <>
      <EventHoverCard event={event} onDoubleClick={handleViewDetails}>
        <div onContextMenu={handleContextMenu} style={{ width: '100%', height: '100%' }}>
          {eventCardContent}
        </div>
      </EventHoverCard>
      
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
        resources={availableResources}
        onUpdate={onEventResize}
        exactTimeNeeded={event.extendedProps?.exactTimeNeeded === true}
        setEvents={setEvents}
      />
    </>
  );
});

CustomEvent.displayName = 'CustomEvent';

export default CustomEvent;
