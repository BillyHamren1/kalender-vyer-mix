import React from 'react';
import { CalendarEvent, getEventColor } from './ResourceData';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, startOfWeek, endOfWeek } from 'date-fns';
import { sv } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface SimpleMonthlyCalendarProps {
  events: CalendarEvent[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onDayClick: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
  showHeader?: boolean;
}

const SimpleMonthlyCalendar: React.FC<SimpleMonthlyCalendarProps> = ({
  events,
  currentDate,
  onDateChange,
  onDayClick,
  onEventClick,
  showHeader = true,
}) => {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  // Group events by date
  const eventsByDate = events.reduce((acc, event) => {
    const dateKey = typeof event.start === 'string'
      ? event.start.slice(0, 10)
      : format(new Date(event.start as Date), 'yyyy-MM-dd');
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(event);
    return acc;
  }, {} as Record<string, CalendarEvent[]>);

  // getEventColor imported from ResourceData

  const goToPreviousMonth = () => {
    const prevMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    onDateChange(prevMonth);
  };

  const goToNextMonth = () => {
    const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    onDateChange(nextMonth);
  };

  return (
    <div className="h-full overflow-auto bg-background rounded-lg border border-border">
      {/* Month Header */}
      {showHeader && <div className="flex items-center justify-between p-4 border-b border-border">
        <button
          onClick={goToPreviousMonth}
          className="p-2 hover:bg-muted rounded-lg transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        
        <h2 className="text-2xl font-bold text-foreground capitalize">
          {format(currentDate, 'MMMM yyyy', { locale: sv })}
        </h2>
        
        <button
          onClick={goToNextMonth}
          className="p-2 hover:bg-muted rounded-lg transition-colors"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>}

      {/* Days of Week Header */}
      <div className="sticky top-0 z-20 grid grid-cols-7 border-b border-border bg-muted/95 backdrop-blur">
        {['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'].map(day => (
          <div key={day} className="p-3 text-center text-sm font-semibold text-muted-foreground">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7">
        {days.map(day => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayEvents = eventsByDate[dateKey] || [];
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isTodayDate = isToday(day);

          return (
            <div
              key={dateKey}
              onClick={() => onDayClick(day)}
              className={`
                min-h-[128px] p-2 border-b border-r border-border cursor-pointer
                hover:bg-muted/50 transition-colors
                ${!isCurrentMonth ? 'bg-muted/20 text-muted-foreground' : ''}
                ${isTodayDate ? 'bg-primary/5 border-primary/20' : ''}
              `}
            >
              {/* Day Number */}
              <div className={`
                text-sm font-semibold mb-2
                ${isTodayDate ? 'text-primary bg-primary/10 w-7 h-7 rounded-full flex items-center justify-center' : ''}
                ${!isCurrentMonth ? 'opacity-50' : ''}
              `}>
                {format(day, 'd')}
              </div>

              {/* Events */}
              <div className="space-y-1">
                {dayEvents.slice(0, 4).map((event, index) => (
                  <button
                    type="button"
                    key={`${event.id}-${index}`}
                    className="block w-full text-left text-xs px-2 py-1.5 rounded-md truncate font-medium shadow-sm hover:-translate-y-px hover:shadow transition"
                    style={{
                      backgroundColor: getEventColor(event.eventType || 'event'),
                      color: '#333'
                    }}
                    title={`${event.title} - ${event.extendedProps?.client || 'Unknown Client'}`}
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      onEventClick?.(event);
                    }}
                  >
                    <span className="font-semibold">{event.title}</span>
                    {event.extendedProps?.client && event.extendedProps.client !== event.title && (
                      <span className="ml-1 opacity-70">· {event.extendedProps.client}</span>
                    )}
                  </button>
                ))}
                
                {/* Show "more" indicator if there are more than 4 events */}
                {dayEvents.length > 4 && (
                  <div className="text-xs text-muted-foreground font-semibold pl-2">
                    +{dayEvents.length - 4} till
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SimpleMonthlyCalendar;
