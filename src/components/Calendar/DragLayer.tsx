
import React, { useState, useEffect } from 'react';
import { useDragLayer } from 'react-dnd';
import { CalendarEvent, getEventColor } from './ResourceData';
import { format, addMinutes } from 'date-fns';

// Calculate drop time based on mouse position with collapsible early and late hours support
const calculateDropTime = (mouseY: number): string => {
  // Find the time grid elements - look for the actual .time-slots-grid containers
  const timeGrids = document.querySelectorAll('.time-slots-grid');
  
  // Check if early hours and late hours are expanded by looking for expanded collapsible content
  const collapsibleContents = document.querySelectorAll('[data-state="open"]');
  
  // Determine which sections are expanded
  let isEarlyHoursExpanded = false;
  let isLateHoursExpanded = false;
  
  collapsibleContents.forEach(content => {
    const parent = content.closest('.time-labels-column');
    if (parent) {
      const trigger = parent.querySelector('.early-hours-trigger');
      if (trigger) isEarlyHoursExpanded = true;
      const lateTrigger = parent.querySelector('.late-hours-trigger');
      if (lateTrigger) isLateHoursExpanded = true;
    }
  });
  
  for (const grid of Array.from(timeGrids)) {
    const rect = grid.getBoundingClientRect();
    
    // Check if mouse is within this grid's vertical bounds
    if (mouseY >= rect.top && mouseY <= rect.bottom) {
      const relativeY = mouseY - rect.top;
      
      // Calendar starts at 00:00 if expanded, 05:00 if collapsed
      // Account for the 36px trigger button height when calculating
      const triggerHeight = 36; // 32px button + 4px margin
      let adjustedY = relativeY - triggerHeight;
      
      const startHour = isEarlyHoursExpanded ? 0 : 5;
      const pixelsPerHour = 25;
      const pixelsPerMinute = pixelsPerHour / 60;
      
      // Calculate total minutes from the start
      const minutesFromStart = Math.max(0, adjustedY) / pixelsPerMinute;
      const totalMinutes = startHour * 60 + minutesFromStart;
      
      // Round to nearest 5-minute interval
      const roundedMinutes = Math.round(totalMinutes / 5) * 5;
      let hours = Math.floor(roundedMinutes / 60);
      const minutes = roundedMinutes % 60;
      
      // Extended range: 0:00 - 28:55 (04:55 next day) when late hours are expanded
      const maxHours = isLateHoursExpanded ? 28 : 23;
      const clampedHours = Math.max(0, Math.min(maxHours, hours));
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
