import { CheckCircle2, Clock, User, FolderKanban, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { CompletedToday } from "@/services/planningDashboardService";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface CompletedTodayCardProps {
  completed: CompletedToday[];
  isLoading: boolean;
}

const typeIcons = {
  project: FolderKanban,
  task: CheckCircle2,
  time_report: Clock
};

const typeLabels = {
  project: 'Projekt',
  task: 'Uppgift',
  time_report: 'Tidrapport'
};

const typeColors = {
  project: 'bg-purple-100 text-purple-800',
  task: 'bg-green-100 text-green-800',
  time_report: 'bg-blue-100 text-blue-800'
};

const CompletedTodayCard = ({ completed, isLoading }: CompletedTodayCardProps) => {
  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            Avslutats idag
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          Avslutats idag ({completed.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[300px] px-6 pb-6">
          {completed.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Inget avslutat idag ännu
            </p>
          ) : (
            <div className="space-y-2">
              {completed.map((item) => {
                const Icon = typeIcons[item.type];
                return (
                  <div 
                    key={item.id}
                    className="p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-1.5 rounded ${typeColors[item.type]}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium">{item.title}</p>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {format(item.completedAt, 'HH:mm', { locale: sv })}
                          </span>
                        </div>
                        {item.details && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                            {item.details}
                          </p>
                        )}
                        {item.staffName && (
                          <div className="flex items-center gap-1 mt-1">
                            <User className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">{item.staffName}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default CompletedTodayCard;
