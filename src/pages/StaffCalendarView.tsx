
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Users, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StaffSelector from '@/components/Calendar/StaffSelector';
import IndividualStaffCalendar from '@/components/Calendar/IndividualStaffCalendar';
import MonthNavigation from '@/components/Calendar/MonthNavigation';
import { getStaffCalendarEvents, getStaffResources } from '@/services/staffCalendarService';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, subDays } from 'date-fns';
import { toast } from 'sonner';

const StaffCalendarView: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');

  // Get date range based on view mode
  const getDateRange = () => {
    if (viewMode === 'week') {
      return {
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 })
      };
    } else {
      return {
        start: startOfMonth(currentDate),
        end: endOfMonth(currentDate)
      };
    }
  };

  const { start: startDate, end: endDate } = getDateRange();

  // Fetch staff resources
  const { data: allStaffResources = [], isLoading: isLoadingStaff } = useQuery({
    queryKey: ['staffResources'],
    queryFn: getStaffResources,
  });

  // Filter selected staff resources
  const selectedStaffResources = allStaffResources.filter(staff => 
    selectedStaffIds.includes(staff.id)
  );

  // Fetch calendar events for selected staff
  const { 
    data: calendarEvents = [], 
    isLoading: isLoadingEvents, 
    error,
    refetch 
  } = useQuery({
    queryKey: ['staffCalendarEvents', selectedStaffIds, startDate, endDate],
    queryFn: () => getStaffCalendarEvents(selectedStaffIds, startDate, endDate),
    enabled: selectedStaffIds.length > 0,
  });

  // Auto-select first few staff members on initial load
  useEffect(() => {
    if (allStaffResources.length > 0 && selectedStaffIds.length === 0) {
      const initialSelection = allStaffResources.slice(0, 3).map(staff => staff.id);
      setSelectedStaffIds(initialSelection);
    }
  }, [allStaffResources, selectedStaffIds.length]);

  const handleDateChange = (newDate: Date) => {
    setCurrentDate(newDate);
  };

  const handleViewModeChange = (mode: 'week' | 'month') => {
    setViewMode(mode);
  };

  const handleRefresh = () => {
    refetch();
    toast.success('Staff schedules refreshed');
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    if (viewMode === 'week') {
      setCurrentDate(direction === 'prev' ? subDays(currentDate, 7) : addDays(currentDate, 7));
    } else {
      const newDate = new Date(currentDate);
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      setCurrentDate(newDate);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="text-center">
          <p className="text-red-600 mb-4">Error loading staff calendar: {error.message}</p>
          <Button onClick={handleRefresh}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="container mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Users className="h-8 w-8 text-[#82b6c6]" />
            <h1 className="text-3xl font-bold text-gray-900">Staff Calendar</h1>
          </div>
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

        {/* Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="h-5 w-5 mr-2" />
              Staff Selection & View Options
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <StaffSelector
                selectedStaffIds={selectedStaffIds}
                onSelectionChange={setSelectedStaffIds}
                disabled={isLoadingStaff}
              />
              
              <Tabs value={viewMode} onValueChange={handleViewModeChange} className="w-auto">
                <TabsList>
                  <TabsTrigger value="week">Week View</TabsTrigger>
                  <TabsTrigger value="month">Month View</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardContent>
        </Card>

        {/* Calendar Navigation */}
        <Card>
          <CardContent className="pt-6">
            <MonthNavigation
              currentDate={currentDate}
              onNavigate={navigateDate}
              onToday={() => setCurrentDate(new Date())}
              viewMode={viewMode}
            />
          </CardContent>
        </Card>

        {/* Calendar Display */}
        {selectedStaffIds.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No Staff Selected
                </h3>
                <p className="text-gray-600">
                  Please select staff members to view their schedules
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>
                Staff Schedules ({selectedStaffResources.length} staff selected)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <IndividualStaffCalendar
                events={calendarEvents}
                staffResources={selectedStaffResources}
                currentDate={currentDate}
                viewMode={viewMode}
                onDateChange={handleDateChange}
                isLoading={isLoadingEvents}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default StaffCalendarView;
