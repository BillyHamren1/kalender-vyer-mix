
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getStaffCalendarEvents, getStaffResources } from '@/services/staffCalendarService';
import { startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { toast } from 'sonner';
import CleanCalendarGrid from '@/components/Calendar/CleanCalendarGrid';
import ClientSelector from '@/components/Calendar/ClientSelector';
import JobSummaryList from '@/components/Calendar/JobSummaryList';
import SimpleCalendarNavigation from '@/components/Calendar/SimpleCalendarNavigation';

const StaffCalendarView: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('month');

  // Get date range based on view mode (for now, always show month range for data)
  const getDateRange = () => {
    return {
      start: startOfMonth(currentDate),
      end: endOfMonth(currentDate)
    };
  };

  const { start: startDate, end: endDate } = getDateRange();

  // Fetch staff resources
  const { data: allStaffResources = [], isLoading: isLoadingStaff } = useQuery({
    queryKey: ['staffResources'],
    queryFn: getStaffResources,
  });

  // Get all staff IDs for fetching events
  const allStaffIds = allStaffResources.map(staff => staff.id);

  // Fetch calendar events for all staff
  const { 
    data: calendarEvents = [], 
    isLoading: isLoadingEvents, 
    error,
    refetch 
  } = useQuery({
    queryKey: ['staffCalendarEvents', allStaffIds, startDate, endDate],
    queryFn: () => getStaffCalendarEvents(allStaffIds, startDate, endDate),
    enabled: allStaffIds.length > 0,
  });

  const handleDateChange = (newDate: Date) => {
    setCurrentDate(newDate);
  };

  const handleRefresh = () => {
    refetch();
    toast.success('Calendar refreshed');
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      setCurrentDate(subMonths(currentDate, 1));
    } else {
      setCurrentDate(addMonths(currentDate, 1));
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const handleDateClick = (date: Date) => {
    console.log('Date clicked:', date);
    // You can add functionality here to show day details
  };

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
            <ClientSelector
              events={calendarEvents}
              selectedClients={selectedClients}
              onSelectionChange={setSelectedClients}
            />
            <Button 
              onClick={handleRefresh} 
              variant="outline" 
              size="sm"
              disabled={isLoadingEvents}
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
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Calendar - Takes up 2/3 of the space */}
          <div className="xl:col-span-2">
            <Card>
              <CardContent className="p-0">
                {isLoadingEvents ? (
                  <div className="flex items-center justify-center h-96">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                      <p className="text-sm text-gray-600">Loading calendar...</p>
                    </div>
                  </div>
                ) : (
                  <CleanCalendarGrid
                    currentDate={currentDate}
                    events={calendarEvents}
                    selectedClients={selectedClients}
                    onDateClick={handleDateClick}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Job Summary - Takes up 1/3 of the space */}
          <div className="xl:col-span-1">
            <JobSummaryList
              events={calendarEvents}
              staffResources={allStaffResources}
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
