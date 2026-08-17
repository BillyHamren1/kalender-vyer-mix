import { useMemo } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CircleDot,
  FileText,
  ListTodo,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ProjectTask } from "@/types/project";
import type { ProjectActivity } from "@/services/projectActivityService";
import { cn } from "@/lib/utils";

interface ProjectOverviewHeaderProps {
  tasks: ProjectTask[];
  filesCount: number;
  commentsCount: number;
  activities: ProjectActivity[];
}

const dateKey = (value?: string | null) => {
  if (!value) return null;
  return value.includes("T") ? value.slice(0, 10) : value.slice(0, 10);
};

const ProjectOverviewHeader = ({
  tasks,
  filesCount,
  commentsCount,
}: ProjectOverviewHeaderProps) => {
  const today = new Date().toISOString().slice(0, 10);

  const summary = useMemo(() => {
    const actionable = tasks.filter((task) => !task.is_info_only);
    const completed = actionable.filter((task) => task.completed);
    const open = actionable.filter((task) => !task.completed);
    const overdue = open.filter((task) => {
      const deadline = dateKey(task.deadline || task.end_date);
      return !!deadline && deadline < today;
    });
    const upcoming = open
      .filter((task) => {
        const deadline = dateKey(task.deadline || task.start_date || task.end_date);
        return !!deadline && deadline >= today;
      })
      .sort((a, b) => {
        const aDate = dateKey(a.deadline || a.start_date || a.end_date) || "9999-12-31";
        const bDate = dateKey(b.deadline || b.start_date || b.end_date) || "9999-12-31";
        return aDate.localeCompare(bDate);
      });

    const progress = actionable.length > 0
      ? Math.round((completed.length / actionable.length) * 100)
      : 100;

    return {
      total: actionable.length,
      completed: completed.length,
      open: open.length,
      overdue,
      upcoming,
      progress,
    };
  }, [tasks, today]);

  const nextTask = summary.upcoming[0] || null;
  const needsAttention = summary.overdue.length > 0;

  return (
    <Card className="border-border/60 shadow-sm overflow-hidden">
      <CardContent className="p-0">
        <div className="p-5 sm:p-6 border-b border-border/50 bg-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CircleDot className={cn("h-4 w-4", needsAttention ? "text-amber-600" : "text-emerald-600")} />
                <h2 className="text-base font-semibold">Projektläge</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {needsAttention
                  ? `${summary.overdue.length} aktivitet${summary.overdue.length === 1 ? "" : "er"} behöver åtgärdas.`
                  : summary.open > 0
                    ? "Projektet är under kontroll. Nästa aktiviteter visas nedan."
                    : "Inga öppna aktiviteter just nu."}
              </p>
            </div>

            <div className="min-w-[220px] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Genomförda aktiviteter</span>
                <span className="font-semibold">{summary.progress}%</span>
              </div>
              <Progress value={summary.progress} className="h-2" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-border/50">
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <ListTodo className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Öppet</span>
            </div>
            <div className="text-2xl font-semibold">{summary.open}</div>
            <p className="text-xs text-muted-foreground mt-1">av {summary.total} aktiviteter</p>
          </div>

          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <AlertTriangle className={cn("h-4 w-4", needsAttention && "text-amber-600")} />
              <span className="text-xs font-medium uppercase tracking-wide">Behöver åtgärd</span>
            </div>
            <div className={cn("text-2xl font-semibold", needsAttention && "text-amber-700")}>{summary.overdue.length}</div>
            <p className="text-xs text-muted-foreground mt-1">försenade aktiviteter</p>
          </div>

          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <CalendarClock className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Nästa</span>
            </div>
            <div className="text-sm font-semibold truncate">{nextTask?.title || "Ingen planerad"}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {nextTask ? dateKey(nextTask.deadline || nextTask.start_date || nextTask.end_date) : "—"}
            </p>
          </div>

          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <FileText className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Underlag</span>
            </div>
            <div className="text-2xl font-semibold">{filesCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {commentsCount > 0 ? `${commentsCount} kommentarer` : "filer i projektet"}
            </p>
          </div>
        </div>

        {summary.overdue.length > 0 && (
          <div className="px-5 py-4 bg-amber-50/70 dark:bg-amber-950/15 border-t border-amber-200/60 dark:border-amber-900/30">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
              <span className="text-sm font-semibold">Behöver din uppmärksamhet</span>
            </div>
            <div className="space-y-1.5">
              {summary.overdue.slice(0, 3).map((task) => (
                <div key={task.id} className="flex items-center justify-between gap-4 text-sm">
                  <span className="truncate">{task.title}</span>
                  <span className="text-xs text-amber-800/80 dark:text-amber-300 shrink-0">
                    {dateKey(task.deadline || task.end_date)}
                  </span>
                </div>
              ))}
              {summary.overdue.length > 3 && (
                <p className="text-xs text-muted-foreground">+ {summary.overdue.length - 3} ytterligare</p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProjectOverviewHeader;
