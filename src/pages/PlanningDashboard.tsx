import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlanningDashboard } from "@/hooks/usePlanningDashboard";
import PlanningStatsRow from "@/components/planning-dashboard/PlanningStatsRow";
import StaffLocationsCard from "@/components/planning-dashboard/StaffLocationsCard";
import AvailableStaffCard from "@/components/planning-dashboard/AvailableStaffCard";
import OngoingProjectsCard from "@/components/planning-dashboard/OngoingProjectsCard";
import CompletedTodayCard from "@/components/planning-dashboard/CompletedTodayCard";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

const PlanningDashboard = () => {
  const {
    stats,
    staffLocations,
    availableStaff,
    ongoingProjects,
    completedToday,
    isLoading,
    refetchAll
  } = usePlanningDashboard();

  return (
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

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Staff */}
        <div className="space-y-6">
          <StaffLocationsCard locations={staffLocations} isLoading={isLoading} />
          <AvailableStaffCard staff={availableStaff} isLoading={isLoading} />
        </div>

        {/* Center Column - Projects */}
        <div className="lg:col-span-1">
          <OngoingProjectsCard projects={ongoingProjects} isLoading={isLoading} />
        </div>

        {/* Right Column - Completed */}
        <div>
          <CompletedTodayCard completed={completedToday} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
};

export default PlanningDashboard;
