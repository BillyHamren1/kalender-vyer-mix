import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWarehouseDashboard } from "@/hooks/useWarehouseDashboard";
import WarehouseStatsRow from "@/components/warehouse-dashboard/WarehouseStatsRow";
import UpcomingJobsTimeline from "@/components/warehouse-dashboard/UpcomingJobsTimeline";
import UrgentPackingsList from "@/components/warehouse-dashboard/UrgentPackingsList";
import ActivePackingsGrid from "@/components/warehouse-dashboard/ActivePackingsGrid";
import PackingTasksAttention from "@/components/warehouse-dashboard/PackingTasksAttention";


const WarehouseDashboard = () => {
  const {
    stats,
    upcomingJobs,
    urgentPackings,
    activePackings,
    tasksAttention,
    isLoading,
    isStatsLoading,
    isUpcomingLoading,
    isUrgentLoading,
    isActiveLoading,
    isTasksLoading,
    refetchAll
  } = useWarehouseDashboard();

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Lagerdashboard</h1>
            <p className="text-muted-foreground text-sm">
              Översikt över lagerlogistik och packningsarbete
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refetchAll}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Uppdatera
          </Button>
        </div>

        {/* Stats Row */}
        <div className="mb-6">
          <WarehouseStatsRow stats={stats} isLoading={isStatsLoading} />
        </div>

        {/* Timeline */}
        <div className="mb-6">
          <UpcomingJobsTimeline jobs={upcomingJobs} isLoading={isUpcomingLoading} />
        </div>

        {/* Urgent + Tasks grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <UrgentPackingsList packings={urgentPackings} isLoading={isUrgentLoading} />
          <PackingTasksAttention tasks={tasksAttention} isLoading={isTasksLoading} />
        </div>

        {/* Active Packings */}
        <div className="mb-6">
          <ActivePackingsGrid packings={activePackings} isLoading={isActiveLoading} />
        </div>
      </div>
    </div>
  );
};

export default WarehouseDashboard;
