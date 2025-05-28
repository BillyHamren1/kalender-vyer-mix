
import React, { useEffect, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { StaffCalendarEvent, StaffResource } from '@/services/staffCalendarService';
import { format } from 'date-fns';
import { useEventNavigation } from '@/hooks/useEventNavigation';

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
  const [lastProcessedDate, setLastProcessedDate] = useState<string>('');
  const { handleEventClick } = useEventNavigation();

  // Update FullCalendar when currentDate changes from parent
  useEffect(() => {
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      const dateStr = format(currentDate, 'yyyy-MM-dd');
      
      // Only update if the date actually changed
      if (lastProcessedDate !== dateStr) {
        console.log('IndividualStaffCalendar: Updating calendar to date:', dateStr);
        calendarApi.gotoDate(currentDate);
        setLastProcessedDate(dateStr);
      }
    }
  }, [currentDate, lastProcessedDate]);

  // Updated event click handler to use navigation hook
  const handleStaffEventClick = (clickInfo: any) => {
    const event = clickInfo.event;
    
    console.log('Staff Calendar Event Clicked:', {
      title: event.title,
      staff: event.extendedProps.staffName,
      date: format(event.start, 'yyyy-MM-dd'),
      bookingId: event.extendedProps.bookingId,
      details: event.extendedProps
    });

    // Use the event navigation hook to handle booking navigation
    handleEventClick(clickInfo);
  };

  // Format events for FullCalendar - Show only booking events with client name and event type
  const formattedEvents = events
    .filter(event => event.eventType === 'booking_event') // Only show actual booking events
    .map(event => {
      console.log('Formatting booking event:', event.title, 'for staff:', event.staffName);
      
      return {
        id: event.id,
        title: event.title, // Already formatted as "Client Name - event type"
        start: event.start,
        end: event.end,
        backgroundColor: event.backgroundColor,
        borderColor: event.borderColor,
        textColor: '#000',
        extendedProps: {
          teamId: event.teamId,
          teamName: event.teamName,
          bookingId: event.bookingId,
          eventType: event.extendedProps?.eventType,
          staffName: event.staffName,
          client: event.client
        }
      };
    });

  console.log('Formatted booking events for calendar:', formattedEvents);
  console.log('Staff resources:', staffResources);
  console.log('Current date prop:', format(currentDate, 'yyyy-MM-dd'));

  return (
    <div className="staff-calendar-container relative bg-white rounded-lg border border-gray-200 overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center z-20 backdrop-blur-sm">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3"></div>
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
          height="auto"
          events={formattedEvents}
          nowIndicator={true}
          weekends={true}
          initialDate={currentDate}
          eventClick={handleStaffEventClick}
          eventContent={(renderInfo) => {
            const { event } = renderInfo;
            const props = event.extendedProps;
            
            return (
              <div className="fc-event-main-frame p-1 rounded text-xs" title={`Staff: ${props.staffName}`}>
                <div className="fc-event-title-container">
                  <div className="fc-event-title font-medium leading-tight truncate">
                    {event.title}
                  </div>
                </div>
              </div>
            );
          }}
          dayMaxEvents={3}
          moreLinkClick="popover"
          fixedWeekCount={true}
          showNonCurrentDates={true}
          firstDay={1}
          eventDisplay="block"
          displayEventTime={false}
          aspectRatio={1.6}
        />
      </div>
      
      <style>{`
        .staff-calendar-container {
          max-width: 100%;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        /* Clean, minimal styling matching the reference */
        .fc-theme-standard .fc-scrollgrid {
          border: none !important;
        }
        
        .fc-scrollgrid-section table {
          border: none !important;
        }
        
        /* Day grid cells - clean and minimal */
        .fc-daygrid-day {
          border: 1px solid #e5e7eb !important;
          background: #ffffff;
          transition: background-color 0.15s ease;
          min-height: 80px !important;
        }
        
        .fc-daygrid-day:hover {
          background: #f9fafb !important;
        }
        
        /* Day numbers - clean and simple */
        .fc-daygrid-day-number {
          font-weight: 500 !important;
          font-size: 14px !important;
          color: #374151 !important;
          padding: 8px !important;
          text-decoration: none !important;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          margin: 6px;
          transition: all 0.15s ease;
        }
        
        .fc-daygrid-day-number:hover {
          background: #f3f4f6 !important;
          color: #111827 !important;
        }
        
        /* Today's styling - subtle blue accent */
        .fc-day-today {
          background: #f8fafc !important;
          border: 1px solid #3b82f6 !important;
        }
        
        .fc-day-today .fc-daygrid-day-number {
          background: #3b82f6 !important;
          color: white !important;
          font-weight: 600 !important;
        }
        
        /* Column headers - clean typography */
        .fc-col-header-cell {
          background: #f9fafb !important;
          border: 1px solid #e5e7eb !important;
          font-weight: 600 !important;
          font-size: 11px !important;
          color: #6b7280 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
          padding: 12px 8px !important;
          text-align: center !important;
        }
        
        .fc-col-header-cell-cushion {
          color: #6b7280 !important;
          text-decoration: none !important;
          font-weight: 600 !important;
        }
        
        /* Event styling - clean and modern */
        .fc-daygrid-event {
          margin: 2px 3px !important;
          padding: 3px 6px !important;
          border-radius: 4px !important;
          font-size: 11px !important;
          line-height: 1.3 !important;
          border: none !important;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05) !important;
          transition: all 0.15s ease !important;
          cursor: pointer !important;
        }
        
        .fc-daygrid-event:hover {
          transform: translateY(-1px) !important;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
        }
        
        .fc-event-title {
          font-weight: 500 !important;
          color: #374151 !important;
        }
        
        /* More link styling */
        .fc-more-link {
          color: #3b82f6 !important;
          font-size: 10px !important;
          font-weight: 500 !important;
          text-decoration: none !important;
          padding: 2px 6px !important;
          border-radius: 3px !important;
          background: #eff6ff !important;
          margin: 1px 3px !important;
          transition: all 0.15s ease !important;
        }
        
        .fc-more-link:hover {
          background: #dbeafe !important;
          color: #2563eb !important;
        }
        
        /* Day frame styling */
        .fc-daygrid-day-frame {
          min-height: 80px !important;
          position: relative !important;
        }
        
        .fc-daygrid-day-events {
          margin-top: 42px !important;
          padding: 0 4px !important;
        }
        
        .fc-event-main {
          padding: 1px 2px !important;
        }
        
        .fc-daygrid-day-top {
          text-align: left !important;
          padding: 0 !important;
        }
        
        /* Other month days */
        .fc-day-other {
          background: #fafafa !important;
          opacity: 0.4 !important;
        }
        
        .fc-day-other .fc-daygrid-day-number {
          color: #9ca3af !important;
        }
        
        /* Weekend styling */
        .fc-day-sat, .fc-day-sun {
          background: #fafbfc !important;
        }
        
        /* Event colors - clean and consistent */
        .fc-daygrid-event[style*="background-color: rgb(242, 252, 226)"] {
          background: #dcfce7 !important;
          border-left: 3px solid #22c55e !important;
          color: #166534 !important;
        }
        
        .fc-daygrid-event[style*="background-color: rgb(254, 247, 205)"] {
          background: #fef3c7 !important;
          border-left: 3px solid #f59e0b !important;
          color: #92400e !important;
        }
        
        .fc-daygrid-event[style*="background-color: rgb(254, 198, 161)"] {
          background: #fecaca !important;
          border-left: 3px solid #ef4444 !important;
          color: #991b1b !important;
        }
        
        /* Remove unwanted elements */
        .fc-scroller {
          overflow: visible !important;
        }
        
        .fc-daygrid-body {
          border: none !important;
        }
        
        .fc-scrollgrid-sync-table {
          border: none !important;
        }
        
        /* Perfect spacing */
        .fc-daygrid-day-events {
          min-height: 38px !important;
        }
        
        /* Remove any borders that break the clean look */
        .fc-scrollgrid-section-header > td,
        .fc-scrollgrid-section-body > td {
          border: none !important;
        }
      `}</style>
    </div>
  );
};

export default IndividualStaffCalendar;
