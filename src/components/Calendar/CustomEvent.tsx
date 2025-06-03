
import React, { useState, useRef } from 'react';
import { CalendarEvent, Resource, getEventColor } from './ResourceData';
import { format, addMinutes } from 'date-fns';
import { useDrag } from 'react-dnd';
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
  const eventRef = useRef<HTMLDivElement>(null);

  // Optimized drag implementation for smooth movement
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
    canDrag: !isResizing,
    options: {
      dropEffect: 'move',
    },
  });

  // Use empty preview to hide default preview (we use custom drag layer)
  React.useEffect(() => {
    preview(null, { captureDraggingState: true });
  }, [preview]);

  const eventColor = getEventColor(event.eventType);
  const startTime = format(new Date(event.start), 'HH:mm');
  const endTime = format(new Date(event.end), 'HH:mm');

  // Handle resize operations
  const handleResizeStart = (e: React.MouseEvent, direction: 'top' | 'bottom') => {
    e.stopPropagation();
    setIsResizing(true);
    
    const startY = e.clientY;
    const originalStart = new Date(event.start);
    const originalEnd = new Date(event.end);
    const pixelsPerHour = 60;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const deltaMinutes = (deltaY / pixelsPerHour) * 60;
      
      let newStart = originalStart;
      let newEnd = originalEnd;
      
      if (direction === 'top') {
        // Resizing from top changes start time
        newStart = addMinutes(originalStart, deltaMinutes);
        // Ensure minimum 15-minute duration
        if (newStart >= originalEnd) {
          newStart = addMinutes(originalEnd, -15);
        }
      } else {
        // Resizing from bottom changes end time
        newEnd = addMinutes(originalEnd, deltaMinutes);
        // Ensure minimum 15-minute duration
        if (newEnd <= originalStart) {
          newEnd = addMinutes(originalStart, 15);
        }
      }
      
      // Visual feedback could be added here
      console.log('Resizing event:', { newStart, newEnd, direction, deltaMinutes });
    };
    
    const handleMouseUp = async () => {
      setIsResizing(false);
      
      const deltaY = (window as any).lastMouseEvent?.clientY - startY || 0;
      const deltaMinutes = (deltaY / pixelsPerHour) * 60;
      
      let newStart = originalStart;
      let newEnd = originalEnd;
      
      if (direction === 'top') {
        newStart = addMinutes(originalStart, deltaMinutes);
        if (newStart >= originalEnd) {
          newStart = addMinutes(originalEnd, -15);
        }
      } else {
        newEnd = addMinutes(originalEnd, deltaMinutes);
        if (newEnd <= originalStart) {
          newEnd = addMinutes(originalStart, 15);
        }
      }
      
      if (onEventResize) {
        try {
          await onEventResize(event.id, newStart, newEnd);
        } catch (error) {
          console.error('Failed to resize event:', error);
        }
      }
      
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    // Store last mouse event for final calculation
    const trackMouseMove = (e: MouseEvent) => {
      (window as any).lastMouseEvent = e;
      handleMouseMove(e);
    };
    
    document.addEventListener('mousemove', trackMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      ref={(node) => {
        drag(node);
        eventRef.current = node;
      }}
      className={`custom-event ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''}`}
      style={{
        ...style,
        backgroundColor: eventColor,
        opacity: isDragging ? 0.3 : 1,
        cursor: isDragging ? 'grabbing' : (isResizing ? 'ns-resize' : 'grab'),
        border: 'none',
        transform: 'none',
        transition: isDragging || isResizing ? 'none' : 'opacity 0.2s ease',
        position: 'relative',
        willChange: 'transform, opacity',
        color: '#000000'
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
          backgroundColor: 'transparent',
          zIndex: 20
        }}
        onMouseDown={(e) => handleResizeStart(e, 'top')}
      />
      
      <div className="event-content" style={{ color: '#000000' }}>
        <div className="event-title" style={{ color: '#000000' }}>
          {event.title}
        </div>
        <div className="event-time" style={{ color: '#000000' }}>
          {startTime} - {endTime}
        </div>
        {event.booking_number && (
          <div className="event-booking" style={{ color: '#000000' }}>
            #{event.booking_number}
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
          backgroundColor: 'transparent',
          zIndex: 20
        }}
        onMouseDown={(e) => handleResizeStart(e, 'bottom')}
      />
    </div>
  );
});

CustomEvent.displayName = 'CustomEvent';

export default CustomEvent;
