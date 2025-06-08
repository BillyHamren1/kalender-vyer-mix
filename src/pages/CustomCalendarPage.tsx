import React, { useState, useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useRealTimeCalendarEvents } from '@/hooks/useRealTimeCalendarEvents';
import { useTeamResources } from '@/hooks/useTeamResources';
import { useUnifiedStaffOperations } from '@/hooks/useUnifiedStaffOperations';
import { useCalendarImport } from '@/hooks/useCalendarImport';
import { useBackgroundImport } from '@/hooks/useBackgroundImport';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ArrowLeft, Calendar as CalendarIcon, List, RefreshCw, Sync } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CustomCalendar from '@/components/Calendar/CustomCalendar';
import SimpleStaffCurtain from '@/components/Calendar/SimpleStaffCurtain';
import StaffBookingsList from '@/components/Calendar/StaffBookingsList';
import MobileMonthlyCalendar from '@/components/Calendar/MobileMonthlyCalendar';
import MobileDayDetailView from '@/components/Calendar/MobileDayDetailView';
import { startOfWeek, startOfMonth } from 'date-fns';
import { forceFullBookingSync } from '@/services/bookingCalendarService';
import { toast } from 'sonner';

const CustomCalendarPage = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Mobile-specific state
  const [mobileView, setMobileView] = useState<'month' | 'day'>('month');
  const [selectedMobileDate, setSelectedMobileDate] = useState<Date>(new Date());
  
  // Background import service (runs automatically)
  const backgroundImport = useBackgroundImport();
  
  // Manual import service (for user-triggered refresh)
  const { isImporting, triggerImport } = useCalendarImport();
  
  // Real-time calendar events (these will update UI when background import updates DB)
  const {
    events,
    isLoading,
    isMounted,
    currentDate: hookCurrentDate,
    handleDatesSet,
    refreshEvents
  } = useRealTimeCalendarEvents();
  
  const { teamResources } = useTeamResources();
  
  // Week navigation state (for desktop) and month state (for mobile)
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    return startOfWeek(new Date(hookCurrentDate), { weekStartsOn: 1 });
  });

  const [currentMonthStart, setCurrentMonthStart] = useState(() => {
    return startOfMonth(new Date(hookCurrentDate));
  });

  // Use the unified staff operations hook
  const staffOps = useUnifiedStaffOperations(
    isMobile ? selectedMobileDate : currentWeekStart, 
    isMobile ? 'daily' : 'weekly'
  );

  // Staff curtain state - simplified with position
  const [staffCurtainOpen, setStaffCurtainOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<{
    resourceId: string;
    resourceTitle: string;
    targetDate: Date;
    position: { top: number; left: number };
  } | null>(null);

  // Handle manual refresh - only triggers manual import with user feedback
  const handleManualRefresh = async () => {
    console.log('CustomCalendarPage: Manual refresh triggered');
    const importResult = await triggerImport();
    if (importResult?.success) {
      await refreshEvents();
    }
  };

  // Handle force sync of bookings to calendar
  const handleForceSync = async () => {
    console.log('CustomCalendarPage: Force sync triggered');
    setIsSyncing(true);
    try {
      const syncedCount = await forceFullBookingSync();
      toast.success(`Synced ${syncedCount} confirmed bookings to calendar`);
      await refreshEvents(); // Refresh to show new events
    } catch (error) {
      console.error('Error during force sync:', error);
      toast.error('Failed to sync bookings to calendar');
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle opening staff curtain with position
  const handleOpenStaffSelection = (resourceId: string, resourceTitle: string, targetDate: Date, buttonElement?: HTMLElement) => {
    console.log('Opening staff curtain for:', { resourceId, resourceTitle, targetDate });
    
    // Calculate position relative to the button
    let position = { top: 100, left: 300 }; // Default fallback position
    
    if (buttonElement) {
      const rect = buttonElement.getBoundingClientRect();
      position = {
        top: rect.bottom + 5, // Position below the button
        left: Math.max(10, rect.left - 120) // Position to the left of button, with minimum margin
      };
      
      // Adjust if it would go off-screen
      if (position.left + 250 > window.innerWidth) {
        position.left = window.innerWidth - 260; // Keep some margin from right edge
      }
    }
    
    setSelectedTeam({ resourceId, resourceTitle, targetDate, position });
    setStaffCurtainOpen(true);
  };

  // Handle staff assignment from curtain
  const handleStaffAssigned = async (staffId: string, teamId: string) => {
    if (selectedTeam) {
      console.log('Assigning staff from curtain:', { staffId, teamId, team: selectedTeam });
      await staffOps.handleStaffDrop(staffId, teamId, selectedTeam.targetDate);
    }
  };

  // Close curtain
  const handleCloseCurtain = () => {
    setStaffCurtainOpen(false);
    setSelectedTeam(null);
  };

  // Mobile-specific handlers
  const handleMobileDayClick = (date: Date) => {
    setSelectedMobileDate(date);
    setMobileView('day');
  };

  const handleBackToMonth = () => {
    setMobileView('month');
  };

  const handleMobileMonthChange = (date: Date) => {
    setCurrentMonthStart(date);
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <TooltipProvider>
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
                <h1 className="text-2xl font-bold text-gray-900">Staff Calendar</h1>
              </div>
              
              <div className="flex items-center gap-2">
                {/* Force Sync Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleForceSync}
                  disabled={isSyncing}
                  className="flex items-center gap-2"
                >
                  <Sync className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  Sync Bookings
                </Button>
                
                {/* Manual refresh button - only shows loading when user manually refreshes */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleManualRefresh}
                  disabled={isImporting}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isImporting ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                
                {/* View Toggle - Hide on mobile when in day view */}
                {!isMobile || mobileView === 'month' ? (
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    <Button
                      variant={viewMode === 'calendar' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('calendar')}
                      className="flex items-center gap-2"
                    >
                      <CalendarIcon className="h-4 w-4" />
                      {isMobile ? 'Calendar' : 'Calendar View'}
                    </Button>
                    <Button
                      variant={viewMode === 'list' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('list')}
                      className="flex items-center gap-2"
                    >
                      <List className="h-4 w-4" />
                      {isMobile ? 'List' : 'List View'}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {viewMode === 'calendar' ? (
              <>
                {isMobile ? (
                  // Mobile Calendar Views
                  <>
                    {mobileView === 'month' ? (
                      <MobileMonthlyCalendar
                        events={events}
                        currentDate={currentMonthStart}
                        onDateChange={handleMobileMonthChange}
                        onDayClick={handleMobileDayClick}
                      />
                    ) : (
                      <MobileDayDetailView
                        selectedDate={selectedMobileDate}
                        events={events}
                        resources={teamResources}
                        onBack={handleBackToMonth}
                        onOpenStaffSelection={handleOpenStaffSelection}
                        weeklyStaffOperations={staffOps}
                      />
                    )}
                  </>
                ) : (
                  // Desktop Calendar View
                  <CustomCalendar
                    events={events}
                    resources={teamResources}
                    isLoading={isLoading}
                    isMounted={isMounted}
                    currentDate={currentWeekStart}
                    onDateSet={handleDatesSet}
                    refreshEvents={refreshEvents}
                    onStaffDrop={staffOps.handleStaffDrop}
                    onOpenStaffSelection={handleOpenStaffSelection}
                    viewMode="weekly"
                    weeklyStaffOperations={staffOps}
                  />
                )}
              </>
            ) : (
              <StaffBookingsList
                events={events}
                resources={teamResources}
                currentDate={isMobile ? selectedMobileDate : currentWeekStart}
                weeklyStaffOperations={staffOps}
                backgroundImport={backgroundImport}
              />
            )}
          </div>

          {/* Compact Staff Curtain - positioned relative to the + button */}
          {staffCurtainOpen && selectedTeam && (
            <SimpleStaffCurtain
              currentDate={selectedTeam.targetDate}
              onClose={handleCloseCurtain}
              onAssignStaff={handleStaffAssigned}
              selectedTeamId={selectedTeam.resourceId}
              selectedTeamName={selectedTeam.resourceTitle}
              availableStaff={staffOps.getAvailableStaffForDate(selectedTeam.targetDate)}
              position={selectedTeam.position}
            />
          )}
        </div>
      </TooltipProvider>
    </DndProvider>
  );
};

export default CustomCalendarPage;
