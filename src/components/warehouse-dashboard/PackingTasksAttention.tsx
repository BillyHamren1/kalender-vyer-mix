import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { PackingTask } from "@/services/warehouseDashboardService";
import { useNavigate } from "react-router-dom";

interface PackingTasksAttentionProps {
  tasks: PackingTask[];
  isLoading: boolean;
}

const PackingTasksAttention = ({ tasks, isLoading }: PackingTasksAttentionProps) => {
  const navigate = useNavigate();

  // Separate overdue and upcoming tasks
  const overdueTasks = tasks.filter(t => t.isOverdue);
  const upcomingTasks = tasks.filter(t => !t.isOverdue);

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="h-5 w-5 text-red-500" />
            Uppgifter att åtgärda
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="h-5 w-5 text-red-500" />
          Uppgifter att åtgärda
          {tasks.length > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {tasks.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p className="text-sm">Inga förfallna uppgifter</p>
            <p className="text-xs">Bra jobbat! Alla uppgifter är under kontroll.</p>
          </div>
        ) : (
          <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
            {/* Overdue tasks */}
            {overdueTasks.length > 0 && (
              <div>
                <p className="text-xs font-medium text-red-600 mb-2 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Förfallna ({overdueTasks.length})
                </p>
                <div className="space-y-2">
                  {overdueTasks.map(task => (
                    <TaskItem 
                      key={task.id} 
                      task={task} 
                      isOverdue={true}
                      onClick={() => navigate(`/warehouse/packing/${task.packingId}`)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming tasks */}
            {upcomingTasks.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Kommande ({upcomingTasks.length})
                </p>
                <div className="space-y-2">
                  {upcomingTasks.map(task => (
                    <TaskItem 
                      key={task.id} 
                      task={task} 
                      isOverdue={false}
                      onClick={() => navigate(`/warehouse/packing/${task.packingId}`)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const TaskItem = ({ 
  task, 
  isOverdue, 
  onClick 
}: { 
  task: PackingTask; 
  isOverdue: boolean;
  onClick: () => void;
}) => {
  const getDaysText = () => {
    if (task.daysUntilDeadline === null) return '';
    if (task.daysUntilDeadline === 0) return 'Idag';
    if (task.daysUntilDeadline === 1) return 'Imorgon';
    if (task.daysUntilDeadline < 0) return `${Math.abs(task.daysUntilDeadline)} dagar sedan`;
    return `Om ${task.daysUntilDeadline} dagar`;
  };

  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-lg border cursor-pointer hover:shadow-sm transition-shadow ${
        isOverdue 
          ? 'border-red-200 bg-red-50' 
          : 'border-border bg-card'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium truncate ${isOverdue ? 'text-red-800' : 'text-foreground'}`}>
            {task.title}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {task.packingName}
          </p>
        </div>
        <div className="text-right flex-shrink-0 ml-2">
          <Badge 
            variant="outline" 
            className={isOverdue ? 'border-red-300 text-red-700 bg-red-100' : ''}
          >
            {getDaysText()}
          </Badge>
          {task.deadline && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {format(new Date(task.deadline), 'd MMM', { locale: sv })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PackingTasksAttention;
