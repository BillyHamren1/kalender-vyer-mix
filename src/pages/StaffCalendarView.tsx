
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getStaffCalendarEvents, getStaffResources } from '@/services/staffCalendarService';
import { startOfMonth, endOfMonth, addMonths, subMonths, format } from 'date-fns';
import { toast } from 'sonner';
import IndividualStaffCalendar from '@/components/Calendar/IndividualStaffCalendar';
import JobSummaryList from '@/components/Calendar/JobSummaryList';
import SimpleCalendarNavigation from '@/components/Calendar/SimpleCalendarNavigation';
import StaffSelectorPanel from '@/components/Calendar/StaffSelectorPanel';

const StaffCalendarView: React.FC = () => {
  // Initialize with TODAY'S date
  const [currentDate, setCurrentDate] = useState(() => {
    const today = new Date();
    console.log('StaffCalendarView: Initializing with today:', format(today, 'yyyy-MM-dd'));
    return today;
  });
  
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]); // Start with empty array - no auto-selection
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('month');

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
    isLoadingStaff,
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

  // Improved navigation with better month handling
  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = direction === 'prev' 
      ? subMonths(currentDate, 1) 
      : addMonths(currentDate, 1);
    
    console.log('StaffCalendarView: Navigating', direction, 'from', format(currentDate, 'yyyy-MM'), 'to', format(newDate, 'yyyy-MM'));
    setCurrentDate(newDate);
  };

  // Go to today's date
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
        <Card className="max-w-md mx-auto">
          <CardContent className="p-6 text-center">
            <p className="text-red-600 mb-4">Error loading staff calendar: {error.message}</p>
            <Button onClick={() => {
              refetchEvents();
              refetchStaff();
            }}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Modern Header with consistent styling */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-sm">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Staff Calendar</h1>
                <p className="text-sm text-gray-500">Manage team schedules and assignments</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation with modern styling */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SimpleCalendarNavigation
            currentDate={currentDate}
            onNavigate={navigateDate}
            onToday={goToToday}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </div>
      </div>

      {/* Main Content with improved layout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Calendar Section - 3 columns on large screens */}
          <div className="lg:col-span-3">
            <Card className="shadow-sm border-0 bg-white">
              <CardContent className="p-0 relative">
                {/* Modern loading indicator */}
                {(isLoadingEvents || isLoadingStaff) && (
                  <div className="absolute top-4 right-4 z-20">
                    <div className="flex items-center space-x-3 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border border-gray-100">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                      <span className="text-sm font-medium text-gray-700">Loading calendar...</span>
                    </div>
                  </div>
                )}
                
                {/* Calendar container with improved styling */}
                <div className="rounded-lg overflow-hidden border border-gray-100">
                  <IndividualStaffCalendar
                    events={calendarEvents}
                    staffResources={filteredStaffResources}
                    currentDate={currentDate}
                    viewMode={viewMode}
                    onDateChange={handleDateChange}
                    isLoading={isLoadingEvents || isLoadingStaff}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - 1 column on large screens */}
          <div className="lg:col-span-1 space-y-6">
            {/* Staff Selection Panel with modern styling */}
            <Card className="shadow-sm border-0 bg-white">
              <StaffSelectorPanel
                staffResources={staffResources}
                selectedStaffIds={selectedStaffIds}
                onSelectionChange={setSelectedStaffIds}
                isLoading={isLoadingStaff}
              />
            </Card>

            {/* Job Summary with modern styling */}
            <Card className="shadow-sm border-0 bg-white">
              <JobSummaryList
                events={calendarEvents}
                staffResources={filteredStaffResources}
                selectedClients={selectedClients}
                currentDate={currentDate}
                viewMode={viewMode}
              />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StaffCalendarView;
