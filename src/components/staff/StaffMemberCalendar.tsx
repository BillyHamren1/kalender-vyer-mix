
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center">
            <Calendar className="h-5 w-5 mr-2" />
            {staffName}'s Calendar - {format(currentDate, 'MMMM yyyy')}
          </CardTitle>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateMonth('prev')}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={goToToday}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateMonth('next')}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">Loading calendar...</span>
          </div>
        ) : (
          <div className="h-96">
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
  );
};

export default StaffMemberCalendar;
