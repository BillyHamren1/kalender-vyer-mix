
import React, { useState, useEffect, useCallback } from 'react';
import { format, startOfWeek, startOfMonth, addDays, addWeeks, addMonths, subWeeks, subMonths } from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import StaffSelector from '@/components/Calendar/StaffSelector';
import IndividualStaffCalendar from '@/components/Calendar/IndividualStaffCalendar';
import { 
  getStaffCalendarEvents, 
  getStaffResources, 
  getStaffSummaryForDate,
  StaffCalendarEvent, 
  StaffResource 
} from '@/services/staffCalendarService';
import { toast } from 'sonner';

const StaffCalendarView = () => {
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [staffResources, setStaffResources] = useState<StaffResource[]>([]);
  const [events, setEvents] = useState<StaffCalendarEvent[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [isLoading, setIsLoading] = useState(false);
  const [staffSummaries, setStaffSummaries] = useState<any[]>([]);

  // Load staff resources on component mount
  useEffect(() => {
    const loadStaffResources = async () => {
      try {
        const resources = await getStaffResources();
        setStaffResources(resources);
        console.log(`Loaded ${resources.length} staff resources`);
      } catch (error) {
        console.error('Error loading staff resources:', error);
        toast.error('Failed to load staff members');
      }
    };

    loadStaffResources();
  }, []);

  // Load calendar events when staff selection or date changes
  useEffect(() => {
    if (selectedStaffIds.length === 0) {
      setEvents([]);
      setStaffSummaries([]);
      return;
    }

    const loadCalendarEvents = async () => {
      try {
        setIsLoading(true);
        
        // Calculate date range based on view mode
        const startDate = viewMode === 'week' 
          ? startOfWeek(currentDate, { weekStartsOn: 1 })
          : startOfMonth(currentDate);
        
        const endDate = viewMode === 'week'
          ? addDays(startDate, 6)
          : addDays(startOfMonth(addMonths(currentDate, 1)), -1);

        console.log(`Loading events for ${selectedStaffIds.length} staff from ${format(startDate, 'yyyy-MM-dd')} to ${format(endDate, 'yyyy-MM-dd')}`);

        const [calendarEvents, summaries] = await Promise.all([
          getStaffCalendarEvents(selectedStaffIds, startDate, endDate),
          getStaffSummaryForDate(selectedStaffIds, currentDate)
        ]);

        setEvents(calendarEvents);
        setStaffSummaries(summaries);
        
        console.log(`Loaded ${calendarEvents.length} calendar events`);
      } catch (error) {
        console.error('Error loading calendar events:', error);
        toast.error('Failed to load staff schedules');
      } finally {
        setIsLoading(false);
      }
    };

    loadCalendarEvents();
  }, [selectedStaffIds, currentDate, viewMode]);

  // Navigation handlers
  const handlePrevious = () => {
    if (viewMode === 'week') {
      setCurrentDate(prev => subWeeks(prev, 1));
    } else {
      setCurrentDate(prev => subMonths(prev, 1));
    }
  };

  const handleNext = () => {
    if (viewMode === 'week') {
      setCurrentDate(prev => addWeeks(prev, 1));
    } else {
      setCurrentDate(prev => addMonths(prev, 1));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleDateChange = useCallback((newDate: Date) => {
    setCurrentDate(newDate);
  }, []);

  // Get selected staff resources for display
  const selectedStaffResources = staffResources.filter(staff => 
    selectedStaffIds.includes(staff.id)
  );

  // Format current period display
  const getCurrentPeriodText = () => {
    if (viewMode === 'week') {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = addDays(weekStart, 6);
      return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
    } else {
      return format(currentDate, 'MMMM yyyy');
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold">Staff Calendar</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'week' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('week')}
          >
            Week
          </Button>
          <Button
            variant={viewMode === 'month' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('month')}
          >
            Month
          </Button>
        </div>
      </div>

      {/* Staff Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Select Staff Members</CardTitle>
        </CardHeader>
        <CardContent>
          <StaffSelector
            selectedStaffIds={selectedStaffIds}
            onSelectionChange={setSelectedStaffIds}
            disabled={isLoading}
          />
        </CardContent>
      </Card>

      {/* Staff Summary */}
      {selectedStaffIds.length > 0 && staffSummaries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Staff Assignments - {format(currentDate, 'EEEE, MMMM d, yyyy')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {staffSummaries.map(summary => {
                const staff = staffResources.find(s => s.id === summary.staffId);
                return (
                  <div key={summary.staffId} className="p-3 border rounded-lg">
                    <div className="font-medium">{staff?.name}</div>
                    <div className="text-sm text-gray-600 mt-1">
                      {summary.teamId ? (
                        <Badge variant="secondary">Team {summary.teamId}</Badge>
                      ) : (
                        <Badge variant="outline">Not Assigned</Badge>
                      )}
                    </div>
                    {summary.bookingsCount > 0 && (
                      <div className="text-xs text-blue-600 mt-1">
                        {summary.bookingsCount} booking{summary.bookingsCount !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calendar Navigation */}
      {selectedStaffIds.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrevious}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleToday}>
              Today
            </Button>
          </div>
          
          <h2 className="text-xl font-semibold">{getCurrentPeriodText()}</h2>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">
              {selectedStaffIds.length} staff member{selectedStaffIds.length !== 1 ? 's' : ''} selected
            </span>
          </div>
        </div>
      )}

      {/* Calendar Display */}
      {selectedStaffIds.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <IndividualStaffCalendar
              events={events}
              staffResources={selectedStaffResources}
              currentDate={currentDate}
              viewMode={viewMode}
              onDateChange={handleDateChange}
              isLoading={isLoading}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center h-64">
            <div className="text-center text-gray-500">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Select Staff Members</p>
              <p className="text-sm">Choose staff members above to view their schedules</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default StaffCalendarView;
