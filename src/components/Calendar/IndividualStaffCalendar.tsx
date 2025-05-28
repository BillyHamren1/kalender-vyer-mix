
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
  const [isProgrammaticChange, setIsProgrammaticChange] = useState(false);
  const lastParentDateRef = useRef<Date>(currentDate);

  // FIXED: Force calendar to show correct date on component mount
  useEffect(() => {
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      console.log('IndividualStaffCalendar: Force updating calendar to current date on mount:', format(currentDate, 'yyyy-MM-dd'));
      setIsProgrammaticChange(true);
      calendarApi.gotoDate(currentDate);
      setTimeout(() => setIsProgrammaticChange(false), 100);
    }
  }, []); // Run once on mount

  // Calculate calendar height based on view mode
  useEffect(() => {
    if (viewMode === 'month') {
      // For monthly view, use a height that accommodates the full month grid
      setCalendarHeight('600px');
    } else {
      const baseHeight = 700;
      const staffCount = Math.max(1, staffResources.length);
      const calculatedHeight = Math.min(baseHeight + (staffCount * 80), 1200);
      setCalendarHeight(`${calculatedHeight}px`);
    }
  }, [staffResources.length, viewMode]);

  // Update FullCalendar when currentDate changes from parent
  useEffect(() => {
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      const currentCalendarDate = calendarApi.getDate();
      
      // Only update calendar if the month is different
      const currentMonth = format(currentDate, 'yyyy-MM');
      const calendarMonth = format(currentCalendarDate, 'yyyy-MM');
      
      if (currentMonth !== calendarMonth) {
        console.log('IndividualStaffCalendar: Programmatically updating calendar to month:', currentMonth);
        setIsProgrammaticChange(true);
        calendarApi.gotoDate(currentDate);
        lastParentDateRef.current = currentDate;
        
        // Reset flag after a short delay
        setTimeout(() => setIsProgrammaticChange(false), 100);
      }
    }
  }, [currentDate]);

  // Improved handleDatesSet to prevent circular updates
  const handleDatesSet = (dateInfo: any) => {
    // Skip if this is a programmatic change we initiated
    if (isProgrammaticChange) {
      console.log('IndividualStaffCalendar: Skipping datesSet - programmatic change');
      return;
    }
    
    const newDate = dateInfo.start;
    const newMonth = format(newDate, 'yyyy-MM');
    const currentMonth = format(currentDate, 'yyyy-MM');
    
    // Only trigger onDateChange if the user actually navigated to a different month
    if (newMonth !== currentMonth) {
      console.log('IndividualStaffCalendar: User navigated to month:', newMonth);
      lastParentDateRef.current = newDate;
      onDateChange(newDate);
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

  // Format events for FullCalendar with proper resource assignment
  const formattedEvents = events.map(event => {
    console.log('Formatting event:', event.title, 'for resource:', event.resourceId);
    
    return {
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      resourceId: staffResources.length > 0 && viewMode !== 'month' ? event.resourceId : undefined,
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
  console.log('View mode:', viewMode);

  // Determine the correct view based on view mode - FIXED FOR PROPER MONTHLY VIEW
  const getCalendarView = () => {
    if (viewMode === 'month') {
      // For monthly view, ALWAYS use dayGridMonth (standard month grid)
      return 'dayGridMonth';
    } else if (viewMode === 'week') {
      // For weekly view, use resource view if staff are selected
      return staffResources.length > 0 ? 'resourceDayGridWeek' : 'dayGridWeek';
    } else {
      // For day view, use resource view if staff are selected
      return staffResources.length > 0 ? 'resourceDayGridDay' : 'dayGridDay';
    }
  };

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
          schedulerLicenseKey={import.meta.env.VITE_FULLCALENDAR_LICENSE_KEY || "GPL-My-Project-Is-Open-Source"}
          initialView={getCalendarView()}
          headerToolbar={false}
          height={calendarHeight}
          resources={staffResources.length > 0 && viewMode !== 'month' ? staffResources.map(staff => ({
            id: staff.id,
            title: staff.name
          })) : undefined}
          events={formattedEvents}
          resourceAreaWidth="180px"
          resourceAreaHeaderContent="Staff Members"
          nowIndicator={true}
          weekends={true}
          initialDate={currentDate}
          datesSet={handleDatesSet}
          eventClick={handleEventClick}
          resourceOrder="title"
          resourceAreaColumns={staffResources.length > 0 && viewMode !== 'month' ? [
            {
              field: 'title',
              headerContent: 'Staff Member'
            }
          ] : undefined}
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
                      {props.teamName}
                    </div>
                  )}
                  {props.eventType === 'assignment' && (
                    <div className="text-xs opacity-75 mt-1">
                      Team Assignment
                    </div>
                  )}
                  {viewMode === 'month' && props.staffName && (
                    <div className="text-xs opacity-75 mt-1">
                      {props.staffName}
                    </div>
                  )}
                </div>
              </div>
            );
          }}
          dayMaxEvents={false}
          moreLinkClick="popover"
          fixedWeekCount={false}
          showNonCurrentDates={true}
          firstDay={1}
          eventDisplay="block"
          displayEventTime={viewMode !== 'month'}
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
        
        .fc-resource-area-header {
          background-color: #f1f5f9;
          font-weight: 600;
          font-size: 13px;
        }
        
        .fc-resource-cell {
          border-right: 1px solid #e2e8f0;
          background-color: #fafafa;
          padding: 8px;
          font-size: 12px;
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
