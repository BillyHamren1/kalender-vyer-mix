import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Package, AlertTriangle, Clock } from "lucide-react";
import { WarehouseStats } from "@/services/warehouseDashboardService";

interface WarehouseStatsRowProps {
  stats: WarehouseStats;
  isLoading: boolean;
}

const StatCard = ({ 
  icon: Icon, 
  label, 
  value, 
  colorClass,
  isLoading 
}: { 
  icon: React.ElementType;
  label: string; 
  value: number;
  colorClass: string;
  isLoading: boolean;
}) => (
  <Card className="bg-card border-border">
    <CardContent className="p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          {isLoading ? (
            <>
              <Skeleton className="h-8 w-12 mb-1" />
              <Skeleton className="h-4 w-20" />
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-foreground">{value}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </>
          )}
        </div>
      </div>
    </CardContent>
  </Card>
);

const WarehouseStatsRow = ({ stats, isLoading }: WarehouseStatsRowProps) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon={CalendarDays}
        label="Kommande jobb"
        value={stats.upcomingJobs}
        colorClass="bg-warehouse/10 text-warehouse"
        isLoading={isLoading}
      />
      <StatCard
        icon={Package}
        label="Aktiva packningar"
        value={stats.activePackings}
        colorClass="bg-blue-100 text-blue-600"
        isLoading={isLoading}
      />
      <StatCard
        icon={AlertTriangle}
        label="Akuta packningar"
        value={stats.urgentPackings}
        colorClass="bg-orange-100 text-orange-600"
        isLoading={isLoading}
      />
      <StatCard
        icon={Clock}
        label="Förfallna uppgifter"
        value={stats.overdueTasks}
        colorClass="bg-red-100 text-red-600"
        isLoading={isLoading}
      />
    </div>
  );
};

export default WarehouseStatsRow;
