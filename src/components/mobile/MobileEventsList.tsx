
import React from 'react';
import { format, startOfWeek, endOfWeek, isWithinInterval, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { MapPin, Clock, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CalendarEvent } from '@/components/Calendar/ResourceData';

interface MobileEventsListProps {
  events: CalendarEvent[];
  weekStart: Date;
}

const getEventColor = (eventType?: string): string => {
  switch (eventType) {
    case 'rigg':
      return 'bg-amber-500';
    case 'event':
      return 'bg-primary';
    case 'rigdown':
      return 'bg-rose-500';
    default:
      return 'bg-muted';
  }
};

const getEventLabel = (eventType?: string): string => {
  switch (eventType) {
    case 'rigg':
      return 'Rigg';
    case 'event':
      return 'Event';
    case 'rigdown':
      return 'Nedmontering';
    default:
      return 'Händelse';
  }
};

const MobileEventsList: React.FC<MobileEventsListProps> = ({
  events,
  weekStart
}) => {
  const navigate = useNavigate();
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  
  // Helper to parse date from string
  const parseEventDate = (dateStr: string): Date => {
    return parseISO(dateStr);
  };
  
  // Filter events for the selected week
  const weekEvents = events.filter(event => {
    const eventStart = parseEventDate(event.start);
    return isWithinInterval(eventStart, { start: weekStart, end: weekEnd });
  }).sort((a, b) => {
    const aStart = parseEventDate(a.start);
    const bStart = parseEventDate(b.start);
    return aStart.getTime() - bStart.getTime();
  });

  const handleEventClick = (event: CalendarEvent) => {
    if (event.bookingId) {
      navigate(`/bookings/${event.bookingId}`);
    }
  };

  if (weekEvents.length === 0) {
    return (
      <div className="bg-card rounded-2xl shadow-lg p-6 text-center">
        <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">Inga händelser denna vecka</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {weekEvents.map((event) => {
        const eventStart = parseEventDate(event.start);
        const eventEnd = parseEventDate(event.end);
        const eventType = event.eventType;
        
        return (
          <button
            key={event.id}
            onClick={() => handleEventClick(event)}
            className="w-full bg-card rounded-2xl shadow-lg overflow-hidden text-left transition-all hover:shadow-xl active:scale-[0.98]"
          >
            {/* Color bar at top */}
            <div className={`h-2 ${getEventColor(eventType)}`} />
            
            <div className="p-4">
              {/* Date and type badge */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">
                  {format(eventStart, 'd MMM', { locale: sv })}
                </span>
                <span className={`text-xs px-2 py-1 rounded-full text-white ${getEventColor(eventType)}`}>
                  {getEventLabel(eventType)}
                </span>
              </div>
              
              {/* Title */}
              <h3 className="font-semibold text-foreground mb-2 line-clamp-2">
                {event.title}
              </h3>
              
              {/* Time */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Clock className="h-4 w-4" />
                <span>
                  {format(eventStart, 'HH:mm')} - {format(eventEnd, 'HH:mm')}
                </span>
              </div>
              
              {/* Address */}
              {event.deliveryAddress && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span className="line-clamp-1">{event.deliveryAddress}</span>
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default MobileEventsList;
