import { Users, Clock, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface StaffMemberUtilization {
  id: string;
  name: string;
  hoursThisWeek: number;
  targetHours: number;
  utilizationPercent: number;
  activePackings: number;
}

interface WarehouseStaffUtilizationCardProps {
  staff: StaffMemberUtilization[];
  isLoading: boolean;
  weekNumber: string;
}

const getUtilizationColor = (percent: number) => {
  if (percent >= 90) return 'text-primary';
  if (percent >= 70) return 'text-warehouse';
  if (percent >= 50) return 'text-amber-600';
  return 'text-muted-foreground';
};

const getUtilizationBg = (percent: number) => {
  if (percent >= 90) return 'bg-primary/10';
  if (percent >= 70) return 'bg-warehouse/10';
  if (percent >= 50) return 'bg-amber-100';
  return 'bg-muted/50';
};

const WarehouseStaffUtilizationCard = ({ staff, isLoading, weekNumber }: WarehouseStaffUtilizationCardProps) => {
  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Users className="w-4 h-4 text-warehouse" />
            Lagerpersonal vecka {weekNumber}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const totalHours = staff.reduce((sum, s) => sum + s.hoursThisWeek, 0);
  const totalTarget = staff.reduce((sum, s) => sum + s.targetHours, 0);
  const overallUtilization = totalTarget > 0 ? Math.round((totalHours / totalTarget) * 100) : 0;

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Users className="w-4 h-4 text-warehouse" />
            Lagerpersonal vecka {weekNumber}
          </CardTitle>
          <Badge 
            variant="secondary" 
            className={`${getUtilizationBg(overallUtilization)} ${getUtilizationColor(overallUtilization)}`}
          >
            {overallUtilization}% beläggning
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {staff.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6 px-4">
            Ingen lagerpersonal registrerad
          </p>
        ) : (
          <ScrollArea className="h-[280px]">
            <div className="px-4 pb-4 space-y-2">
              {staff.map((member) => (
                <div
                  key={member.id}
                  className="p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-warehouse/20 flex items-center justify-center shrink-0">
                        <span className="text-xs font-medium text-warehouse">
                          {member.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </span>
                      </div>
                      <span className="font-medium text-sm truncate">{member.name}</span>
                    </div>
                    {member.activePackings > 0 && (
                      <Badge variant="outline" className="text-xs shrink-0 border-warehouse/30 text-warehouse">
                        {member.activePackings} aktiva
                      </Badge>
                    )}
                  </div>
                  
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {member.hoursThisWeek}h / {member.targetHours}h
                      </span>
                      <span className={getUtilizationColor(member.utilizationPercent)}>
                        {member.utilizationPercent}%
                      </span>
                    </div>
                    <Progress 
                      value={Math.min(member.utilizationPercent, 100)} 
                      className="h-1.5" 
                    />
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default WarehouseStaffUtilizationCard;
