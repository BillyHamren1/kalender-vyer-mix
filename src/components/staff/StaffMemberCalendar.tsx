
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
    <div className="min-h-screen bg-gray-50">
      {/* Modern Header with teal color scheme */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-[#7BAEBF] to-[#6E9DAC] rounded-lg shadow-sm">
                <Calendar className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{staffName}'s Calendar</h1>
                <p className="text-sm text-gray-500">{format(currentDate, 'MMMM yyyy')}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateMonth('prev')}
                className="border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goToToday}
                className="border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors font-medium"
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateMonth('next')}
                className="border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Card className="shadow-sm border-0 bg-white">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="flex items-center space-x-3">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#7BAEBF] border-t-transparent"></div>
                  <span className="text-gray-600 font-medium">Loading calendar...</span>
                </div>
              </div>
            ) : (
              <div className="rounded-lg overflow-hidden">
                <IndividualStaffCalendar
                  events={calendarEvents}
                  staffResources={[staffResource]}
                  currentDate={currentDate}
                  viewMode="month"
                  onDateChange={handleDateChange}
                  isLoading={isLoading}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default StaffMemberCalendar;
