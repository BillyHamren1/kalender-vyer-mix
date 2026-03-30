import { useState, useMemo } from "react";
import { format, startOfDay, isBefore, isToday, isTomorrow } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  User, Users, ChevronDown, ChevronRight, AlertTriangle, Clock,
  Ban, CheckCircle2, Circle, Play, XCircle, UserX, ArrowUp, ArrowRight, ArrowDown,
} from "lucide-react";
import type { EstablishmentTask } from "@/services/establishmentTaskService";
import type { TaskAnalytics } from "@/hooks/useTaskAnalytics";

interface PeopleOverviewProps {
  analytics: TaskAnalytics;
  staffPool: Array<{ id: string; name: string }>;
  onTaskClick: (taskId: string) => void;
}

interface PersonData {
  staffId: string;
  name: string;
  tasks: EstablishmentTask[];
  active: number;
  overdue: number;
  blocked: number;
  completed: number;
  total: number;
  level: "low" | "normal" | "high";
  overdueTasks: EstablishmentTask[];
  todayTasks: EstablishmentTask[];
  upcomingTasks: EstablishmentTask[];
  doneTasks: EstablishmentTask[];
}

const isOverdue = (task: EstablishmentTask) => {
  if (task.status === "done" || task.status === "cancelled") return false;
  if (!task.end_date) return false;
  return isBefore(startOfDay(new Date(task.end_date)), startOfDay(new Date()));
};

const LEVEL_CONFIG = {
  low: { label: "Låg", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  normal: { label: "Normal", className: "bg-primary/10 text-primary border-primary/20" },
  high: { label: "Hög", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

const STATUS_ICONS: Record<string, typeof Circle> = {
  not_started: Circle,
  in_progress: Play,
  blocked: Ban,
  done: CheckCircle2,
  cancelled: XCircle,
};

const PRIORITY_ICONS: Record<string, { icon: typeof ArrowUp; className: string }> = {
  high: { icon: ArrowUp, className: "text-destructive" },
  medium: { icon: ArrowRight, className: "text-amber-500" },
  low: { icon: ArrowDown, className: "text-muted-foreground" },
};

const TaskRow = ({ task, onClick }: { task: EstablishmentTask; onClick: () => void }) => {
  const overdue = isOverdue(task);
  const StatusIcon = STATUS_ICONS[task.status] || Circle;
  const priorityCfg = PRIORITY_ICONS[task.priority] || PRIORITY_ICONS.medium;
  const PriorityIcon = priorityCfg.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-left transition-colors hover:bg-muted/60 group text-sm",
        overdue && "bg-destructive/5",
        task.status === "blocked" && "bg-destructive/5",
      )}
    >
      <StatusIcon className={cn(
        "h-3.5 w-3.5 flex-shrink-0",
        task.status === "done" && "text-emerald-600 dark:text-emerald-400",
        task.status === "in_progress" && "text-primary",
        task.status === "blocked" && "text-destructive",
        task.status === "not_started" && "text-muted-foreground",
        task.status === "cancelled" && "text-muted-foreground",
      )} />
      <PriorityIcon className={cn("h-3 w-3 flex-shrink-0", priorityCfg.className)} />
      <span className={cn(
        "flex-1 truncate",
        task.status === "done" && "line-through text-muted-foreground",
      )}>
        {task.title}
      </span>
      {task.blockers && <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" />}
      {overdue && <Badge variant="destructive" className="text-[9px] h-4 px-1">Försenad</Badge>}
      {task.end_date && (
        <span className={cn("text-[11px] text-muted-foreground flex-shrink-0", overdue && "text-destructive font-medium")}>
          {format(new Date(task.end_date), "d MMM", { locale: sv })}
        </span>
      )}
      <ChevronRight className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 flex-shrink-0" />
    </button>
  );
};

const TaskGroup = ({
  label,
  tasks,
  onTaskClick,
  variant = "default",
}: {
  label: string;
  tasks: EstablishmentTask[];
  onTaskClick: (taskId: string) => void;
  variant?: "default" | "destructive" | "muted";
}) => {
  if (tasks.length === 0) return null;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2 px-3 py-1">
        <span className={cn(
          "text-[10px] font-semibold uppercase tracking-wider",
          variant === "destructive" && "text-destructive",
          variant === "muted" && "text-muted-foreground",
          variant === "default" && "text-muted-foreground",
        )}>
          {label}
        </span>
        <span className="text-[10px] text-muted-foreground">({tasks.length})</span>
      </div>
      {tasks.map(task => (
        <TaskRow key={task.id} task={task} onClick={() => onTaskClick(task.id)} />
      ))}
    </div>
  );
};

