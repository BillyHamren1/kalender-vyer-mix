
import React, { useEffect, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { StaffCalendarEvent, StaffResource } from '@/services/staffCalendarService';
import { format } from 'date-fns';

interface IndividualStaffCalendarProps {
  events: StaffCalendarEvent[];
  staffResources: StaffResource[];
  currentDate: Date;
  viewMode: 'day' | 'week' | 'month';
  onDateChange: (date: Date) => void;
  isLoading?: boolean;
}

const IndividualStaffCalendar: React.FC<IndividualStaffCalendarProps> = ({
  events,
  staffResources,
  currentDate,
  viewMode,
  onDateChange,
  isLoading = false
}) => {
  const calendarRef = useRef<FullCalendar>(null);

  // Update FullCalendar when currentDate changes from parent
  useEffect(() => {
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      console.log('IndividualStaffCalendar: Updating calendar to date:', format(currentDate, 'yyyy-MM-dd'));
      calendarApi.gotoDate(currentDate);
    }
  }, [currentDate]);

  // Handle user navigation in the calendar
  const handleDatesSet = (dateInfo: any) => {
    const newDate = dateInfo.start;
    const newMonth = format(newDate, 'yyyy-MM');
    const currentMonth = format(currentDate, 'yyyy-MM');
    
    // Only trigger onDateChange if the user navigated to a different month
    if (newMonth !== currentMonth) {
      console.log('IndividualStaffCalendar: User navigated to month:', newMonth);
      onDateChange(newDate);
    }
  };

  // Event click handler
  const handleEventClick = (clickInfo: any) => {
    const event = clickInfo.event;
    
    console.log('Staff Calendar Event Clicked:', {
      title: event.title,
      staff: event.extendedProps.staffName,
      date: format(event.start, 'yyyy-MM-dd'),
      details: event.extendedProps
    });
  };

  // Format events for FullCalendar - SIMPLE monthly view with staff info in title
  const formattedEvents = events.map(event => {
    console.log('Formatting event:', event.title, 'for staff:', event.staffName);
    
    return {
      id: event.id,
      title: `${event.staffName}: ${event.title}`,
      start: event.start,
      end: event.end,
      backgroundColor: event.backgroundColor,
      borderColor: event.borderColor,
      textColor: '#000',
      extendedProps: {
        teamId: event.teamId,
        teamName: event.teamName,
        bookingId: event.bookingId,
        eventType: event.eventType,
        staffName: event.staffName
      }
    };
  });

  console.log('Formatted events for calendar:', formattedEvents);
  console.log('Staff resources:', staffResources);
  console.log('Current date prop:', format(currentDate, 'yyyy-MM-dd'));

  return (
    <div className="staff-calendar-container relative">
      {isLoading && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-600">Loading staff schedules...</p>
          </div>
        </div>
      )}
      
      <div className="relative">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={false}
          height="600px"
          events={formattedEvents}
          nowIndicator={true}
          weekends={true}
          initialDate={currentDate}
          datesSet={handleDatesSet}
          eventClick={handleEventClick}
          eventContent={(renderInfo) => {
            const { event } = renderInfo;
            const props = event.extendedProps;
            
            return (
              <div className="fc-event-main-frame p-1">
                <div className="fc-event-title-container">
                  <div className="fc-event-title text-xs font-medium">
                    {event.title}
                  </div>
                  {props.eventType === 'booking_event' && props.teamName && (
                    <div className="text-xs opacity-75 mt-1">
                      Team: {props.teamName}
                    </div>
                  )}
                </div>
              </div>
            );
          }}
          dayMaxEvents={3}
          moreLinkClick="popover"
          fixedWeekCount={false}
          showNonCurrentDates={true}
          firstDay={1}
          eventDisplay="block"
          displayEventTime={false}
        />
      </div>
      
      <style>{`
        .staff-calendar-container {
          position: relative;
        }
        
        .fc-daygrid-event {
          margin: 1px;
          padding: 2px 4px;
          border-radius: 3px;
          font-size: 11px;
          line-height: 1.2;
        }
        
        .fc-event-title {
          font-weight: 500;
        }
        
        .fc-day-today {
          background-color: #fef3c7 !important;
        }
        
        .fc-daygrid-day-number {
          font-weight: 600;
          padding: 4px;
        }
        
        .fc-col-header-cell {
          background-color: #f8fafc;
          font-weight: 600;
        }
        
        .fc-more-link {
          color: #3b82f6;
          font-size: 10px;
        }
        
        .fc-daygrid-day-frame {
          min-height: 100px;
        }
        
        .fc-daygrid-day-events {
          margin-top: 2px;
        }
        
        .fc-event-main {
          padding: 1px 2px;
        }
      `}</style>
    </div>
  );
};

export default IndividualStaffCalendar;
