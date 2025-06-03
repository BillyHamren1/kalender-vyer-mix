
import React from 'react';
import { useDragLayer } from 'react-dnd';
import { CalendarEvent, getEventColor } from './ResourceData';
import { format } from 'date-fns';

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

  if (!isDragging || itemType !== 'calendar-event' || !currentOffset) {
    return null;
  }

  const event = item?.originalEvent as CalendarEvent;
  if (!event) return null;

  const eventColor = getEventColor(event.eventType);
  const startTime = format(new Date(event.start), 'HH:mm');
  const endTime = format(new Date(event.end), 'HH:mm');

  return (
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
  );
};

export default DragLayer;