const PersonCard = ({ person, onTaskClick }: { person: PersonData; onTaskClick: (taskId: string) => void }) => {
  const [expanded, setExpanded] = useState(false);
  const levelCfg = LEVEL_CONFIG[person.level];

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <Card className={cn(
        "border-border/50 transition-shadow",
        expanded && "shadow-sm",
        person.overdue > 0 && "border-l-2 border-l-destructive",
        person.blocked > 0 && !person.overdue && "border-l-2 border-l-destructive/60",
      )}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center gap-3 px-4 py-3">
            {/* Avatar */}
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User className="h-4 w-4 text-primary" />
            </div>

            {/* Name + workload */}
            <div className="flex-1 min-w-0 text-left">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold truncate">{person.name}</span>
                <Badge variant="outline" className={cn("text-[10px] h-4 px-1.5 border", levelCfg.className)}>
                  {levelCfg.label}
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                <span>{person.total} totalt</span>
                <span className="text-primary font-medium">{person.active} aktiva</span>
                {person.overdue > 0 && (
                  <span className="text-destructive font-medium">{person.overdue} försenade</span>
                )}
                {person.blocked > 0 && (
                  <span className="text-destructive">{person.blocked} blockerade</span>
                )}
                <span className="text-emerald-600 dark:text-emerald-400">{person.completed} klara</span>
              </div>
            </div>

            {/* Stats badges */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {person.overdue > 0 && (
                <div className="flex items-center gap-0.5 bg-destructive/10 text-destructive px-1.5 py-0.5 rounded text-[10px] font-medium">
                  <Clock className="h-3 w-3" /> {person.overdue}
                </div>
              )}
              {person.blocked > 0 && (
                <div className="flex items-center gap-0.5 bg-destructive/10 text-destructive px-1.5 py-0.5 rounded text-[10px] font-medium">
                  <Ban className="h-3 w-3" /> {person.blocked}
                </div>
              )}
            </div>

            {/* Expand chevron */}
            {expanded
              ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            }
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border/40 px-2 py-2 space-y-1">
            <TaskGroup label="Försenade" tasks={person.overdueTasks} onTaskClick={onTaskClick} variant="destructive" />
            <TaskGroup label="Idag" tasks={person.todayTasks} onTaskClick={onTaskClick} />
            <TaskGroup label="Kommande" tasks={person.upcomingTasks} onTaskClick={onTaskClick} />
            <TaskGroup label="Klara" tasks={person.doneTasks} onTaskClick={onTaskClick} variant="muted" />
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

const PeopleOverview = ({ analytics, staffPool, onTaskClick }: PeopleOverviewProps) => {
  const { people, unassignedTasks } = useMemo(() => {
    const today = startOfDay(new Date());
    const byPerson = new Map<string, EstablishmentTask[]>();

    const unassigned: EstablishmentTask[] = [];

    for (const task of analytics.tasks) {
      if (task.status === "cancelled") continue;
      if (!task.assigned_to) {
        if (task.status !== "done") unassigned.push(task);
        continue;
      }
      if (!byPerson.has(task.assigned_to)) byPerson.set(task.assigned_to, []);
      byPerson.get(task.assigned_to)!.push(task);
    }

    const people: PersonData[] = [];

    for (const [staffId, tasks] of byPerson) {
      const staff = staffPool.find(s => s.id === staffId);
      const active = tasks.filter(t => t.status !== "done");
      const overdueTasks = tasks.filter(t => isOverdue(t));
      const blocked = tasks.filter(t => t.status === "blocked");
      const completed = tasks.filter(t => t.status === "done");
      const todayTasks = active.filter(t => t.start_date && isToday(new Date(t.start_date)) && !isOverdue(t));
      const upcomingTasks = active.filter(t => {
        if (!t.start_date || isOverdue(t)) return false;
        const d = startOfDay(new Date(t.start_date));
        return !isToday(d);
      });

      const level: "low" | "normal" | "high" = active.length <= 2 ? "low" : active.length <= 5 ? "normal" : "high";

      people.push({
        staffId,
        name: staff?.name || staffId,
        tasks,
        active: active.length,
        overdue: overdueTasks.length,
        blocked: blocked.length,
        completed: completed.length,
        total: tasks.length,
        level,
        overdueTasks,
        todayTasks,
        upcomingTasks,
        doneTasks: completed,
      });
    }

    // Sort: most critical first (overdue > blocked > high workload)
    people.sort((a, b) => {
      if (a.overdue !== b.overdue) return b.overdue - a.overdue;
      if (a.blocked !== b.blocked) return b.blocked - a.blocked;
      return b.active - a.active;
    });

    return { people, unassignedTasks: unassigned };
  }, [analytics.tasks, staffPool]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Personalöversikt</h3>
          <span className="text-xs text-muted-foreground">({people.length} personer)</span>
        </div>
      </div>

      {/* Unassigned tasks — always visible and prominent */}
      {unassignedTasks.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5 border-l-2 border-l-amber-500">
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="h-9 w-9 rounded-full bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                  <UserX className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                      Ej tilldelade uppgifter
                    </span>
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-500/10">
                      {unassignedTasks.length}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-amber-600/70 dark:text-amber-400/70 mt-0.5">
                    Dessa aktiviteter saknar ansvarig person
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 text-amber-600/60 flex-shrink-0" />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t border-amber-500/20 px-2 py-2 space-y-0.5">
                {unassignedTasks.map(task => (
                  <TaskRow key={task.id} task={task} onClick={() => onTaskClick(task.id)} />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {/* People cards */}
      <div className="space-y-2">
        {people.map(person => (
          <PersonCard key={person.staffId} person={person} onTaskClick={onTaskClick} />
        ))}
      </div>

      {people.length === 0 && unassignedTasks.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-2 opacity-20" />
          <p className="text-sm">Inga aktiviteter ännu</p>
        </div>
      )}
    </div>
  );
};

export default PeopleOverview;
