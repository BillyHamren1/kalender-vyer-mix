import React, { useState, useCallback } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { useRealTimeCalendarEvents } from '@/hooks/useRealTimeCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { StaffAssignment } from '@/hooks/useWeeklyStaffOperations';
import AvailableStaffDisplay from '@/components/Calendar/AvailableStaffDisplay';

moment.locale('en-GB');
const localizer = momentLocalizer(moment);

const WeeklyResourceView = () => {
  const navigate = useNavigate();
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const {
    events,
    isLoading,
    isMounted,
    currentDate,
    handleDatesSet,
    refreshEvents
  } = useRealTimeCalendarEvents();
  const { teamResources } = useTeamResources();

  const handleSelectEvent = useCallback(
    (event) => {
      setSelectedEvent(event);
      setIsModalOpen(true);
    },
    []
  );

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedEvent(null);
  }, []);

  const eventStyleGetter = (event) => {
    const backgroundColor = event.color ? event.color : '#3174ad';
    const style = {
      backgroundColor: backgroundColor,
      borderRadius: '5px',
      opacity: 0.8,
      color: 'white',
      border: '0px',
      display: 'block'
    };
    return {
      style: style
    };
  };

  const handleStaffDrop = async (staffId: string, resourceId: string | null, targetDate?: Date) => {
    console.log('Staff drop', { staffId, resourceId, targetDate });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
            <h1 className="text-2xl font-bold text-gray-900">Weekly Resource Calendar</h1>
          </div>
          <div className="text-sm text-gray-500">
            Original calendar view • react-big-calendar
          </div>
        </div>
      </div>

      {/* Calendar Container */}
      <div className="p-6">
        {isMounted ? (
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            allDayAccessor="allDay"
            resourceIdAccessor="resourceId"
            resources={teamResources}
            views={['day', 'work_week', 'month']}
            style={{ height: 800 }}
            onSelectEvent={handleSelectEvent}
            eventPropGetter={eventStyleGetter}
            date={currentDate}
            onNavigate={handleDatesSet}
          />
        ) : (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Loading calendar...</div>
          </div>
        )}
      </div>

      {/* Available Staff Panel - add required props */}
      <AvailableStaffDisplay
        currentDate={currentDate}
        onStaffDrop={handleStaffDrop}
        availableStaff={[]}
        isLoading={false}
      />
    </div>
  );
};

export default WeeklyResourceView;
