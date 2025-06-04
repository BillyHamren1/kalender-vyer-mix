
import React from 'react';
import { useDragLayer } from 'react-dnd';
import { CalendarEvent, getEventColor } from './ResourceData';
import { format } from 'date-fns';
import { ArrowUp, ArrowDown } from 'lucide-react';

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
          opacity: 0.9,
          borderRadius: '6px',
          padding: '6px 10px',
          minWidth: '140px',
          minHeight: '35px',
          border: '2px solid #3b82f6',
          transform: 'rotate(1deg)',
          boxShadow: '0 6px 20px rgba(0, 0, 0, 0.25)',
          cursor: 'grabbing',
          position: 'relative',
        }}
      >
        <div className="event-content">
          <div className="event-title" style={{ fontSize: '13px', fontWeight: 'bold', color: '#000000' }}>
            {event.title}
          </div>
          <div className="event-time" style={{ fontSize: '11px', color: '#000000', marginBottom: '2px' }}>
            {startTime} - {endTime}
          </div>
        </div>
        
        {/* Bidirectional drag indicators */}
        <div 
          style={{
            position: 'absolute',
            right: '4px',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            opacity: 0.7
          }}
        >
          <ArrowUp className="h-3 w-3 text-blue-600" />
          <ArrowDown className="h-3 w-3 text-blue-600" />
        </div>
      </div>
    </div>
  );
};

export default DragLayer;
