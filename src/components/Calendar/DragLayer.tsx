
import React, { useState, useEffect } from 'react';
import { useDragLayer } from 'react-dnd';
import { CalendarEvent, getEventColor } from './ResourceData';
import { format, addMinutes } from 'date-fns';

// Calculate drop time based on mouse position
const calculateDropTime = (mouseY: number): string => {
  // Find the closest time grid element to calculate relative position
  const timeGrids = document.querySelectorAll('.time-slots-container, .droppable-time-slot');
  
  for (const grid of Array.from(timeGrids)) {
    const rect = grid.getBoundingClientRect();
    
    // Check if mouse is over this grid
    if (mouseY >= rect.top && mouseY <= rect.bottom) {
      const relativeY = mouseY - rect.top;
      
      // Calendar starts at 5 AM, 25px per hour, 5-minute intervals
      const startHour = 5;
      const pixelsPerHour = 25;
      const pixelsPerMinute = pixelsPerHour / 60;
      
      // Calculate hours and minutes from position
      const totalMinutes = Math.floor(relativeY / pixelsPerMinute);
      const roundedMinutes = Math.round(totalMinutes / 5) * 5; // Round to 5-minute intervals
      
      const hours = Math.floor(roundedMinutes / 60) + startHour;
      const minutes = roundedMinutes % 60;
      
      // Clamp to valid range (5 AM - 11 PM)
      const clampedHours = Math.max(5, Math.min(23, hours));
      
      return `${String(clampedHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }
  
  // Default fallback
  return format(new Date(), 'HH:mm');
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
  
  // Calculate end time based on drop time
  const [dropHours, dropMinutes] = dropTime.split(':').map(Number);
  const dropEndTime = dropTime ? format(
    addMinutes(new Date().setHours(dropHours, dropMinutes, 0, 0), durationMinutes),
    'HH:mm'
  ) : endTime;

  return (
    <>
      {/* Digital Clock Popup */}
      <div
        style={{
          position: 'fixed',
          pointerEvents: 'none',
          zIndex: 150,
          left: currentOffset.x + 20,
          top: currentOffset.y - 60,
        }}
      >
        <div className="bg-primary text-primary-foreground rounded-lg shadow-lg px-4 py-3 border-2 border-primary/20">
          <div className="text-xs font-medium opacity-80 mb-1">Drop Time</div>
          <div className="text-2xl font-bold font-mono tracking-wider">
            {dropTime}
          </div>
          <div className="text-xs font-medium opacity-80 mt-1">
            {dropEndTime && `to ${dropEndTime}`}
          </div>
        </div>
      </div>

      {/* Event Preview */}
      <div
        style={{
          position: 'fixed',
          pointerEvents: 'none',
          zIndex: 100,
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
    </>
  );
};

export default DragLayer;
