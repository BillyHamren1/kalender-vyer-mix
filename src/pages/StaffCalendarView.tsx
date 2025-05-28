
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getStaffCalendarEvents, getStaffResources } from '@/services/staffCalendarService';
import { startOfMonth, endOfMonth, addMonths, subMonths, format } from 'date-fns';
import { toast } from 'sonner';
import IndividualStaffCalendar from '@/components/Calendar/IndividualStaffCalendar';
import ClientSelector from '@/components/Calendar/ClientSelector';
import JobSummaryList from '@/components/Calendar/JobSummaryList';
import SimpleCalendarNavigation from '@/components/Calendar/SimpleCalendarNavigation';
import StaffSelector from '@/components/Calendar/StaffSelector';

const StaffCalendarView: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');

  // Improved date range calculation with proper month boundaries
  const getDateRange = () => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    
    console.log('StaffCalendarView: Date range for', format(currentDate, 'yyyy-MM-dd'), 'is', format(start, 'yyyy-MM-dd'), 'to', format(end, 'yyyy-MM-dd'));
    
    return { start, end };
  };

  const { start: startDate, end: endDate } = getDateRange();

  // Fetch staff resources for the calendar
  const { 
    data: staffResources = [], 
    isLoading: isLoadingStaff,
    refetch: refetchStaff 
  } = useQuery({
    queryKey: ['staffResources'],
    queryFn: getStaffResources,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  // Fetch calendar events with improved query key that includes the formatted date
  const { 
    data: calendarEvents = [], 
    isLoading: isLoadingEvents, 
    error,
    refetch: refetchEvents 
  } = useQuery({
    queryKey: ['staffCalendarEvents', selectedStaffIds, format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd')],
    queryFn: () => {
      console.log('StaffCalendarView: Fetching events for staff:', selectedStaffIds, 'from', format(startDate, 'yyyy-MM-dd'), 'to', format(endDate, 'yyyy-MM-dd'));
      return getStaffCalendarEvents(selectedStaffIds, startDate, endDate);
    },
    enabled: selectedStaffIds.length > 0,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  // Improved date change handler that ensures proper month boundaries
  const handleDateChange = (newDate: Date) => {
    console.log('StaffCalendarView: Date changed from', format(currentDate, 'yyyy-MM-dd'), 'to', format(newDate, 'yyyy-MM-dd'));
    
    // Only update if the month actually changed to prevent unnecessary re-renders
    const currentMonth = format(currentDate, 'yyyy-MM');
    const newMonth = format(newDate, 'yyyy-MM');
    
    if (currentMonth !== newMonth) {
      console.log('StaffCalendarView: Month changed, updating currentDate');
      setCurrentDate(newDate);
    }
  };

  const handleRefresh = () => {
    refetchEvents();
    refetchStaff();
    toast.success('Calendar refreshed');
  };

  // Improved navigation with better month handling
  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = direction === 'prev' 
      ? subMonths(currentDate, 1) 
      : addMonths(currentDate, 1);
    
    console.log('StaffCalendarView: Navigating', direction, 'from', format(currentDate, 'yyyy-MM'), 'to', format(newDate, 'yyyy-MM'));
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    const today = new Date();
    console.log('StaffCalendarView: Going to today:', format(today, 'yyyy-MM-dd'));
    setCurrentDate(today);
  };

  const handleDateClick = (date: Date) => {
    console.log('Date clicked:', date);
  };

  // Filter staff resources to only show selected staff
  const filteredStaffResources = staffResources.filter(staff => 
    selectedStaffIds.includes(staff.id)
  );

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Error loading staff calendar: {error.message}</p>
          <Button onClick={handleRefresh}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Users className="h-8 w-8 text-[#82b6c6]" />
            <h1 className="text-3xl font-bold text-gray-900">Staff Calendar</h1>
          </div>
          <div className="flex items-center space-x-4">
            <StaffSelector
              selectedStaffIds={selectedStaffIds}
              onSelectionChange={setSelectedStaffIds}
            />
            <ClientSelector
              events={calendarEvents}
              selectedClients={selectedClients}
              onSelectionChange={setSelectedClients}
            />
            <Button 
              onClick={handleRefresh} 
              variant="outline" 
              size="sm"
              disabled={isLoadingEvents || isLoadingStaff}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <SimpleCalendarNavigation
        currentDate={currentDate}
        onNavigate={navigateDate}
        onToday={goToToday}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {/* Main Content */}
      <div className="p-6">
        {selectedStaffIds.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Select Staff Members</h3>
              <p className="text-gray-600">Please select one or more staff members to view their calendar with assignments and bookings.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Calendar */}
            <div className="xl:col-span-2">
              <Card>
                <CardContent className="p-0 relative">
                  {(isLoadingEvents || isLoadingStaff) && (
                    <div className="absolute top-4 right-4 z-10">
                      <div className="flex items-center space-x-2 bg-white px-3 py-2 rounded-lg shadow-sm border">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                        <span className="text-sm text-gray-600">Loading calendar...</span>
                      </div>
                    </div>
                  )}
                  
                  <IndividualStaffCalendar
                    events={calendarEvents}
                    staffResources={filteredStaffResources}
                    currentDate={currentDate}
                    viewMode={viewMode}
                    onDateChange={handleDateChange}
                    isLoading={isLoadingEvents || isLoadingStaff}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Job Summary */}
            <div className="xl:col-span-1">
              <JobSummaryList
                events={calendarEvents}
                staffResources={filteredStaffResources}
                selectedClients={selectedClients}
                currentDate={currentDate}
                viewMode={viewMode}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StaffCalendarView;
