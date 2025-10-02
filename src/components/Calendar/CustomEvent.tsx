
import React, { useState, useRef } from 'react';
import { CalendarEvent, Resource, getEventColor } from './ResourceData';
import { format, addMinutes } from 'date-fns';
import { useEventNavigation } from '@/hooks/useEventNavigation';
import EventHoverCard from './EventHoverCard';
import './CustomEvent.css';

interface CustomEventProps {
  event: CalendarEvent;
  resource: Resource;
  style?: React.CSSProperties;
  onEventResize?: (eventId: string, newStartTime: Date, newEndTime: Date) => Promise<void>;
}

const CustomEvent: React.FC<CustomEventProps> = React.memo(({
  event,
  resource,
  style,
  onEventResize
}) => {
  const [isResizing, setIsResizing] = useState(false);
  
  // State for real-time visual feedback during resize
  const [tempResizeState, setTempResizeState] = useState<{
    newStart: Date;
    newEnd: Date;
    heightDelta: number;
    topDelta: number;
  } | null>(null);
  
  const eventRef = useRef<HTMLDivElement>(null);

  // Add event navigation hook for click handling
  const { handleEventClick } = useEventNavigation();

  const eventColor = getEventColor(event.eventType);
  
  // Use temporary times if resizing, otherwise use original times
  const displayStart = tempResizeState ? tempResizeState.newStart : new Date(event.start);
  const displayEnd = tempResizeState ? tempResizeState.newEnd : new Date(event.end);

  // Handle click for navigation
  const handleClick = (e: React.MouseEvent) => {
    // Prevent double-click during resize operations
    if (isResizing) {
      e.stopPropagation();
      return;
    }

    // Don't handle clicks on resize handles
    const target = e.target as HTMLElement;
    if (target.classList.contains('resize-handle') || target.closest('.resize-handle')) {
      e.stopPropagation();
      return;
    }

    // Create mock event info object matching the expected interface
    const mockEventInfo = {
      event: {
        id: event.id,
        title: event.title,
        start: new Date(event.start),
        end: new Date(event.end),
        extendedProps: {
          bookingId: event.bookingId,
          booking_id: event.bookingId,
          resourceId: event.resourceId,
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

    console.log('CustomEvent clicked, calling handleEventClick with:', mockEventInfo);
    handleEventClick(mockEventInfo);
  };

  // Handle resize operations with real-time visual feedback - FIXED to use 25px per hour
  const handleResizeStart = (e: React.MouseEvent, direction: 'top' | 'bottom') => {
    e.stopPropagation();
    e.preventDefault(); // Prevent drag from starting during resize
    setIsResizing(true);
    
    const startY = e.clientY;
    const originalStart = new Date(event.start);
    const originalEnd = new Date(event.end);
    // FIXED: Use 25px per hour to match TimeGrid
    const pixelsPerHour = 25;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault(); // Prevent any other interactions
      
      const deltaY = moveEvent.clientY - startY;
      const deltaMinutes = (deltaY / pixelsPerHour) * 60;
      
      let newStart = originalStart;
      let newEnd = originalEnd;
      let heightDelta = 0;
      let topDelta = 0;
      
      if (direction === 'top') {
        // Resizing from top changes start time and position
        newStart = addMinutes(originalStart, deltaMinutes);
        // Ensure minimum 15-minute duration
        if (newStart >= originalEnd) {
          newStart = addMinutes(originalEnd, -15);
        }
        
        // Calculate visual changes
        const actualDeltaMinutes = (newStart.getTime() - originalStart.getTime()) / (1000 * 60);
        topDelta = (actualDeltaMinutes / 60) * pixelsPerHour;
        heightDelta = -topDelta; // Height decreases when top moves down
        
      } else {
        // Resizing from bottom changes end time and height
        newEnd = addMinutes(originalEnd, deltaMinutes);
        // Ensure minimum 15-minute duration
        if (newEnd <= originalStart) {
          newEnd = addMinutes(originalStart, 15);
        }
        
        // Calculate visual changes
        const actualDeltaMinutes = (newEnd.getTime() - originalEnd.getTime()) / (1000 * 60);
        heightDelta = (actualDeltaMinutes / 60) * pixelsPerHour;
        topDelta = 0; // Top position doesn't change when resizing from bottom
      }
      
      // Update temporary visual state for immediate feedback
      setTempResizeState({
        newStart,
        newEnd,
        heightDelta,
        topDelta
      });
      
      console.log('🔄 RESIZING EVENT (real-time):', { 
        direction,
        deltaY,
        deltaMinutes,
        newStart: format(newStart, 'HH:mm'),
        newEnd: format(newEnd, 'HH:mm'),
        heightDelta: `${heightDelta}px`,
        topDelta: `${topDelta}px`,
        pixelsPerHour
      });
    };
    
    const handleMouseUp = async (upEvent: MouseEvent) => {
      upEvent.preventDefault();
      setIsResizing(false);
      
      if (tempResizeState && onEventResize) {
        try {
          console.log('Finalizing resize operation');
          await onEventResize(event.id, tempResizeState.newStart, tempResizeState.newEnd);
        } catch (error) {
          console.error('Failed to resize event:', error);
        }
      }
      
      // Clear temporary state
      setTempResizeState(null);
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Calculate dynamic styles with real-time resize feedback
  const getDynamicStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      ...style,
      backgroundColor: eventColor,
      cursor: isResizing ? 'ns-resize' : 'pointer',
      border: isResizing ? '2px solid #3b82f6' : 'none',
      transform: 'none',
      transition: isResizing ? 'none' : 'opacity 0.2s ease, transform 0.2s ease',
      position: 'relative' as const,
      willChange: 'transform, opacity',
      color: '#000000',
      boxShadow: isResizing ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none',
      zIndex: isResizing ? 500 : 'auto'
    };

    // Apply real-time resize visual feedback
    if (tempResizeState && isResizing) {
      const currentHeight = parseFloat(style?.height as string) || 60;
      const newHeight = Math.max(15, currentHeight + tempResizeState.heightDelta); // Minimum 15px height
      
      return {
        ...baseStyles,
        height: `${newHeight}px`,
        transform: `translateY(${tempResizeState.topDelta}px)`,
        backgroundColor: `${eventColor}dd`, // Slightly more transparent during resize
      };
    }

    return baseStyles;
  };

  // Get booking number and delivery city from event
  // Format booking ID to show only last 8 characters if it's a UUID
  const rawBookingId = event.bookingNumber || event.extendedProps?.bookingNumber || event.extendedProps?.booking_id || 'No ID';
  const bookingNumber = rawBookingId.length > 20 ? rawBookingId.slice(-8) : rawBookingId;
  const deliveryCity = event.extendedProps?.deliveryCity || event.extendedProps?.delivery_city || '';

  // Debug logging to see what data we have
  console.log('CustomEvent data:', {
    eventId: event.id,
    title: event.title,
    bookingNumber,
    deliveryCity,
    extendedProps: event.extendedProps
  });

  return (
    <EventHoverCard event={event}>
      <div
        ref={eventRef}
        className={`custom-event ${isResizing ? 'resizing' : ''} hover:scale-105`}
        style={getDynamicStyles()}
        onClick={handleClick}
      >
        {/* Top resize handle - Made more visible and easier to grab */}
        <div
          className="resize-handle resize-handle-top group/handle"
          style={{
            position: 'absolute',
            top: '-4px',
            left: 0,
            right: 0,
            height: '10px',
            cursor: 'ns-resize',
            backgroundColor: isResizing ? 'rgba(59, 130, 246, 0.6)' : 'rgba(0, 0, 0, 0.1)',
            borderTop: '2px solid rgba(59, 130, 246, 0.4)',
            zIndex: 20,
            transition: 'all 0.2s ease'
          }}
          onMouseDown={(e) => handleResizeStart(e, 'top')}
          title="Drag to resize start time"
        />
        
        <div className="event-content" style={{ color: '#000000', pointerEvents: isResizing ? 'none' : 'auto' }}>
          <div className="event-title" style={{ color: '#000000' }}>
            {event.title}
          </div>
          <div 
            className="event-booking" 
            style={{ 
              color: '#000000',
              fontWeight: isResizing ? 'bold' : 'normal',
              fontSize: isResizing ? '11px' : '10px'
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
        
        {/* Bottom resize handle - Made more visible and easier to grab */}
        <div
          className="resize-handle resize-handle-bottom group/handle"
          style={{
            position: 'absolute',
            bottom: '-4px',
            left: 0,
            right: 0,
            height: '10px',
            cursor: 'ns-resize',
            backgroundColor: isResizing ? 'rgba(59, 130, 246, 0.6)' : 'rgba(0, 0, 0, 0.1)',
            borderBottom: '2px solid rgba(59, 130, 246, 0.4)',
            zIndex: 20,
            transition: 'all 0.2s ease'
          }}
          onMouseDown={(e) => handleResizeStart(e, 'bottom')}
          title="Drag to resize end time"
        />
      </div>
    </EventHoverCard>
  );
});

CustomEvent.displayName = 'CustomEvent';

export default CustomEvent;
