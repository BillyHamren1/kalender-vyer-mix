
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
    <div className="staff-calendar-container relative bg-white rounded-xl shadow-lg overflow-hidden max-w-4xl mx-auto">
      {isLoading && (
        <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center z-20 backdrop-blur-sm">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-3 border-[#82b6c6] mx-auto mb-3"></div>
            <p className="text-sm text-gray-700 font-medium">Loading staff schedules...</p>
          </div>
        </div>
      )}
      
      <div className="relative p-4">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={false}
          height="500px"
          events={formattedEvents}
          nowIndicator={true}
          weekends={true}
          initialDate={currentDate}
          eventClick={handleStaffEventClick}
          eventContent={(renderInfo) => {
            const { event } = renderInfo;
            const props = event.extendedProps;
            
            return (
              <div className="fc-event-main-frame p-2 rounded-md" title={`Staff: ${props.staffName}`}>
                <div className="fc-event-title-container">
                  <div className="fc-event-title text-sm font-semibold leading-tight">
                    {event.title}
                  </div>
                </div>
              </div>
            );
          }}
          dayMaxEvents={3}
          moreLinkClick="popover"
          fixedWeekCount={false}
          showNonCurrentDates={false}
          firstDay={1}
          eventDisplay="block"
          displayEventTime={false}
          aspectRatio={1.8}
        />
      </div>
      
      <style>{`
        .staff-calendar-container {
          position: relative;
          border: 1px solid #e2e8f0;
          max-width: 900px;
        }
        
        /* Modern calendar grid styling */
        .fc-theme-standard .fc-scrollgrid {
          border: none !important;
        }
        
        .fc-scrollgrid-section table {
          border: none !important;
        }
        
        /* Beautiful day grid cells */
        .fc-daygrid-day {
          border: 1px solid #f1f5f9 !important;
          background: #ffffff;
          transition: all 0.2s ease;
          min-height: 70px !important;
        }
        
        .fc-daygrid-day:hover {
          background: #f8fafc !important;
        }
        
        /* Stunning day numbers */
        .fc-daygrid-day-number {
          font-weight: 600 !important;
          font-size: 14px !important;
          color: #374151 !important;
          padding: 8px !important;
          text-decoration: none !important;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          margin: 6px;
          transition: all 0.2s ease;
        }
        
        .fc-daygrid-day-number:hover {
          background: #e2e8f0 !important;
          color: #1e293b !important;
        }
        
        /* Today's styling - stunning highlight */
        .fc-day-today {
          background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%) !important;
          border: 2px solid #0ea5e9 !important;
          box-shadow: 0 4px 12px rgba(14, 165, 233, 0.15) !important;
        }
        
        .fc-day-today .fc-daygrid-day-number {
          background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%) !important;
          color: white !important;
          font-weight: 700 !important;
          box-shadow: 0 3px 8px rgba(14, 165, 233, 0.3) !important;
          transform: scale(1.1);
        }
        
        /* Beautiful column headers */
        .fc-col-header-cell {
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%) !important;
          border: 1px solid #e2e8f0 !important;
          font-weight: 700 !important;
          font-size: 12px !important;
          color: #475569 !important;
          text-transform: uppercase !important;
          letter-spacing: 0.5px !important;
          padding: 12px 6px !important;
          text-align: center !important;
        }
        
        .fc-col-header-cell-cushion {
          color: #475569 !important;
          text-decoration: none !important;
          font-weight: 700 !important;
        }
        
        /* Stunning event styling */
        .fc-daygrid-event {
          margin: 2px 4px !important;
          padding: 4px 6px !important;
          border-radius: 6px !important;
          font-size: 11px !important;
          line-height: 1.3 !important;
          border: none !important;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
          transition: all 0.2s ease !important;
          cursor: pointer !important;
        }
        
        .fc-daygrid-event:hover {
          transform: translateY(-1px) !important;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15) !important;
        }
        
        .fc-event-title {
          font-weight: 600 !important;
          color: #000000 !important;
        }
        
        /* More link styling */
        .fc-more-link {
          color: #0ea5e9 !important;
          font-size: 10px !important;
          font-weight: 600 !important;
          text-decoration: none !important;
          padding: 3px 6px !important;
          border-radius: 4px !important;
          background: #f0f9ff !important;
          margin: 1px 4px !important;
          transition: all 0.2s ease !important;
        }
        
        .fc-more-link:hover {
          background: #e0f2fe !important;
          color: #0284c7 !important;
        }
        
        /* Day frame styling */
        .fc-daygrid-day-frame {
          min-height: 70px !important;
          position: relative !important;
        }
        
        .fc-daygrid-day-events {
          margin-top: 38px !important;
          padding: 0 3px !important;
        }
        
        .fc-event-main {
          padding: 1px 3px !important;
        }
        
        .fc-daygrid-day-top {
          text-align: left !important;
          padding: 0 !important;
        }
        
        /* Hide other month days completely */
        .fc-day-other {
          display: none !important;
        }
        
        /* Weekend styling */
        .fc-day-sat, .fc-day-sun {
          background: #fafafa !important;
        }
        
        .fc-day-sat .fc-daygrid-day-number,
        .fc-day-sun .fc-daygrid-day-number {
          color: #6b7280 !important;
        }
        
        /* Event color overrides for better visibility */
        .fc-daygrid-event[style*="background-color: rgb(242, 252, 226)"] {
          background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%) !important;
          border-left: 3px solid #22c55e !important;
        }
        
        .fc-daygrid-event[style*="background-color: rgb(254, 247, 205)"] {
          background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%) !important;
          border-left: 3px solid #f59e0b !important;
        }
        
        .fc-daygrid-event[style*="background-color: rgb(254, 198, 161)"] {
          background: linear-gradient(135deg, #fef2f2 0%, #fecaca 100%) !important;
          border-left: 3px solid #ef4444 !important;
        }
        
        /* Smooth scrolling */
        .fc-scroller {
          overflow: visible !important;
        }
        
        /* Remove any unwanted borders */
        .fc-daygrid-body {
          border: none !important;
        }
        
        .fc-scrollgrid-sync-table {
          border: none !important;
        }
        
        /* Perfect spacing */
        .fc-daygrid-day-events {
          min-height: 35px !important;
        }
      `}</style>
    </div>
  );
};

export default IndividualStaffCalendar;
