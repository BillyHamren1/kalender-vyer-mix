import { 
  Eye, 
  FolderKanban, 
  Package, 
  Truck, 
  Users, 
  Calendar 
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardStats } from "@/hooks/useDashboardEvents";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface DashboardAlertWidgetsProps {
  stats: DashboardStats | undefined;
  isLoading: boolean;
}

const DashboardAlertWidgets = ({ stats, isLoading }: DashboardAlertWidgetsProps) => {
  const navigate = useNavigate();

  const widgets = [
    {
      label: "Oöppnade bokningar",
      value: stats?.unopenedBookings ?? 0,
      icon: Eye,
      bgClass: "bg-destructive/10",
      iconClass: "text-destructive",
      urgent: (stats?.unopenedBookings ?? 0) > 0,
      onClick: () => navigate('/booking-list'),
    },
    {
      label: "Pågående projekt",
      value: stats?.ongoingProjects ?? 0,
      icon: FolderKanban,
      bgClass: "bg-primary/10",
      iconClass: "text-primary",
      onClick: () => navigate('/projects'),
    },
    {
      label: "Aktiva packningar",
      value: stats?.activePackings ?? 0,
      icon: Package,
      bgClass: "bg-warehouse/10",
      iconClass: "text-warehouse",
      onClick: () => navigate('/warehouse/packing'),
    },
    {
      label: "Transport idag",
      value: stats?.transportToday ?? 0,
      icon: Truck,
      bgClass: "bg-secondary/10",
      iconClass: "text-secondary",
      onClick: () => navigate('/logistics/planning'),
    },
    {
      label: "Aktiv personal",
      value: stats?.availableStaff ?? 0,
      icon: Users,
      bgClass: "bg-primary/10",
      iconClass: "text-primary",
      onClick: () => navigate('/staff-management'),
    },
    {
      label: "Rigg inom 7d",
      value: stats?.upcomingRigs ?? 0,
      icon: Calendar,
      bgClass: "bg-planning-rig/40",
      iconClass: "text-planning-rig-foreground",
      urgent: (stats?.upcomingRigs ?? 0) > 3,
      onClick: () => navigate('/calendar'),
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-3">
              <Skeleton className="h-14 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {widgets.map((w) => (
        <Card
          key={w.label}
          className={cn(
            "cursor-pointer hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 border",
            w.urgent && "border-destructive/30 shadow-destructive/10"
          )}
          onClick={w.onClick}
        >
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", w.bgClass)}>
                <w.icon className={cn("w-4 h-4", w.iconClass)} />
              </div>
              <div className="min-w-0">
                <p className={cn(
                  "text-xl font-bold tabular-nums",
                  w.urgent && "text-destructive"
                )}>
                  {w.value}
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight truncate">{w.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default DashboardAlertWidgets;
