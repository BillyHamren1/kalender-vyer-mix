
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useDragLayer } from 'react-dnd';
import { CalendarEvent, getEventColor } from './ResourceData';
import { format, addMinutes } from 'date-fns';

// Calculate drop time - matches TimeGrid's getDropTime logic exactly
const calculateDropTime = (mouseY: number): string => {
  // Find the time grid elements
  const timeGrids = document.querySelectorAll('.time-slots-grid');
  
  for (const grid of Array.from(timeGrids)) {
    const rect = grid.getBoundingClientRect();
    
    // Check if mouse is within this grid's vertical bounds
    if (mouseY >= rect.top && mouseY <= rect.bottom) {
      // Account for scroll offset (match TimeGrid logic)
      const parentElement = grid.parentElement;
      const parentScroll = parentElement?.scrollTop || 0;
      const relativeY = mouseY - rect.top + parentScroll;
      
      // Use consistent 25px per hour to match visual rendering
      const pixelsPerHour = 25;
      const startHour = 5; // Always start from 05:00
      
      // Calculate time from pixel position
      const hoursFromStart = Math.max(0, relativeY) / pixelsPerHour;
      const totalMinutes = (startHour * 60) + (hoursFromStart * 60);
      
      // Round to nearest 5-minute interval
      const roundedMinutes = Math.round(totalMinutes / 5) * 5;
      
      const finalHour = Math.floor(roundedMinutes / 60);
      const finalMinutes = roundedMinutes % 60;
      
      // Extended range: 05:00 to 28:55 (04:55 next day)
      const maxHour = 28;
      const clampedHour = Math.max(5, Math.min(maxHour, finalHour));
      const clampedMinutes = clampedHour === maxHour ? Math.min(55, finalMinutes) : finalMinutes;
      
      return `${clampedHour.toString().padStart(2, '0')}:${clampedMinutes.toString().padStart(2, '0')}`;
    }
  }
  
  // Fallback to a default time if no grid found
  return '09:00';
};

const DragLayer: React.FC = () => {
  const {
    itemType,
    isDragging,
    item,
    currentOffset,
  } = useDragLayer((monitor) => ({
    item: monitor.getItem(),
    itemType: monitor.getItemType(),
    isDragging: monitor.isDragging(),
    currentOffset: monitor.getClientOffset(),
  }));

  const [dropTime, setDropTime] = useState<string>('');

  // Update drop time based on mouse position
  useEffect(() => {
    if (isDragging && currentOffset) {
      const time = calculateDropTime(currentOffset.y);
      setDropTime(time);
    }
  }, [isDragging, currentOffset]);

  if (!isDragging || itemType !== 'calendar-event' || !currentOffset) {
    return null;
  }

  const event = item?.originalEvent as CalendarEvent;
  if (!event) return null;

  const eventColor = getEventColor(event.eventType);
  const startTime = format(new Date(event.start), 'HH:mm');
  const endTime = format(new Date(event.end), 'HH:mm');
  
  // Calculate event duration in minutes
  const eventStart = new Date(event.start);
  const eventEnd = new Date(event.end);
  const durationMinutes = Math.floor((eventEnd.getTime() - eventStart.getTime()) / (1000 * 60));
  
  const formatTime = (hour: string, minute: number) => {
    const hourNum = parseInt(hour);
    // Handle hours beyond 23 (next day hours)
    const displayHour = hourNum >= 24 ? hourNum - 24 : hourNum;
    const dayIndicator = hourNum >= 24 ? ' +1' : '';
    return `${displayHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}${dayIndicator}`;
  };
  
  const [dropHours, dropMinutes] = dropTime.split(':').map(Number);
  
  // Calculate end time properly handling hour overflow
  let endHour = dropHours;
  let endMinute = dropMinutes + durationMinutes;
  
  // Handle minute overflow
  if (endMinute >= 60) {
    endHour += Math.floor(endMinute / 60);
    endMinute = endMinute % 60;
  }
  
  const dropEndTime = dropTime ? formatTime(String(endHour), endMinute) : endTime;

  if (!isDragging || itemType !== 'calendar-event' || !currentOffset) {
    return null;
  }

  // Render clock in a portal to bypass all stacking contexts
  return ReactDOM.createPortal(
    <>
      {/* Ultra-Minimal Clock Popup - In Portal for Maximum Z-Index */}
      <div
        style={{
          position: 'fixed',
          pointerEvents: 'none',
          zIndex: 999999,
          left: currentOffset.x + 10,
          top: currentOffset.y - 30,
        }}
      >
        <div 
          style={{
            backgroundColor: 'hsl(var(--primary))',
            color: 'hsl(var(--primary-foreground))',
            borderRadius: '4px',
            padding: '2px 6px',
            fontSize: '11px',
            fontWeight: '600',
            fontFamily: 'monospace',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            border: '1px solid hsl(var(--primary) / 0.3)',
          }}
        >
          {dropTime}
        </div>
      </div>

      {/* Event Preview */}
      <div
        style={{
          position: 'fixed',
          pointerEvents: 'none',
          zIndex: 9998,
          left: 0,
          top: 0,
          transform: `translate(${currentOffset.x}px, ${currentOffset.y}px)`,
        }}
      >
        <div
          className="custom-event dragging-preview"
          style={{
            backgroundColor: eventColor,
            opacity: 0.8,
            borderRadius: '4px',
            padding: '4px 8px',
            minWidth: '120px',
            minHeight: '30px',
            border: '2px dashed #3b82f6',
            transform: 'rotate(2deg)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            cursor: 'grabbing',
          }}
        >
          <div className="event-content">
            <div className="event-title" style={{ fontSize: '12px', fontWeight: 'bold', color: '#000000' }}>
              {event.title}
            </div>
            <div className="event-time" style={{ fontSize: '10px', color: '#000000' }}>
              {startTime} - {endTime}
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

export default DragLayer;
