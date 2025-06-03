
import React, { useState, useRef } from 'react';
import { CalendarEvent, Resource, getEventColor } from './ResourceData';
import { format } from 'date-fns';
import { useDrag } from 'react-dnd';
import './CustomEvent.css';

interface CustomEventProps {
  event: CalendarEvent;
  resource: Resource;
  style?: React.CSSProperties;
}

const CustomEvent: React.FC<CustomEventProps> = ({
  event,
  resource,
  style
}) => {
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const eventRef = useRef<HTMLDivElement>(null);

  // Standardized drag implementation
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
  });

  const eventColor = getEventColor(event.eventType);
  const startTime = format(new Date(event.start), 'HH:mm');
  const endTime = format(new Date(event.end), 'HH:mm');

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (eventRef.current) {
      const rect = eventRef.current.getBoundingClientRect();
      const tooltipHeight = 80; // Estimated tooltip height
      const tooltipWidth = 200; // Estimated tooltip width
      
      // Calculate initial position (above the event)
      let top = rect.top - tooltipHeight - 10;
      let left = rect.left + (rect.width / 2) - (tooltipWidth / 2);
      
      // Adjust if tooltip would go off screen
      if (top < 0) {
        top = rect.bottom + 10; // Show below if no space above
      }
      
      if (left < 0) {
        left = 10; // Keep some margin from left edge
      } else if (left + tooltipWidth > window.innerWidth) {
        left = window.innerWidth - tooltipWidth - 10; // Keep some margin from right edge
      }
      
      setTooltipPosition({ top, left });
      setIsTooltipVisible(true);
    }
  };

  const handleMouseLeave = () => {
    setIsTooltipVisible(false);
  };

  const handleTooltipMouseEnter = () => {
    setIsTooltipVisible(true);
  };

  const handleTooltipMouseLeave = () => {
    setIsTooltipVisible(false);
  };

  return (
    <>
      <div
        ref={(node) => {
          drag(node);
          eventRef.current = node;
        }}
        className={`custom-event ${isDragging ? 'dragging' : ''}`}
        style={{
          ...style,
          backgroundColor: eventColor,
          opacity: isDragging ? 0.5 : 1,
          cursor: isDragging ? 'grabbing' : 'grab',
          border: isDragging ? '2px dashed #3b82f6' : 'none',
          transform: isDragging ? 'rotate(2deg)' : 'none',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
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
      </div>

      {/* Tooltip */}
      {isTooltipVisible && (
        <div 
          className="event-tooltip"
          style={{
            position: 'fixed',
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
          }}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        >
          <div className="tooltip-arrow"></div>
          <div className="tooltip-content">
            <div className="tooltip-title">{event.title}</div>
            {event.booking_number && (
              <div className="tooltip-booking">Booking: #{event.booking_number}</div>
            )}
            <div className="tooltip-time">{startTime} – {endTime}</div>
          </div>
        </div>
      )}
    </>
  );
};

export default CustomEvent;
