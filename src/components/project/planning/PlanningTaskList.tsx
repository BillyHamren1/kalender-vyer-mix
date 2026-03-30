import { useState, useMemo } from "react";
import { format, startOfDay, isBefore, isToday, isTomorrow } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Circle, Play, Ban, CheckCircle2, XCircle,
  ArrowUp, ArrowRight, ArrowDown,
  AlertTriangle, CalendarDays, UserX, MessageSquare,
  User, ChevronRight, CalendarIcon, Layers, Clock,
} from "lucide-react";
import type { EstablishmentTask, TaskStatus, TaskPriority } from "@/services/establishmentTaskService";
import { updateEstablishmentTask } from "@/services/establishmentTaskService";
import { fetchEstablishmentTaskCommentCounts } from "@/services/establishmentTaskCommentService";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type GroupBy = "none" | "status" | "person" | "date";

interface PlanningTaskListProps {
  tasks: EstablishmentTask[];
  staffPool: Array<{ id: string; name: string }>;
  onTaskClick: (task: { id: string; title: string; category: string; startDate: Date; endDate: Date; completed: boolean }) => void;
  largeProjectId?: string | null;
  bookingId?: string | null;
}

const STATUS_CONFIG: Record<string, { icon: typeof Circle; label: string; className: string; rowClass: string }> = {
  not_started: { icon: Circle, label: "Ej startad", className: "text-muted-foreground", rowClass: "" },
  in_progress: { icon: Play, label: "Pågår", className: "text-primary", rowClass: "" },
  blocked: { icon: Ban, label: "Blockerad", className: "text-destructive", rowClass: "bg-destructive/5 border-destructive/20" },
  done: { icon: CheckCircle2, label: "Klar", className: "text-emerald-600 dark:text-emerald-400", rowClass: "opacity-60" },
  cancelled: { icon: XCircle, label: "Avbruten", className: "text-muted-foreground", rowClass: "opacity-40" },
};

const PRIORITY_CONFIG: Record<string, { icon: typeof ArrowUp; className: string; label: string }> = {
  high: { icon: ArrowUp, className: "text-destructive", label: "Hög" },
  medium: { icon: ArrowRight, className: "text-amber-500", label: "Medium" },
  low: { icon: ArrowDown, className: "text-muted-foreground", label: "Låg" },
};

