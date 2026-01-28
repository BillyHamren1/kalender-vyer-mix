import { Users, MapPin, FolderKanban, CheckCircle2, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanningStats } from "@/services/planningDashboardService";

interface PlanningStatsRowProps {
  stats: PlanningStats | undefined;
  isLoading: boolean;
}

const PlanningStatsRow = ({ stats, isLoading }: PlanningStatsRowProps) => {
  const statItems = [
    {
      label: "Tillgängliga idag",
      value: stats?.availableToday ?? 0,
      icon: Users,
      color: "text-green-600",
      bgColor: "bg-green-100"
    },
    {
      label: "På plats nu",
      value: stats?.workingNow ?? 0,
      icon: MapPin,
      color: "text-blue-600",
      bgColor: "bg-blue-100"
    },
    {
      label: "Pågående projekt",
      value: stats?.ongoingProjects ?? 0,
      icon: FolderKanban,
      color: "text-purple-600",
      bgColor: "bg-purple-100"
    },
    {
      label: "Rapporterat idag",
      value: stats?.completedToday ?? 0,
      icon: CheckCircle2,
      color: "text-amber-600",
      bgColor: "bg-amber-100"
    },
    {
      label: "Kommande rigg (7d)",
      value: stats?.upcomingRigs ?? 0,
      icon: Calendar,
      color: "text-primary",
      bgColor: "bg-primary/10"
    }
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {statItems.map((item) => (
        <Card key={item.label} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${item.bgColor}`}>
                <item.icon className={`w-5 h-5 ${item.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default PlanningStatsRow;
