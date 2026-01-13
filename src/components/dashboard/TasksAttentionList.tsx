import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, isToday, isTomorrow } from "date-fns";
import { sv } from "date-fns/locale";
import { AttentionTask } from "@/services/dashboardService";

interface TasksAttentionListProps {
  tasks: AttentionTask[];
  isLoading: boolean;
}

const formatDeadline = (date: Date): string => {
  if (isToday(date)) return 'Idag';
  if (isTomorrow(date)) return 'Imorgon';
  return format(date, 'd MMM', { locale: sv });
};

export const TasksAttentionList: React.FC<TasksAttentionListProps> = ({ tasks, isLoading }) => {
  const navigate = useNavigate();
  
  const overdueTasks = tasks.filter(t => t.isOverdue);
  const upcomingTasks = tasks.filter(t => !t.isOverdue);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Uppgifter som kräver uppmärksamhet
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (tasks.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Uppgifter som kräver uppmärksamhet
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-2 opacity-20" />
            <p>Inga uppgifter med deadline de närmaste dagarna</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Uppgifter som kräver uppmärksamhet
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate('/projects')}>
            Alla <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {overdueTasks.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-destructive mb-2 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" />
              Förfallna ({overdueTasks.length})
            </h4>
            <div className="space-y-1">
              {overdueTasks.slice(0, 3).map(task => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-destructive/10 border border-destructive/20 cursor-pointer hover:bg-destructive/15 transition-colors"
                  onClick={() => navigate(`/project/${task.projectId}`)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{task.projectName}</p>
                  </div>
                  <span className="text-xs text-destructive font-medium ml-2">
                    {formatDeadline(task.deadline)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {upcomingTasks.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">
              Kommande (3 dagar)
            </h4>
            <div className="space-y-1">
              {upcomingTasks.slice(0, 3).map(task => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50 border border-border cursor-pointer hover:bg-muted transition-colors"
                  onClick={() => navigate(`/project/${task.projectId}`)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{task.projectName}</p>
                  </div>
                  <span className="text-xs text-muted-foreground ml-2">
                    {formatDeadline(task.deadline)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
