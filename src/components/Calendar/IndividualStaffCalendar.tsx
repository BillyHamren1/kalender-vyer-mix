
import React, { useEffect, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import resourceDayGridPlugin from '@fullcalendar/resource-daygrid';
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
  const [calendarHeight, setCalendarHeight] = useState('auto');

  // Calculate calendar height based on number of staff and view mode
  useEffect(() => {
    if (viewMode === 'month') {
      const baseHeight = 800;
      const staffCount = Math.max(1, staffResources.length);
      const calculatedHeight = Math.min(baseHeight + (staffCount * 40), 1200);
      setCalendarHeight(`${calculatedHeight}px`);
    } else {
      const baseHeight = 600;
      const staffCount = Math.max(1, staffResources.length);
      const calculatedHeight = Math.min(baseHeight + (staffCount * 60), 1000);
      setCalendarHeight(`${calculatedHeight}px`);
    }
  }, [staffResources.length, viewMode]);

  // Handle navigation
  const handleDatesSet = (dateInfo: any) => {
    if (Math.abs(dateInfo.start.getTime() - currentDate.getTime()) > 3600000) {
      onDateChange(dateInfo.start);
    }
  };

  // Event click handler
  const handleEventClick = (clickInfo: any) => {
    const event = clickInfo.event;
    const staffResource = staffResources.find(s => s.id === event.getResources()[0]?.id);
    
    console.log('Staff Calendar Event Clicked:', {
      title: event.title,
      staff: staffResource?.name,
      date: format(event.start, 'yyyy-MM-dd'),
      details: event.extendedProps
    });
  };

  // Get calendar view based on mode
  const getCalendarView = () => {
    if (viewMode === 'month') {
      return staffResources.length > 0 ? 'resourceDayGridMonth' : 'dayGridMonth';
    }
    return 'dayGridMonth'; // Default to month view for this calendar
  };

  // Format events for FullCalendar
  const formattedEvents = events.map(event => ({
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    resourceId: event.resourceId,
    backgroundColor: event.backgroundColor,
    borderColor: event.borderColor,
    extendedProps: {
      teamId: event.teamId,
      teamName: event.teamName,
      bookingId: event.bookingId,
      eventType: event.eventType
    }
  }));

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
          plugins={[resourceDayGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView={getCalendarView()}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth'
          }}
          height={calendarHeight}
          resources={staffResources.length > 0 ? staffResources : []}
          events={formattedEvents}
          resourceAreaWidth="150px"
          resourceAreaHeaderContent="Staff Members"
          resourceLabelContent="Staff"
          nowIndicator={true}
          weekends={true}
          initialDate={currentDate}
          datesSet={handleDatesSet}
          eventClick={handleEventClick}
          resourceOrder="title"
          resourceAreaColumns={staffResources.length > 0 ? [
            {
              field: 'title',
              headerContent: 'Staff Member'
            }
          ] : []}
          eventContent={(renderInfo) => {
            const { event } = renderInfo;
            const props = event.extendedProps;
            
            return (
              <div className="fc-event-main-frame">
                <div className="fc-event-title-container">
                  <div className="fc-event-title fc-sticky text-xs">
                    {event.title}
                  </div>
                  {props.eventType === 'booking_event' && (
                    <div className="text-xs opacity-75">
                      {props.teamName ? `Team: ${props.teamName}` : ''}
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
          firstDay={1} // Start week on Monday
        />
      </div>
      
      <style>{`
        .staff-calendar-container {
          position: relative;
        }
        
        .fc-daygrid-event {
          margin: 1px;
          padding: 1px 3px;
          border-radius: 3px;
          font-size: 11px;
        }
        
        .fc-event-title {
          font-weight: 500;
          line-height: 1.2;
        }
        
        .fc-resource-area-header {
          background-color: #f1f5f9;
          font-weight: 600;
        }
        
        .fc-resource-cell {
          border-right: 1px solid #e2e8f0;
          background-color: #fafafa;
        }
        
        .fc-day-today {
          background-color: #fef3c7 !important;
        }
        
        .fc-daygrid-day-number {
          font-weight: 600;
        }
        
        .fc-col-header-cell {
          background-color: #f8fafc;
        }
        
        .fc-more-link {
          color: #3b82f6;
          font-size: 10px;
        }
      `}</style>
    </div>
  );
};

export default IndividualStaffCalendar;
