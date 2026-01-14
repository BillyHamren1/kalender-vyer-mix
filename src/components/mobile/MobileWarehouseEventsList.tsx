
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarEvent } from '@/components/Calendar/ResourceData';
import { format, parseISO, isWithinInterval, addDays, startOfDay } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Clock, MapPin } from 'lucide-react';

interface MobileWarehouseEventsListProps {
  events: CalendarEvent[];
  weekStart: Date;
}

// Helper to get event color based on type
const getEventColor = (eventType?: string): string => {
  switch (eventType) {
    case 'rig':
      return 'bg-blue-500/20 border-blue-500';
    case 'event':
      return 'bg-green-500/20 border-green-500';
    case 'rigdown':
      return 'bg-orange-500/20 border-orange-500';
    default:
      return 'bg-primary/20 border-primary';
  }
};

// Helper to get event type label
const getEventLabel = (eventType?: string): string => {
  switch (eventType) {
    case 'rig':
      return 'Rigg';
    case 'event':
      return 'Event';
    case 'rigdown':
      return 'Nedmontering';
    default:
      return 'Bokning';
  }
};

const MobileWarehouseEventsList: React.FC<MobileWarehouseEventsListProps> = ({ events, weekStart }) => {
  const navigate = useNavigate();
  
  // Parse event date safely
  const parseEventDate = (dateStr: string): Date => {
    return parseISO(dateStr);
  };
  
  // Filter events for the current week
  const weekEnd = addDays(weekStart, 6);
  const weekEvents = events.filter(event => {
    try {
      const eventStart = startOfDay(parseEventDate(event.start));
      return isWithinInterval(eventStart, { 
        start: startOfDay(weekStart), 
        end: startOfDay(weekEnd) 
      });
    } catch {
      return false;
    }
  });

  // Sort events by start time
  const sortedEvents = [...weekEvents].sort((a, b) => {
    const dateA = parseEventDate(a.start);
    const dateB = parseEventDate(b.start);
    return dateA.getTime() - dateB.getTime();
  });

  const handleEventClick = (event: CalendarEvent) => {
    if (event.bookingId) {
      navigate(`/booking/${event.bookingId}`);
    }
  };

  if (sortedEvents.length === 0) {
    return (
      <div className="bg-card rounded-3xl shadow-elevated p-6 text-center">
        <p className="text-muted-foreground">Inga händelser denna vecka</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sortedEvents.map((event) => {
        const eventDate = parseEventDate(event.start);
        const eventType = event.eventType;
        
        return (
          <div
            key={event.id}
            onClick={() => handleEventClick(event)}
            className={`
              bg-card rounded-2xl shadow-elevated p-4 border-l-4 cursor-pointer
              transition-all duration-200 active:scale-[0.98]
              ${getEventColor(eventType)}
            `}
          >
            {/* Date Badge */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase">
                {format(eventDate, 'EEEE d MMM', { locale: sv })}
              </span>
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-muted">
                {getEventLabel(eventType)}
              </span>
            </div>
            
            {/* Event Title */}
            <h3 className="font-semibold text-foreground mb-2 line-clamp-2">
              {event.title}
            </h3>
            
            {/* Time */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              <span>{format(eventDate, 'HH:mm')}</span>
            </div>
            
            {/* Location if available */}
            {event.deliveryAddress && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span className="line-clamp-1">{event.deliveryAddress}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default MobileWarehouseEventsList;
