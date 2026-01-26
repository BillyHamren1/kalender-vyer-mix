import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Package, User, CalendarDays } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";
import { ActivePacking } from "@/services/warehouseDashboardService";
import { useNavigate } from "react-router-dom";
import { PACKING_STATUS_LABELS, PACKING_STATUS_COLORS, PackingStatus } from "@/types/packing";

interface ActivePackingsGridProps {
  packings: ActivePacking[];
  isLoading: boolean;
}

const ActivePackingsGrid = ({ packings, isLoading }: ActivePackingsGridProps) => {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Package className="h-5 w-5 text-blue-500" />
            Aktiva packningar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Package className="h-5 w-5 text-blue-500" />
          Aktiva packningar
          {packings.length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {packings.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {packings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Inga aktiva packningar</p>
            <p className="text-xs">Packningar med status "Under arbete" visas här</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {packings.map(packing => {
              const progressPercent = packing.taskProgress.total > 0
                ? Math.round((packing.taskProgress.completed / packing.taskProgress.total) * 100)
                : 0;

              return (
                <div
                  key={packing.id}
                  onClick={() => navigate(`/warehouse/packing/${packing.id}`)}
                  className="p-4 rounded-lg border bg-card cursor-pointer hover:shadow-md transition-shadow"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{packing.name}</p>
                      {packing.client && (
                        <p className="text-xs text-muted-foreground truncate">{packing.client}</p>
                      )}
                    </div>
                    <Badge className={PACKING_STATUS_COLORS[packing.status as PackingStatus] || 'bg-gray-100 text-gray-800'}>
                      {PACKING_STATUS_LABELS[packing.status as PackingStatus] || packing.status}
                    </Badge>
                  </div>

                  {/* Meta info */}
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-3">
                    {packing.projectLeader && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {packing.projectLeader}
                      </span>
                    )}
                    {packing.rigDate && (
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {format(new Date(packing.rigDate), 'd MMM', { locale: sv })}
                      </span>
                    )}
                  </div>

                  {/* Progress */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Uppgifter</span>
                      <span className="font-medium">
                        {packing.taskProgress.completed}/{packing.taskProgress.total}
                        {packing.taskProgress.total > 0 && (
                          <span className="text-muted-foreground ml-1">
                            ({progressPercent}%)
                          </span>
                        )}
                      </span>
                    </div>
                    <Progress value={progressPercent} className="h-2" />
                  </div>

                  {/* Last updated */}
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Uppdaterad {formatDistanceToNow(new Date(packing.updatedAt), { addSuffix: true, locale: sv })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ActivePackingsGrid;
