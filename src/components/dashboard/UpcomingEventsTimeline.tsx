import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, addDays, startOfDay, isSameDay } from "date-fns";
import { sv } from "date-fns/locale";
import { UpcomingEvent } from "@/services/dashboardService";

interface UpcomingEventsTimelineProps {
  events: UpcomingEvent[];
  isLoading: boolean;
}

const getEventTypeStyle = (eventType: string | null) => {
  switch (eventType) {
    case 'rigg':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'event':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'riggdown':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
};

const getEventTypeLabel = (eventType: string | null) => {
  switch (eventType) {
    case 'rigg':
      return 'RIGG';
    case 'event':
      return 'EVENT';
    case 'riggdown':
      return 'NEDM';
    default:
      return 'JOBB';
  }
};

export const UpcomingEventsTimeline: React.FC<UpcomingEventsTimelineProps> = ({ 
  events, 
  isLoading 
}) => {
  const navigate = useNavigate();
  const today = startOfDay(new Date());
  
  // Generate 7 days array
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  // Group events by day
  const eventsByDay = days.map(day => ({
    date: day,
    events: events.filter(event => isSameDay(event.startTime, day))
  }));

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Kommande 7 dagar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="min-w-[120px] animate-pulse">
                <div className="h-6 bg-muted rounded mb-2" />
                <div className="h-24 bg-muted/50 rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Kommande 7 dagar
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {eventsByDay.map(({ date, events: dayEvents }) => {
            const isToday = isSameDay(date, today);
            
            return (
              <div 
                key={date.toISOString()} 
                className={`min-w-[120px] flex-1 rounded-lg p-2 ${isToday ? 'bg-primary/5 ring-2 ring-primary/20' : ''}`}
              >
                <div className={`text-center mb-2 ${isToday ? 'font-bold text-primary' : ''}`}>
                  <div className="text-xs uppercase text-muted-foreground">
                    {format(date, 'EEE', { locale: sv })}
                  </div>
                  <div className="text-lg font-semibold">
                    {format(date, 'd')}
                  </div>
                </div>
                
                <div className="space-y-1 min-h-[80px]">
                  {dayEvents.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-4">
                      —
                    </div>
                  ) : (
                    dayEvents.slice(0, 3).map(event => (
                      <div
                        key={event.id}
                        className={`p-2 rounded border cursor-pointer transition-all hover:shadow-sm ${getEventTypeStyle(event.eventType)}`}
                        onClick={() => event.bookingId && navigate(`/booking/${event.bookingId}`)}
                      >
                        <Badge variant="secondary" className="text-[10px] mb-1">
                          {getEventTypeLabel(event.eventType)}
                        </Badge>
                        <div className="text-xs font-medium truncate">
                          {event.title}
                        </div>
                        <div className="text-[10px] opacity-75">
                          {format(event.startTime, 'HH:mm')}
                        </div>
                      </div>
                    ))
                  )}
                  {dayEvents.length > 3 && (
                    <div className="text-xs text-center text-muted-foreground">
                      +{dayEvents.length - 3} mer
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
