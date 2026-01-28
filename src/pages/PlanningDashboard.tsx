import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlanningDashboard } from "@/hooks/usePlanningDashboard";
import PlanningStatsRow from "@/components/planning-dashboard/PlanningStatsRow";
import StaffLocationsCard from "@/components/planning-dashboard/StaffLocationsCard";
import OngoingProjectsCard from "@/components/planning-dashboard/OngoingProjectsCard";
import CompletedTodayCard from "@/components/planning-dashboard/CompletedTodayCard";
import AllStaffCard from "@/components/planning-dashboard/AllStaffCard";
import WeekProjectsView from "@/components/planning-dashboard/WeekProjectsView";
import UnopenedBookingsCard from "@/components/planning-dashboard/UnopenedBookingsCard";
import WeatherTrafficWidget from "@/components/planning-dashboard/WeatherTrafficWidget";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

const PlanningDashboard = () => {
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
  } = usePlanningDashboard();

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="min-h-screen bg-muted/30 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Planerings-Dashboard</h1>
            <p className="text-muted-foreground">
              {format(new Date(), "EEEE d MMMM yyyy", { locale: sv })}
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm"
            onClick={refetchAll}
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Uppdatera
          </Button>
        </div>

        {/* Stats Row */}
        <div className="mb-6">
          <PlanningStatsRow stats={stats} isLoading={isLoading} />
        </div>

        {/* AI Weather & Traffic Widget */}
        <div className="mb-6">
          <WeatherTrafficWidget />
        </div>

        {/* Week Planning - Projects View */}
        <div className="mb-6">
          <WeekProjectsView 
            projects={weekProjects}
            isLoading={isLoading}
            onStaffDrop={handleStaffDropToBooking}
          />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
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

          {/* Staff Locations */}
          <div className="lg:col-span-1">
            <StaffLocationsCard locations={staffLocations} isLoading={isLoading} />
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
      </div>
    </DndProvider>
  );
};

export default PlanningDashboard;
