
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

const CustomEvent: React.FC<CustomEventProps> = ({
  event,
  resource,
  style,
  onEventResize
}) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [isResizing, setIsResizing] = useState(false);
  const eventRef = useRef<HTMLDivElement>(null);

  // Drag implementation for moving events
  const [{ isDragging }, drag] = useDrag({
    type: 'calendar-event',
    item: { 
      eventId: event.id,
      resourceId: event.resourceId,
      originalEvent: event
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    canDrag: !isResizing, // Prevent dragging while resizing
  });

  const eventColor = getEventColor(event.eventType);
  const startTime = format(new Date(event.start), 'HH:mm');
  const endTime = format(new Date(event.end), 'HH:mm');

  // Handle resize operations
  const handleResizeStart = (e: React.MouseEvent, direction: 'top' | 'bottom') => {
    e.stopPropagation();
    setIsResizing(true);
    // Hide tooltip when resizing starts
    setIsTooltipVisible(false);
    
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

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    // Don't show tooltip if dragging or resizing
    if (eventRef.current && !isResizing && !isDragging) {
      const rect = eventRef.current.getBoundingClientRect();
      const tooltipHeight = 80;
      const tooltipWidth = 200;
      
      let top = rect.top - tooltipHeight - 10;
      let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
      
      if (top < 0) {
        top = rect.bottom + 10;
      }
      
      if (left < 0) {
        left = 10;
      } else if (left + tooltipWidth > window.innerWidth) {
        left = window.innerWidth - tooltipWidth - 10;
      }
      
      setTooltipPosition({ top, left });
      setIsTooltipVisible(true);
    }
  };

  const handleMouseLeave = () => {
    if (!isResizing && !isDragging) {
      setIsTooltipVisible(false);
    }
  };

  // Hide tooltip when dragging starts
  React.useEffect(() => {
    if (isDragging) {
      setIsTooltipVisible(false);
    }
  }, [isDragging]);

  return (
    <>
      <div
        ref={(node) => {
          drag(node);
          eventRef.current = node;
        }}
        className={`custom-event ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''}`}
        style={{
          ...style,
          backgroundColor: eventColor,
          opacity: isDragging ? 0.5 : 1,
          cursor: isDragging ? 'grabbing' : (isResizing ? 'ns-resize' : 'grab'),
          border: isDragging ? '2px dashed #3b82f6' : 'none',
          transform: isDragging ? 'rotate(2deg)' : 'none',
          transition: isDragging || isResizing ? 'none' : 'all 0.2s ease',
          position: 'relative'
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
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
        
        <div className="event-content">
          <div className="event-title">
            {event.title}
          </div>
          <div className="event-time">
            {startTime} - {endTime}
          </div>
          {event.booking_number && (
            <div className="event-booking">
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

      {/* Tooltip - only show when not dragging or resizing */}
      {isTooltipVisible && !isResizing && !isDragging && (
        <div 
          className="event-tooltip"
          style={{
            position: 'fixed',
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            zIndex: 1000
          }}
        >
          <div className="tooltip-arrow"></div>
          <div className="tooltip-content">
            <div className="tooltip-title">{event.title}</div>
            {event.booking_number && (
              <div className="tooltip-booking">Booking: #{event.booking_number}</div>
            )}
            <div className="tooltip-time">{startTime} – {endTime}</div>
            <div className="tooltip-instructions">
              <small>Drag to move • Drag edges to resize</small>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CustomEvent;
