
import React from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isToday, isSameDay } from 'date-fns';
import { StaffCalendarEvent } from '@/services/staffCalendarService';

interface CleanCalendarGridProps {
  currentDate: Date;
  events: StaffCalendarEvent[];
  selectedClients: string[];
  onDateClick?: (date: Date) => void;
}

const CleanCalendarGrid: React.FC<CleanCalendarGridProps> = ({
  currentDate,
  events,
  selectedClients,
  onDateClick
}) => {
  // Generate calendar days
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  
  const calendarDays = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd
  });

  // Filter events by selected clients and get events for specific date
  const getEventsForDate = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return events.filter(event => {
      const eventDate = format(new Date(event.start), 'yyyy-MM-dd');
      
      // Client filtering logic
      let clientMatch = true;
      if (selectedClients.length > 0) {
        // Check if event has client info (for booking events)
        if (event.client) {
          clientMatch = selectedClients.some(selectedClient => 
            event.client?.toLowerCase().includes(selectedClient.toLowerCase())
          );
        } else {
          // For assignment events without specific client, show if any client is selected
          // This ensures staff assignments are visible when filtering by client
          clientMatch = true;
        }
      }
      
      return eventDate === dateStr && clientMatch;
    });
  };

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      {/* Calendar Header */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {weekDays.map(day => (
          <div key={day} className="p-3 text-center text-sm font-medium text-gray-500 bg-gray-50">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Body */}
      <div className="grid grid-cols-7">
        {calendarDays.map(date => {
          const dayEvents = getEventsForDate(date);
          const isCurrentMonth = isSameMonth(date, currentDate);
          const isTodayDate = isToday(date);
          
          // Only show booking events (actual jobs/bookings)
          const bookingEvents = dayEvents.filter(event => event.eventType === 'booking_event');
          
          return (
            <div
              key={date.toISOString()}
              className={`
                min-h-[100px] p-2 border-b border-r border-gray-100 cursor-pointer hover:bg-gray-50
                ${!isCurrentMonth ? 'bg-gray-50 text-gray-400' : ''}
                ${isTodayDate ? 'bg-blue-50' : ''}
              `}
              onClick={() => onDateClick?.(date)}
            >
              <div className={`
                text-sm font-medium mb-1
                ${isTodayDate ? 'text-blue-600' : isCurrentMonth ? 'text-gray-900' : 'text-gray-400'}
              `}>
                {format(date, 'd')}
              </div>
              
              {/* Display booking events (actual jobs assigned to the team) */}
              <div className="space-y-1">
                {bookingEvents.slice(0, 3).map((event) => (
                  <div
                    key={event.id}
                    className="text-xs px-2 py-1 rounded text-white truncate bg-green-600"
                    title={`${event.client || 'Unknown Client'} - Team ${event.teamId} - Booking ID: ${event.bookingId}`}
                  >
                    {event.client || 'Booking'}
                  </div>
                ))}
                
                {bookingEvents.length > 3 && (
                  <div className="text-xs text-gray-500 px-2">
                    +{bookingEvents.length - 3} more bookings
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

export default CleanCalendarGrid;
