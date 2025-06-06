
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getStaffCalendarEvents } from '@/services/staffCalendarService';
import { startOfMonth, endOfMonth, addMonths, subMonths, format } from 'date-fns';
import IndividualStaffCalendar from '@/components/Calendar/IndividualStaffCalendar';

interface StaffMemberCalendarProps {
  staffId: string;
  staffName: string;
}

const StaffMemberCalendar: React.FC<StaffMemberCalendarProps> = ({ staffId, staffName }) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  // Get date range for the current month
  const startDate = startOfMonth(currentDate);
  const endDate = endOfMonth(currentDate);

  // Fetch calendar events for this staff member
  const { data: calendarEvents = [], isLoading } = useQuery({
    queryKey: ['staffMemberCalendarEvents', staffId, format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd')],
    queryFn: () => getStaffCalendarEvents([staffId], startDate, endDate),
    staleTime: 30000,
  });

  // Create a staff resource for the calendar - include both name and title properties
  const staffResource = {
    id: staffId,
    name: staffName,
    title: staffName, // Add the required title property
    extendedProps: {
      type: 'staff'
    }
  };

  const handleDateChange = (newDate: Date) => {
    setCurrentDate(newDate);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = direction === 'prev' 
      ? subMonths(currentDate, 1) 
      : addMonths(currentDate, 1);
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  return (
    <div className="max-w-6xl mx-auto bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-[#82b6c6] rounded-full flex items-center justify-center">
              <Calendar className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{staffName}'s Calendar</h2>
              <p className="text-sm text-gray-500">{format(currentDate, 'MMMM yyyy')}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateMonth('prev')}
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={goToToday}
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateMonth('next')}
              className="border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Calendar Content */}
      <div className="p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#82b6c6]"></div>
            <span className="ml-3 text-gray-600">Loading calendar...</span>
          </div>
        ) : (
          <IndividualStaffCalendar
            events={calendarEvents}
            staffResources={[staffResource]}
            currentDate={currentDate}
            viewMode="month"
            onDateChange={handleDateChange}
            isLoading={isLoading}
          />
        )}
      </div>
    </div>
  );
};

export default StaffMemberCalendar;
