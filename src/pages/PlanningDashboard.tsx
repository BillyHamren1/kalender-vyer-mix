import { LayoutDashboard, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlanningDashboard } from "@/hooks/usePlanningDashboard";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";

import OngoingProjectsCard from "@/components/planning-dashboard/OngoingProjectsCard";
import CompletedTodayCard from "@/components/planning-dashboard/CompletedTodayCard";
import AllStaffCard from "@/components/planning-dashboard/AllStaffCard";
import WeekProjectsView from "@/components/planning-dashboard/WeekProjectsView";
import UnopenedBookingsCard from "@/components/planning-dashboard/UnopenedBookingsCard";
import { format, startOfWeek, addWeeks, subWeeks } from "date-fns";
import { sv } from "date-fns/locale";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { useState } from "react";

const PlanningDashboard = () => {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => 
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );

  const {
    stats,
    staffLocations,
    ongoingProjects,
    completedToday,
    allStaff,
    weekProjects,
    unopenedBookings,
    isLoading,
    refetchAll,
    handleToggleStaffActive,
    handleStaffDropToBooking
  } = usePlanningDashboard(currentWeekStart);

  const goToPreviousWeek = () => setCurrentWeekStart(prev => subWeeks(prev, 1));
  const goToNextWeek = () => setCurrentWeekStart(prev => addWeeks(prev, 1));
  const goToCurrentWeek = () => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  return (
    <DndProvider backend={HTML5Backend}>
      <PageContainer>
        {/* Header */}
        <PageHeader
          icon={LayoutDashboard}
          title="Planerings-Dashboard"
          subtitle={format(new Date(), "EEEE d MMMM yyyy", { locale: sv })}
        >
          <Button 
            variant="outline" 
            size="sm"
            onClick={refetchAll}
            disabled={isLoading}
            className="rounded-xl"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Uppdatera
          </Button>
        </PageHeader>

        {/* Week Planning - Projects View */}
        <div className="mb-6">
          <WeekProjectsView 
            projects={weekProjects}
            weekStart={currentWeekStart}
            onPreviousWeek={goToPreviousWeek}
            onNextWeek={goToNextWeek}
            onCurrentWeek={goToCurrentWeek}
            isLoading={isLoading}
            onStaffDrop={handleStaffDropToBooking}
          />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Unopened Bookings - First Column */}
          <div className="lg:col-span-1">
            <UnopenedBookingsCard 
              bookings={unopenedBookings}
              isLoading={isLoading}
            />
          </div>

          {/* Staff Column with Toggle */}
          <div className="lg:col-span-1">
            <AllStaffCard 
              staff={allStaff}
              isLoading={isLoading}
              onToggleActive={handleToggleStaffActive}
            />
          </div>

          {/* Projects */}
          <div className="lg:col-span-1">
            <OngoingProjectsCard projects={ongoingProjects} isLoading={isLoading} />
          </div>

          {/* Completed */}
          <div className="lg:col-span-1">
            <CompletedTodayCard completed={completedToday} isLoading={isLoading} />
          </div>
        </div>
      </PageContainer>
    </DndProvider>
  );
};

export default PlanningDashboard;
