import { Users, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const totalHours = staff.reduce((sum, s) => sum + s.hoursThisWeek, 0);
  const totalTarget = staff.reduce((sum, s) => sum + s.targetHours, 0);
  const overallUtilization = totalTarget > 0 ? Math.round((totalHours / totalTarget) * 100) : 0;

  return (
    <div className="h-full rounded-2xl border border-border/40 shadow-2xl bg-card overflow-hidden">
      <div className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shadow-md shadow-warehouse/15"
              style={{ background: 'linear-gradient(135deg, hsl(38 92% 55%) 0%, hsl(32 95% 40%) 100%)' }}
            >
              <Users className="w-4.5 h-4.5 text-white" />
            </div>
            <h3 className="font-semibold text-lg text-[hsl(var(--heading))]">
              Personal v.{weekNumber}
            </h3>
          </div>
          {!isLoading && (
            <Badge
              variant="secondary"
              className={`${getUtilizationBg(overallUtilization)} ${getUtilizationColor(overallUtilization)}`}
            >
              {overallUtilization}%
            </Badge>
          )}
        </div>
      </div>
      <div className="px-0">
        {isLoading ? (
          <div className="px-5 pb-5 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : staff.length === 0 ? (
          <p className="text-[0.925rem] text-muted-foreground text-center py-6 px-4">
            Ingen lagerpersonal registrerad
          </p>
        ) : (
          <ScrollArea className="h-[280px]">
            <div className="px-5 pb-5 space-y-2">
              {staff.map((member) => (
                <div
                  key={member.id}
                  className="p-4 rounded-xl border border-border/30 bg-background/60 backdrop-blur-sm"
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
      </div>
    </div>
  );
};

export default WarehouseStaffUtilizationCard;