const READINESS_CONFIG: Record<string, { label: string; className: string }> = {
  ready: { label: "Redo", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
  missing_information: { label: "Saknar info", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" },
  waiting_for_decision: { label: "Väntar beslut", className: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20" },
  waiting_for_external: { label: "Väntar extern", className: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20" },
};

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "not_started", label: "Ej startad" },
  { value: "in_progress", label: "Pågår" },
  { value: "blocked", label: "Blockerad" },
  { value: "done", label: "Klar" },
  { value: "cancelled", label: "Avbruten" },
];

const STATUS_GROUP_ORDER: TaskStatus[] = ["blocked", "in_progress", "not_started", "done", "cancelled"];

const getStaffName = (staffId: string | null, staffPool: Array<{ id: string; name: string }>) => {
  if (!staffId) return null;
  return staffPool.find(s => s.id === staffId)?.name || null;
};

const isOverdue = (task: EstablishmentTask) => {
  if (task.status === "done" || task.status === "cancelled") return false;
  if (!task.end_date) return false;
  return isBefore(startOfDay(new Date(task.end_date)), startOfDay(new Date()));
};

const hasNoDates = (task: EstablishmentTask) => !task.start_date || !task.end_date;
const hasNoOwner = (task: EstablishmentTask) => !task.assigned_to && task.status !== "done" && task.status !== "cancelled";

const PlanningTaskList = ({ tasks, staffPool, onTaskClick, largeProjectId, bookingId }: PlanningTaskListProps) => {
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const queryClient = useQueryClient();

  const taskIds = useMemo(() => tasks.map(t => t.id), [tasks]);

  const { data: commentCounts = {} } = useQuery({
    queryKey: ["establishment-task-comment-counts", taskIds],
    queryFn: () => fetchEstablishmentTaskCommentCounts(taskIds),
    enabled: taskIds.length > 0,
  });

  const queryKey = largeProjectId
    ? ["establishment-tasks", "project", largeProjectId]
    : ["establishment-tasks", bookingId];

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["establishment-tasks-analytics", largeProjectId] });
  };

  const handleQuickStatusChange = async (taskId: string, status: TaskStatus, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateEstablishmentTask(taskId, { status });
      invalidateAll();
    } catch { toast.error("Kunde inte uppdatera status"); }
  };

  const handleQuickAssign = async (taskId: string, staffId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await updateEstablishmentTask(taskId, { assigned_to: staffId === "none" ? null : staffId });
      invalidateAll();
    } catch { toast.error("Kunde inte tilldela"); }
  };

  const handleQuickDateChange = async (taskId: string, field: "start_date" | "end_date", date: Date | undefined) => {
    if (!date) return;
    try {
      await updateEstablishmentTask(taskId, { [field]: format(date, "yyyy-MM-dd") });
      invalidateAll();
    } catch { toast.error("Kunde inte ändra datum"); }
  };

  const handleToggleBlocked = async (task: EstablishmentTask, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus: TaskStatus = task.status === "blocked" ? "not_started" : "blocked";
    try {
      await updateEstablishmentTask(task.id, { status: newStatus });
      invalidateAll();
    } catch { toast.error("Kunde inte ändra status"); }
  };

  const grouped = useMemo(() => {
    const groups: { key: string; label: string; tasks: EstablishmentTask[] }[] = [];

    if (groupBy === "none") {
      groups.push({ key: "all", label: "", tasks: [...tasks].sort((a, b) => a.sort_order - b.sort_order) });
    } else if (groupBy === "status") {
      for (const status of STATUS_GROUP_ORDER) {
        const filtered = tasks.filter(t => t.status === status);
        if (filtered.length > 0) {
          groups.push({ key: status, label: STATUS_CONFIG[status]?.label || status, tasks: filtered });
        }
      }
    } else if (groupBy === "person") {
      const unassigned = tasks.filter(t => !t.assigned_to);
      const byPerson = new Map<string, EstablishmentTask[]>();
      tasks.filter(t => t.assigned_to).forEach(t => {
        const key = t.assigned_to!;
        if (!byPerson.has(key)) byPerson.set(key, []);
        byPerson.get(key)!.push(t);
      });
      if (unassigned.length > 0) groups.push({ key: "unassigned", label: "Ej tilldelad", tasks: unassigned });
      byPerson.forEach((tasks, staffId) => {
        groups.push({ key: staffId, label: getStaffName(staffId, staffPool) || staffId, tasks });
      });
    } else if (groupBy === "date") {
      const today = tasks.filter(t => t.start_date && isToday(new Date(t.start_date)));
      const tomorrow = tasks.filter(t => t.start_date && isTomorrow(new Date(t.start_date)));
      const later = tasks.filter(t => {
        if (!t.start_date) return false;
        const d = startOfDay(new Date(t.start_date));
        return !isToday(d) && !isTomorrow(d);
      });
      const noDates = tasks.filter(t => !t.start_date);
      if (today.length > 0) groups.push({ key: "today", label: "Idag", tasks: today });
      if (tomorrow.length > 0) groups.push({ key: "tomorrow", label: "Imorgon", tasks: tomorrow });
      if (later.length > 0) groups.push({ key: "later", label: "Kommande", tasks: later });
      if (noDates.length > 0) groups.push({ key: "no-date", label: "Saknar datum", tasks: noDates });
    }

    return groups;
  }, [tasks, groupBy, staffPool]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Gruppera:</span>
          <div className="flex gap-1">
            {([
              { value: "none", label: "Ingen" },
              { value: "status", label: "Status" },
              { value: "person", label: "Person" },
              { value: "date", label: "Datum" },
            ] as { value: GroupBy; label: string }[]).map(opt => (
              <Button
                key={opt.value}
                variant={groupBy === opt.value ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => setGroupBy(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{tasks.length} aktiviteter</span>
      </div>

      {/* Task groups */}
      {grouped.map(group => (
        <div key={group.key}>
          {group.label && (
            <div className="flex items-center gap-2 mb-2 mt-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </span>
              <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5 py-0.5">
                {group.tasks.length}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
          )}

          {/* Table header */}
          <div className="grid grid-cols-[1fr_120px_90px_90px_80px_80px_36px] gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/50">
            <span>Aktivitet</span>
            <span>Tilldelad</span>
            <span>Start</span>
            <span>Slut</span>
            <span>Status</span>
            <span>Beredskap</span>
            <span></span>
          </div>

          {/* Task rows */}
          <div className="divide-y divide-border/30">
            {group.tasks.map(task => {
              const overdue = isOverdue(task);
              const noOwner = hasNoOwner(task);
              const noDates = hasNoDates(task);
              const blocked = task.status === "blocked";
              const statusCfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.not_started;
              const StatusIcon = statusCfg.icon;
              const priorityCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
              const PriorityIcon = priorityCfg.icon;
              const readinessCfg = READINESS_CONFIG[task.readiness] || READINESS_CONFIG.missing_information;
              const assignedName = getStaffName(task.assigned_to, staffPool);

              return (
                <div
                  key={task.id}
                  className={cn(
                    "grid grid-cols-[1fr_120px_90px_90px_80px_80px_36px] gap-2 px-3 py-2 items-center cursor-pointer transition-colors hover:bg-muted/40 group",
                    statusCfg.rowClass,
                    overdue && "bg-destructive/5 border-l-2 border-l-destructive",
                    blocked && !overdue && "border-l-2 border-l-destructive",
                    noOwner && !blocked && !overdue && "border-l-2 border-l-amber-500",
                  )}
                  onClick={() => onTaskClick({
                    id: task.id,
                    title: task.title,
                    category: task.category,
                    startDate: new Date(task.start_date),
                    endDate: new Date(task.end_date),
                    completed: task.completed,
                  })}
                >
                  {/* Task name cell */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex-shrink-0">
                      <PriorityIcon className={cn("h-3.5 w-3.5", priorityCfg.className)} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          "text-sm font-medium truncate",
                          task.status === "done" && "line-through text-muted-foreground",
                          task.status === "cancelled" && "line-through text-muted-foreground",
                        )}>
                          {task.title}
                        </span>
                        {task.blockers && (
                          <span className="flex-shrink-0">
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                          </span>
                        )}
                        {task.decision_needed && (
                          <Badge variant="outline" className="text-[9px] h-4 px-1 border-violet-500/30 text-violet-600 dark:text-violet-400 flex-shrink-0">
                            Beslut
                          </Badge>
                        )}
                        {overdue && (
                          <Badge variant="destructive" className="text-[9px] h-4 px-1 flex-shrink-0">
                            Försenad
                          </Badge>
                        )}
                        {(commentCounts[task.id] || 0) > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground flex-shrink-0">
                            <MessageSquare className="h-3 w-3" />
                            {commentCounts[task.id]}
                          </span>
                        )}
                      </div>
                      {/* Warnings row */}
                      {(noDates || noOwner) && (
                        <div className="flex items-center gap-2 mt-0.5">
                          {noOwner && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                              <UserX className="h-2.5 w-2.5" /> Saknar ägare
                            </span>
                          )}
                          {noDates && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <CalendarDays className="h-2.5 w-2.5" /> Saknar datum
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Assigned user cell — inline select */}
                  <div onClick={e => e.stopPropagation()}>
                    <Select
                      value={task.assigned_to || "none"}
                      onValueChange={(val) => handleQuickAssign(task.id, val)}
                    >
                      <SelectTrigger className={cn(
                        "h-7 text-xs border-none shadow-none px-1.5",
                        noOwner ? "text-amber-600 dark:text-amber-400 bg-amber-500/10" : "bg-transparent"
                      )}>
                        <div className="flex items-center gap-1 truncate">
                          <User className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{assignedName || "Tilldela"}</span>
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Ingen tilldelad</SelectItem>
                        {staffPool.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Start date cell */}
                  <div onClick={e => e.stopPropagation()}>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className={cn(
                          "text-xs px-1.5 py-1 rounded hover:bg-muted transition-colors text-left w-full",
                          noDates && "text-muted-foreground bg-muted/50"
                        )}>
                          {task.start_date
                            ? format(new Date(task.start_date), "d MMM", { locale: sv })
                            : "—"
                          }
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={task.start_date ? new Date(task.start_date) : undefined}
                          onSelect={(d) => handleQuickDateChange(task.id, "start_date", d)}
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* End date cell */}
                  <div onClick={e => e.stopPropagation()}>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className={cn(
                          "text-xs px-1.5 py-1 rounded hover:bg-muted transition-colors text-left w-full",
                          overdue && "text-destructive font-medium"
                        )}>
                          {task.end_date
                            ? format(new Date(task.end_date), "d MMM", { locale: sv })
                            : "—"
                          }
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={task.end_date ? new Date(task.end_date) : undefined}
                          onSelect={(d) => handleQuickDateChange(task.id, "end_date", d)}
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Status cell — inline select */}
                  <div onClick={e => e.stopPropagation()}>
                    <Select
                      value={task.status}
                      onValueChange={(val) => handleQuickStatusChange(task.id, val as TaskStatus, { stopPropagation: () => {} } as any)}
                    >
                      <SelectTrigger className={cn(
                        "h-7 text-[11px] border-none shadow-none px-1.5 font-medium",
                        statusCfg.className,
                        blocked && "bg-destructive/10",
                        task.status === "in_progress" && "bg-primary/10",
                        task.status === "done" && "bg-emerald-500/10",
                      )}>
                        <div className="flex items-center gap-1">
                          <StatusIcon className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate">{statusCfg.label}</span>
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(o => {
                          const Icon = STATUS_CONFIG[o.value]?.icon || Circle;
                          return (
                            <SelectItem key={o.value} value={o.value}>
                              <div className="flex items-center gap-2">
                                <Icon className={cn("h-3.5 w-3.5", STATUS_CONFIG[o.value]?.className)} />
                                {o.label}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Readiness cell */}
                  <div>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
                      readinessCfg.className
                    )}>
                      {readinessCfg.label}
                    </span>
                  </div>

                  {/* Actions cell */}
                  <div className="flex items-center justify-end">
                    <button
                      onClick={(e) => handleToggleBlocked(task, e)}
                      className={cn(
                        "p-1 rounded transition-colors",
                        blocked
                          ? "text-destructive hover:bg-destructive/10"
                          : "text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100"
                      )}
                      title={blocked ? "Ta bort blockering" : "Markera som blockerad"}
                    >
                      <Ban className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {tasks.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Clock className="h-10 w-10 mx-auto mb-2 opacity-20" />
          <p className="text-sm">Inga aktiviteter ännu</p>
        </div>
      )}
    </div>
  );
};

export default PlanningTaskList;
