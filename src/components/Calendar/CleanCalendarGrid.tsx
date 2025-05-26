
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
    
    console.log(`CleanCalendarGrid: Getting events for date ${dateStr} from ${events.length} total events`);
    
    const matchingEvents = events.filter(event => {
      // Extract date from event start time (format: YYYY-MM-DDTHH:mm:ss)
      const eventDate = event.start.split('T')[0]; // Get just the date part
      
      const dateMatch = eventDate === dateStr;
      
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
      
      const matches = dateMatch && clientMatch;
      if (matches) {
        console.log(`CleanCalendarGrid: Event ${event.title} matches date ${dateStr}, type: ${event.eventType}, staff: ${event.staffName}`);
      }
      
      return matches;
    });
    
    console.log(`CleanCalendarGrid: Found ${matchingEvents.length} events for ${dateStr}:`, 
      matchingEvents.map(e => ({ 
        title: e.title, 
        type: e.eventType, 
        client: e.client, 
        staff: e.staffName,
        bookingId: e.bookingId 
      }))
    );
    return matchingEvents;
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
          
          // Separate booking events from assignment events with enhanced logic
          const bookingEvents = dayEvents.filter(event => event.eventType === 'booking_event');
          const assignmentEvents = dayEvents.filter(event => event.eventType === 'assignment');
          
          // Group booking events by staff to show staff assignments clearly
          const staffBookingGroups = bookingEvents.reduce((acc, event) => {
            if (!event.staffName) return acc;
            
            if (!acc[event.staffName]) {
              acc[event.staffName] = [];
            }
            acc[event.staffName].push(event);
            return acc;
          }, {} as Record<string, typeof bookingEvents>);
          
          return (
            <div
              key={date.toISOString()}
              className={`
                min-h-[120px] p-2 border-b border-r border-gray-100 cursor-pointer hover:bg-gray-50
                ${!isCurrentMonth ? 'bg-gray-50 text-gray-400' : ''}
                ${isTodayDate ? 'bg-blue-50' : ''}
              `}
              onClick={() => onDateClick?.(date)}
            >
              <div className={`
                text-sm font-medium mb-2
                ${isTodayDate ? 'text-blue-600' : isCurrentMonth ? 'text-gray-900' : 'text-gray-400'}
              `}>
                {format(date, 'd')}
              </div>
              
              {/* Display staff-booking assignments */}
              <div className="space-y-1">
                {Object.entries(staffBookingGroups).slice(0, 3).map(([staffName, staffEvents]) => (
                  <div
                    key={staffName}
                    className="text-xs px-2 py-1 rounded text-white bg-green-600"
                    title={`${staffName} - ${staffEvents.length} booking(s): ${staffEvents.map(e => e.client || e.title).join(', ')}`}
                  >
                    <div className="font-medium truncate">{staffName}</div>
                    <div className="text-xs opacity-90 truncate">
                      {staffEvents.length} booking{staffEvents.length > 1 ? 's' : ''}
                      {staffEvents.length === 1 && staffEvents[0].client && `: ${staffEvents[0].client}`}
                    </div>
                  </div>
                ))}
                
                {/* Show assignment indicator only if staff is assigned but no specific bookings */}
                {assignmentEvents.length > 0 && bookingEvents.length === 0 && (
                  <div
                    className="text-xs px-2 py-1 rounded text-white bg-blue-500"
                    title={`${assignmentEvents.map(e => e.staffName).join(', ')} assigned to teams but no specific bookings`}
                  >
                    <div className="font-medium">Team Assignment</div>
                    <div className="text-xs opacity-90">
                      {assignmentEvents.length} staff member{assignmentEvents.length > 1 ? 's' : ''}
                    </div>
                  </div>
                )}
                
                {/* Show overflow indicator */}
                {Object.keys(staffBookingGroups).length > 3 && (
                  <div className="text-xs text-gray-500 px-2 py-1 bg-gray-100 rounded">
                    +{Object.keys(staffBookingGroups).length - 3} more staff
                  </div>
                )}
                
                {/* Show total booking count if many bookings */}
                {bookingEvents.length > Object.keys(staffBookingGroups).length && (
                  <div className="text-xs text-gray-500 px-2">
                    Total: {bookingEvents.length} booking{bookingEvents.length > 1 ? 's' : ''}
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
