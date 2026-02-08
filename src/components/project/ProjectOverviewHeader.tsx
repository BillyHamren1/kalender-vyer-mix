import { useMemo } from "react";
import { CheckCircle2, ListTodo, FileText, MessageSquare, Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ProjectTask } from "@/types/project";
import { ProjectActivity } from "@/services/projectActivityService";
import { formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";

interface ProjectOverviewHeaderProps {
  tasks: ProjectTask[];
  filesCount: number;
  commentsCount: number;
  activities: ProjectActivity[];
}

const ACTION_ICONS: Record<string, string> = {
  status_changed: '🔄',
  task_added: '➕',
  task_completed: '✅',
  task_deleted: '🗑️',
  comment_added: '💬',
  file_uploaded: '📎',
  file_deleted: '📁',
};

const ProjectOverviewHeader = ({ tasks, filesCount, commentsCount, activities }: ProjectOverviewHeaderProps) => {
  const completedTasks = useMemo(() => tasks.filter(t => t.completed).length, [tasks]);
  const totalTasks = tasks.length;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const recentActivities = activities.slice(0, 3);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      {/* Task Progress */}
      <Card className="border-border/40 shadow-2xl rounded-2xl">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'var(--gradient-icon)', boxShadow: 'var(--shadow-icon)' }}
              >
                <ListTodo className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-sm font-semibold text-foreground tracking-tight">Uppgifter</span>
            </div>
            <span className="text-2xl font-bold text-foreground tracking-tight">{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-2 mb-2" />
          <p className="text-xs text-muted-foreground">
            {completedTasks} av {totalTasks} klara
          </p>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <Card className="border-border/40 shadow-2xl rounded-2xl">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--gradient-icon)', boxShadow: 'var(--shadow-icon)' }}
            >
              <Activity className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold text-foreground tracking-tight">Snabbstatistik</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
              </div>
              <p className="text-lg font-bold text-foreground tracking-tight">{completedTasks}</p>
              <p className="text-xs text-muted-foreground">Klara</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <FileText className="h-3.5 w-3.5 text-primary" />
              </div>
              <p className="text-lg font-bold text-foreground tracking-tight">{filesCount}</p>
              <p className="text-xs text-muted-foreground">Filer</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <MessageSquare className="h-3.5 w-3.5 text-primary" />
              </div>
              <p className="text-lg font-bold text-foreground tracking-tight">{commentsCount}</p>
              <p className="text-xs text-muted-foreground">Kommentarer</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card className="border-border/40 shadow-2xl rounded-2xl">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--gradient-icon)', boxShadow: 'var(--shadow-icon)' }}
            >
              <Activity className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold text-foreground tracking-tight">Senaste aktivitet</span>
          </div>
          {recentActivities.length > 0 ? (
            <div className="space-y-2">
              {recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-2">
                  <span className="text-sm flex-shrink-0 mt-0.5">
                    {ACTION_ICONS[activity.action] || '📌'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-foreground truncate">{activity.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: sv })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Ingen aktivitet ännu</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProjectOverviewHeader;
