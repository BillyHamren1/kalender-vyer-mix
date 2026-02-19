import { useState } from "react";
import { LayoutDashboard, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { format, startOfWeek, addWeeks, subWeeks, addDays, subDays, addMonths, subMonths } from "date-fns";
import { sv } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";

import { useDashboardEvents, EventCategory, DashboardViewMode } from "@/hooks/useDashboardEvents";
import DashboardFilters from "@/components/dashboard/DashboardFilters";
import DashboardWeekView from "@/components/dashboard/DashboardWeekView";
import DashboardDayView from "@/components/dashboard/DashboardDayView";
import DashboardMonthView from "@/components/dashboard/DashboardMonthView";
import DashboardNewBookings from "@/components/dashboard/DashboardNewBookings";
import DashboardAllBookings from "@/components/dashboard/DashboardAllBookings";

import CreateProjectWizard from "@/components/project/CreateProjectWizard";
import { AddToLargeProjectDialog } from "@/components/project/AddToLargeProjectDialog";

const PlanningDashboard = () => {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<DashboardViewMode>('week');
  const [activeCategories, setActiveCategories] = useState<EventCategory[]>(['planning', 'warehouse', 'logistics']);
  const [currentDate, setCurrentDate] = useState(new Date());

  // Wizard / dialog state for triage
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [largeProjectBookingId, setLargeProjectBookingId] = useState<string | null>(null);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });

  const { events, isLoading, refetchAll } = useDashboardEvents(viewMode, currentDate, activeCategories);
  

  // Navigation handlers
  const goToPreviousWeek = () => setCurrentDate(prev => subWeeks(prev, 1));
  const goToNextWeek = () => setCurrentDate(prev => addWeeks(prev, 1));
  const goToPreviousDay = () => setCurrentDate(prev => subDays(prev, 1));
  const goToNextDay = () => setCurrentDate(prev => addDays(prev, 1));
  const goToPreviousMonth = () => setCurrentDate(prev => subMonths(prev, 1));
  const goToNextMonth = () => setCurrentDate(prev => addMonths(prev, 1));

  const handleDayClickFromMonth = (date: Date) => {
    setCurrentDate(date);
    setViewMode('day');
  };

  const handleCreateProject = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    setIsCreateOpen(true);
  };

  const handleCreateLargeProject = (bookingId: string) => {
    setLargeProjectBookingId(bookingId);
  };

  return (
    <PageContainer>
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        subtitle={format(new Date(), "EEEE d MMMM yyyy", { locale: sv })}
      >
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => { refetchAll(); }}
          disabled={isLoading}
          className="rounded-xl"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Uppdatera
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="mb-4">
        <DashboardFilters
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          activeCategories={activeCategories}
          onCategoriesChange={setActiveCategories}
        />
      </div>


      {/* New Bookings - above calendar, full width */}
      <div className="mb-4">
        <DashboardNewBookings
          onCreateProject={handleCreateProject}
          onCreateLargeProject={handleCreateLargeProject}
        />
      </div>

      {/* Calendar View */}
      <div className="mb-6 min-w-0 overflow-hidden">
        {viewMode === 'week' && (
          <DashboardWeekView
            events={events}
            weekStart={weekStart}
            onPreviousWeek={goToPreviousWeek}
            onNextWeek={goToNextWeek}
            isLoading={isLoading}
          />
        )}
        {viewMode === 'day' && (
          <DashboardDayView
            events={events}
            currentDate={currentDate}
            onPreviousDay={goToPreviousDay}
            onNextDay={goToNextDay}
            isLoading={isLoading}
          />
        )}
        {viewMode === 'month' && (
          <DashboardMonthView
            events={events}
            currentDate={currentDate}
            onPreviousMonth={goToPreviousMonth}
            onNextMonth={goToNextMonth}
            onDayClick={handleDayClickFromMonth}
            isLoading={isLoading}
          />
        )}
      </div>

      {/* Alla bokningar */}
      <div className="mb-6">
        <DashboardAllBookings />
      </div>

      {/* Dialogs */}
      <CreateProjectWizard
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        preselectedBookingId={selectedBookingId}
        onSuccess={() => {
          setIsCreateOpen(false);
          setSelectedBookingId(null);
          queryClient.invalidateQueries({ queryKey: ['projects'] });
          queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        }}
      />

      <AddToLargeProjectDialog
        open={!!largeProjectBookingId}
        onOpenChange={(open) => !open && setLargeProjectBookingId(null)}
        bookingId={largeProjectBookingId || ''}
      />
    </PageContainer>
  );
};

export default PlanningDashboard;
