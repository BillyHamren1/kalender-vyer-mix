import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Clock, CalendarDays } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { UrgentPacking } from "@/services/warehouseDashboardService";
import { useNavigate } from "react-router-dom";

interface UrgentPackingsListProps {
  packings: UrgentPacking[];
  isLoading: boolean;
}

const getUrgencyBadge = (level: UrgentPacking['urgencyLevel']) => {
  switch (level) {
    case 'critical':
      return <Badge className="bg-red-500 text-white">Kritisk</Badge>;
    case 'urgent':
      return <Badge className="bg-orange-500 text-white">Akut</Badge>;
    case 'approaching':
      return <Badge className="bg-yellow-500 text-white">Närmar sig</Badge>;
    default:
      return <Badge variant="secondary">Normal</Badge>;
  }
};

const getUrgencyBorder = (level: UrgentPacking['urgencyLevel']) => {
  switch (level) {
    case 'critical':
      return 'border-l-4 border-l-red-500';
    case 'urgent':
      return 'border-l-4 border-l-orange-500';
    case 'approaching':
      return 'border-l-4 border-l-yellow-500';
    default:
      return 'border-l-4 border-l-gray-300';
  }
};

const UrgentPackingsList = ({ packings, isLoading }: UrgentPackingsListProps) => {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Akuta packningar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          Akuta packningar
          {packings.length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {packings.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {packings.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Inga akuta packningar</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {packings.map(packing => {
              const progressPercent = packing.taskProgress.total > 0
                ? Math.round((packing.taskProgress.completed / packing.taskProgress.total) * 100)
                : 0;

              return (
                <div
                  key={packing.id}
                  onClick={() => navigate(`/warehouse/packing/${packing.id}`)}
                  className={`p-3 rounded-lg border bg-card cursor-pointer hover:shadow-md transition-shadow ${getUrgencyBorder(packing.urgencyLevel)}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{packing.name}</p>
                      {packing.client && (
                        <p className="text-xs text-muted-foreground truncate">{packing.client}</p>
                      )}
                    </div>
                    {getUrgencyBadge(packing.urgencyLevel)}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {packing.daysUntilRig === 0 ? 'Idag' : 
                       packing.daysUntilRig === 1 ? 'Imorgon' :
                       `${packing.daysUntilRig} dagar`}
                    </span>
                    {packing.rigDate && (
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {format(new Date(packing.rigDate), 'd MMM', { locale: sv })}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>Framsteg</span>
                      <span>{packing.taskProgress.completed}/{packing.taskProgress.total}</span>
                    </div>
                    <Progress value={progressPercent} className="h-1.5" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default UrgentPackingsList;
