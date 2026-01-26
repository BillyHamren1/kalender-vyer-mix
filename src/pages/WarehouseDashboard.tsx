import { Link } from "react-router-dom";
import { Calendar, Package, Boxes, Wrench, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWarehouseDashboard } from "@/hooks/useWarehouseDashboard";
import WarehouseStatsRow from "@/components/warehouse-dashboard/WarehouseStatsRow";
import UpcomingJobsTimeline from "@/components/warehouse-dashboard/UpcomingJobsTimeline";
import UrgentPackingsList from "@/components/warehouse-dashboard/UrgentPackingsList";
import ActivePackingsGrid from "@/components/warehouse-dashboard/ActivePackingsGrid";
import PackingTasksAttention from "@/components/warehouse-dashboard/PackingTasksAttention";

const quickLinks = [
  {
    title: "Personalplanering",
    description: "Lagerkalender",
    icon: Calendar,
    path: "/warehouse/calendar",
    color: "text-warehouse bg-warehouse/10"
  },
  {
    title: "Planera packning",
    description: "Alla packningar",
    icon: Package,
    path: "/warehouse/packing",
    color: "text-orange-600 bg-orange-100"
  },
  {
    title: "Inventarier",
    description: "Lagerartiklar",
    icon: Boxes,
    path: "/warehouse/inventory",
    color: "text-green-600 bg-green-100"
  },
  {
    title: "Service",
    description: "Underhåll",
    icon: Wrench,
    path: "/warehouse/service",
    color: "text-purple-600 bg-purple-100"
  }
];

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

        {/* Quick Links */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {quickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link key={link.path} to={link.path}>
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:shadow-md transition-shadow cursor-pointer">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${link.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{link.title}</p>
                    <p className="text-xs text-muted-foreground">{link.description}</p>
                  </div>
                </div>
              </Link>
            );
          })}
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
