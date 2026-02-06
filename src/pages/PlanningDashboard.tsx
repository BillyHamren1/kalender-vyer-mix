import { useState } from "react";
import { LayoutDashboard, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { format, startOfWeek, addWeeks, subWeeks, addDays, subDays, addMonths, subMonths } from "date-fns";
import { sv } from "date-fns/locale";

import { useDashboardEvents, useDashboardStats, EventCategory, DashboardViewMode } from "@/hooks/useDashboardEvents";
import DashboardAlertWidgets from "@/components/dashboard/DashboardAlertWidgets";
import DashboardFilters from "@/components/dashboard/DashboardFilters";
import DashboardWeekView from "@/components/dashboard/DashboardWeekView";
import DashboardDayView from "@/components/dashboard/DashboardDayView";
import DashboardMonthView from "@/components/dashboard/DashboardMonthView";

const PlanningDashboard = () => {
  const [viewMode, setViewMode] = useState<DashboardViewMode>('week');
  const [activeCategories, setActiveCategories] = useState<EventCategory[]>(['planning', 'warehouse', 'logistics']);
  const [currentDate, setCurrentDate] = useState(new Date());

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });

  const { events, isLoading, refetchAll } = useDashboardEvents(viewMode, currentDate, activeCategories);
  const { data: stats, isLoading: statsLoading } = useDashboardStats();

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

      {/* Alert Widgets */}
      <div className="mb-4">
        <DashboardAlertWidgets stats={stats} isLoading={statsLoading} />
      </div>

      {/* Filters */}
      <div className="mb-4">
        <DashboardFilters
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          activeCategories={activeCategories}
          onCategoriesChange={setActiveCategories}
        />
      </div>

      {/* Calendar View */}
      <div className="mb-6">
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
    </PageContainer>
  );
};

export default PlanningDashboard;
