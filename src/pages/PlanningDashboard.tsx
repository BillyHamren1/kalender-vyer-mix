import { useState } from "react";
import { LayoutDashboard, RefreshCw, MessageSquare, PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { format, startOfWeek, addWeeks, subWeeks, addDays, subDays, addMonths, subMonths } from "date-fns";
import { sv } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { useCalendarImport } from "@/hooks/useCalendarImport";
import { useStaffDashboard } from "@/hooks/useStaffDashboard";
import MessagesFeed from "@/components/staff-dashboard/MessagesFeed";
import { cn } from "@/lib/utils";

import { useDashboardEvents, EventCategory, DashboardViewMode } from "@/hooks/useDashboardEvents";
import DashboardWeekView from "@/components/dashboard/DashboardWeekView";
import DashboardDayView from "@/components/dashboard/DashboardDayView";
import DashboardMonthView from "@/components/dashboard/DashboardMonthView";
import DashboardNewBookings from "@/components/dashboard/DashboardNewBookings";
import DashboardUpdatedBookings from "@/components/dashboard/DashboardUpdatedBookings";
import DashboardCancelledBookings from "@/components/dashboard/DashboardCancelledBookings";
import DashboardAllProjects from "@/components/dashboard/DashboardAllProjects";

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
  const [commOpen, setCommOpen] = useState(false);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });

  const { events, isLoading, refetchAll } = useDashboardEvents(viewMode, currentDate, activeCategories);
  const { isImporting, triggerImport } = useCalendarImport();
  const { messages, isLoadingMessages } = useStaffDashboard();


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
    <div className="flex h-full min-h-0 theme-purple">
      {/* Main content */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <PageContainer>
          <PageHeader
            icon={LayoutDashboard}
            title="Planeringsdashboard"
            variant="purple"
            subtitle={format(new Date(), "EEEE d MMMM yyyy", { locale: sv })}
          >
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={async () => { 
                  await triggerImport(); 
                  refetchAll();
                  queryClient.invalidateQueries({ queryKey: ['bookings-without-project'] });
                  queryClient.invalidateQueries({ queryKey: ['bookings'] });
                  queryClient.invalidateQueries({ queryKey: ['all-bookings'] });
                  queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
                }}
                disabled={isImporting || isLoading}
                className="rounded-xl"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isImporting || isLoading ? 'animate-spin' : ''}`} />
                Uppdatera
              </Button>
              <Button
                variant={commOpen ? "default" : "outline"}
                size="sm"
                onClick={() => setCommOpen(prev => !prev)}
                className="rounded-xl"
              >
                {commOpen ? <PanelRightClose className="w-4 h-4 mr-2" /> : <PanelRightOpen className="w-4 h-4 mr-2" />}
                <MessageSquare className="w-4 h-4 mr-1" />
                Kommunikation
              </Button>
            </div>
          </PageHeader>

          {/* Cancelled Bookings */}
          <div className="mb-4">
            <DashboardCancelledBookings />
          </div>

          {/* New Bookings */}
          <div className="mb-4">
            <DashboardNewBookings
              onCreateProject={handleCreateProject}
              onCreateLargeProject={handleCreateLargeProject}
            />
          </div>

          {/* Updated Bookings */}
          <div className="mb-4">
            <DashboardUpdatedBookings />
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
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                activeCategories={activeCategories}
                onCategoriesChange={setActiveCategories}
              />
            )}
            {viewMode === 'day' && (
              <DashboardDayView
                events={events}
                currentDate={currentDate}
                onPreviousDay={goToPreviousDay}
                onNextDay={goToNextDay}
                isLoading={isLoading}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                activeCategories={activeCategories}
                onCategoriesChange={setActiveCategories}
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
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                activeCategories={activeCategories}
                onCategoriesChange={setActiveCategories}
              />
            )}
          </div>

          {/* Alla projekt */}
          <div className="mb-6">
            <DashboardAllProjects />
          </div>
        </PageContainer>
      </div>

      {/* Collapsible Communication Sidebar */}
      <div
        className={cn(
          "shrink-0 border-l border-border bg-card flex flex-col transition-all duration-300 ease-in-out overflow-hidden",
          commOpen ? "w-80" : "w-0"
        )}
      >
        {commOpen && (
          <div className="flex flex-col h-full min-w-[320px]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">Kommunikation</h2>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCommOpen(false)}>
                <PanelRightClose className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <MessagesFeed messages={messages} isLoading={isLoadingMessages} />
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateTodoWizard
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
    </div>
  );
};

export default PlanningDashboard;
