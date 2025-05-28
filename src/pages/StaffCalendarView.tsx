
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
    isLoading: isLoadingStaff,
    refetch: refetchStaff 
  } = useQuery({
    queryKey: ['staffResources'],
    queryFn: getStaffResources,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  // Remove the auto-selection effect - staff selection is now manual only
  // useEffect(() => {
  //   if (staffResources.length > 0 && selectedStaffIds.length === 0) {
  //     const allStaffIds = staffResources.map(staff => staff.id);
  //     console.log('StaffCalendarView: Auto-selecting all staff:', allStaffIds);
  //     setSelectedStaffIds(allStaffIds);
  //   }
  // }, [staffResources, selectedStaffIds.length]);

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
        <div className="text-center">
          <p className="text-red-600 mb-4">Error loading staff calendar: {error.message}</p>
          <Button onClick={() => {
            refetchEvents();
            refetchStaff();
          }}>Retry</Button>
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
        <div className="grid grid-cols-4 gap-6">
          {/* Calendar - Takes up 3 columns */}
          <div className="col-span-3">
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

          {/* Right Sidebar - Staff Selection and Job Summary */}
          <div className="col-span-1 space-y-6">
            {/* Staff Selection Panel */}
            <StaffSelectorPanel
              staffResources={staffResources}
              selectedStaffIds={selectedStaffIds}
              onSelectionChange={setSelectedStaffIds}
              isLoading={isLoadingStaff}
            />

            {/* Job Summary */}
            <JobSummaryList
              events={calendarEvents}
              staffResources={filteredStaffResources}
              selectedClients={selectedClients}
              currentDate={currentDate}
              viewMode={viewMode}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default StaffCalendarView;
