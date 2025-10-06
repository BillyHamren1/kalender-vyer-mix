
import React from 'react';
import { CalendarEvent } from './ResourceData';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface MobileMonthlyCalendarProps {
  events: CalendarEvent[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onDayClick: (date: Date) => void;
}

const MobileMonthlyCalendar: React.FC<MobileMonthlyCalendarProps> = ({
  events,
  currentDate,
  onDateChange,
  onDayClick
}) => {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Group events by date
  const eventsByDate = events.reduce((acc, event) => {
    const dateKey = format(new Date(event.start), 'yyyy-MM-dd');
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(event);
    return acc;
  }, {} as Record<string, CalendarEvent[]>);

  // Get event color based on type (matching main calendar)
  const getEventColor = (eventType: string) => {
    switch (eventType) {
      case 'rig': return '#F2FCE2';
      case 'event': return '#FEF7CD';
      case 'rigDown': return '#FFDEE2';
      default: return '#E2F5FC';
    }
  };

  const goToPreviousMonth = () => {
    const prevMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    onDateChange(prevMonth);
  };

  const goToNextMonth = () => {
    const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    onDateChange(nextMonth);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* Month Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <button
          onClick={goToPreviousMonth}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        
        <h2 className="text-lg font-semibold">
          {format(currentDate, 'MMMM yyyy')}
        </h2>
        
        <button
          onClick={goToNextMonth}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Days of Week Header */}
      <div className="grid grid-cols-7 border-b">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
          <div key={day} className="p-2 text-center text-sm font-medium text-gray-500">
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
                min-h-[80px] p-1 border-b border-r cursor-pointer hover:bg-gray-50
                ${!isCurrentMonth ? 'text-gray-300 bg-gray-50' : ''}
                ${isTodayDate ? 'bg-blue-50' : ''}
              `}
            >
              {/* Day Number */}
              <div className={`
                text-sm font-medium mb-1
                ${isTodayDate ? 'text-blue-600' : ''}
              `}>
                {format(day, 'd')}
              </div>

              {/* Events */}
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((event, index) => (
                <div
                    key={`${event.id}-${index}`}
                    className="text-xs p-1 rounded truncate"
                    style={{
                      backgroundColor: getEventColor(event.eventType || 'event'),
                      color: '#333'
                    }}
                    title={`${event.title} - ${event.extendedProps?.client || 'Unknown Client'}`}
                  >
                    {event.extendedProps?.client || event.title}
                  </div>
                ))}
                
                {/* Show "more" indicator if there are more than 3 events */}
                {dayEvents.length > 3 && (
                  <div className="text-xs text-gray-500 font-medium">
                    +{dayEvents.length - 3} more
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

export default MobileMonthlyCalendar;
