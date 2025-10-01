
import React, { useState, useEffect } from 'react';
import { useDragLayer } from 'react-dnd';
import { CalendarEvent, getEventColor } from './ResourceData';
import { format, addMinutes } from 'date-fns';

// Calculate drop time based on mouse position with continuous 24-hour grid
const calculateDropTime = (mouseY: number): string => {
  // Find the time grid elements
  const timeGrids = document.querySelectorAll('.time-slots-grid');
  
  for (const grid of Array.from(timeGrids)) {
    const rect = grid.getBoundingClientRect();
    
    // Check if mouse is within this grid's vertical bounds
    if (mouseY >= rect.top && mouseY <= rect.bottom) {
      const relativeY = mouseY - rect.top;
      
      // Calendar starts at 05:00
      const startHour = 5;
      const pixelsPerHour = 25;
      const pixelsPerMinute = pixelsPerHour / 60;
      
      // Calculate total minutes from the start
      const minutesFromStart = Math.max(0, relativeY) / pixelsPerMinute;
      const totalMinutes = startHour * 60 + minutesFromStart;
      
      // Round to nearest 5-minute interval
      const roundedMinutes = Math.round(totalMinutes / 5) * 5;
      let hours = Math.floor(roundedMinutes / 60);
      const minutes = roundedMinutes % 60;
      
      // Extended range up to 28:55 (04:55 next day)
      const maxHours = 28;
      const clampedHours = Math.max(5, Math.min(maxHours, hours));
      const clampedMinutes = clampedHours === maxHours ? Math.min(55, minutes) : minutes;
      
      return `${clampedHours.toString().padStart(2, '0')}:${clampedMinutes.toString().padStart(2, '0')}`;
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
