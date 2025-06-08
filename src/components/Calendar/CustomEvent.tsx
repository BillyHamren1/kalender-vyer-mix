
import React, { useState, useRef } from 'react';
import { CalendarEvent, Resource, getEventColor } from './ResourceData';
import { format, addMinutes } from 'date-fns';
import { useDrag } from 'react-dnd';
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

  // Optimized drag implementation for smooth movement - FIXED to prevent jumping back
  const [{ isDragging }, drag, preview] = useDrag({
    type: 'calendar-event',
    item: { 
      eventId: event.id,
      resourceId: event.resourceId,
      originalEvent: event
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    canDrag: !isResizing, // Only allow dragging when not resizing
    end: (item, monitor) => {
      // This is crucial - handle the end of drag operation
      const dropResult = monitor.getDropResult();
      if (!dropResult) {
        // If no valid drop target, the drag was cancelled - don't revert
        console.log('Drag ended without valid drop target');
        return;
      }
      console.log('Drag completed successfully:', dropResult);
    },
    options: {
      dropEffect: 'move',
    },
  });

  // Use empty preview to hide default preview (we use custom drag layer)
  React.useEffect(() => {
    preview(null, { captureDraggingState: true });
  }, [preview]);

  const eventColor = getEventColor(event.eventType);
  
  // Use temporary times if resizing, otherwise use original times
  const displayStart = tempResizeState ? tempResizeState.newStart : new Date(event.start);
  const displayEnd = tempResizeState ? tempResizeState.newEnd : new Date(event.end);

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
      
      console.log('Resizing event (real-time) with 25px/hour:', { 
        newStart: newStart.toISOString(), 
        newEnd: newEnd.toISOString(), 
        direction, 
        deltaMinutes,
        heightDelta,
        topDelta,
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
      opacity: isDragging ? 0.3 : 1, // Show transparency when dragging
      cursor: isDragging ? 'grabbing' : (isResizing ? 'ns-resize' : 'grab'),
      border: isResizing ? '2px solid #3b82f6' : 'none',
      transform: 'none',
      transition: isDragging || isResizing ? 'none' : 'opacity 0.2s ease', // No transition during interaction
      position: 'relative' as const,
      willChange: 'transform, opacity',
      color: '#000000',
      boxShadow: isResizing ? '0 4px 12px rgba(59, 130, 246, 0.3)' : 'none',
      zIndex: isDragging ? 1000 : (isResizing ? 500 : 'auto') // Higher z-index when dragging
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
  const bookingNumber = event.bookingNumber || event.extendedProps?.bookingNumber || event.extendedProps?.booking_id || 'No ID';
  const deliveryCity = event.extendedProps?.deliveryCity || event.extendedProps?.delivery_city || '';

  return (
    <EventHoverCard event={event}>
      <div
        ref={(node) => {
          drag(node);
          eventRef.current = node;
        }}
        className={`custom-event ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''}`}
        style={getDynamicStyles()}
        onMouseDown={(e) => {
          // Prevent drag from starting if clicking on resize handles
          if (isResizing || e.target !== e.currentTarget) {
            e.stopPropagation();
          }
        }}
      >
        {/* Top resize handle */}
        <div
          className="resize-handle resize-handle-top"
          style={{
            position: 'absolute',
            top: '-2px',
            left: 0,
            right: 0,
            height: '4px',
            cursor: 'ns-resize',
            backgroundColor: isResizing ? 'rgba(59, 130, 246, 0.5)' : 'transparent',
            zIndex: 20
          }}
          onMouseDown={(e) => handleResizeStart(e, 'top')}
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
        
        {/* Bottom resize handle */}
        <div
          className="resize-handle resize-handle-bottom"
          style={{
            position: 'absolute',
            bottom: '-2px',
            left: 0,
            right: 0,
            height: '4px',
            cursor: 'ns-resize',
            backgroundColor: isResizing ? 'rgba(59, 130, 246, 0.5)' : 'transparent',
            zIndex: 20
          }}
          onMouseDown={(e) => handleResizeStart(e, 'bottom')}
        />
      </div>
    </EventHoverCard>
  );
});

CustomEvent.displayName = 'CustomEvent';

export default CustomEvent;
