import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, differenceInDays } from "date-fns";
import { sv } from "date-fns/locale";
import {
  CheckCircle2, CalendarDays, UserX, AlertTriangle, Clock,
  AlertCircle, ShieldAlert, User, Users,
  HelpCircle, ChevronRight, Zap, CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { updateEstablishmentTask, bulkUpdateEstablishmentTasks } from "@/services/establishmentTaskService";
import { toast } from "sonner";
import type { TaskAnalytics, CriticalIssue } from "@/hooks/useTaskAnalytics";
import type { EstablishmentTask } from "@/services/establishmentTaskService";

interface ProjectControlPanelProps {
  analytics: TaskAnalytics;
  staffPool: Array<{ id: string; name: string }>;
  onTaskClick?: (taskId: string) => void;
}

// ─── Issue config ───────────────────────────────────────────────────────────

const issueConfig: Record<CriticalIssue["type"], {
  icon: typeof AlertTriangle;
  label: string;
  className: string;
  dotClass: string;
  hint: string;
}> = {
  blocked:              { icon: ShieldAlert,   label: "Blockerad",       className: "text-destructive",                                         dotClass: "bg-destructive",            hint: "Kan inte fortsätta — behöver lösning" },
  overdue:              { icon: Clock,         label: "Försenad",        className: "text-amber-600 dark:text-amber-400",                       dotClass: "bg-amber-500",              hint: "Slutdatum har passerat" },
  decision_needed:      { icon: HelpCircle,    label: "Beslut krävs",    className: "text-violet-600 dark:text-violet-400",                     dotClass: "bg-violet-500",             hint: "Väntar på beslut för att gå vidare" },
  missing_setup:        { icon: AlertTriangle, label: "Saknar info",     className: "text-amber-600 dark:text-amber-400",                       dotClass: "bg-amber-500",              hint: "Information saknas — komplettera" },
  waiting_for_external: { icon: Clock,         label: "Väntar extern",   className: "text-orange-600 dark:text-orange-400",                     dotClass: "bg-orange-500",             hint: "Beroende av extern part" },
  no_owner:             { icon: UserX,         label: "Utan ägare",      className: "text-orange-600 dark:text-orange-400",                     dotClass: "bg-orange-500",             hint: "Ingen ansvarig — tilldela person" },
  no_dates:             { icon: CalendarDays,  label: "Utan datum",      className: "text-muted-foreground",                                    dotClass: "bg-muted-foreground",       hint: "Start/slut saknas — planera in" },
};

// ─── Progress strip ─────────────────────────────────────────────────────────

const ProgressStrip = ({ analytics }: { analytics: TaskAnalytics }) => {
  const pct = analytics.total > 0 ? Math.round((analytics.completed / analytics.total) * 100) : 0;
  const dangerCount = analytics.overdue + analytics.blocked;
  const attentionCount = analytics.waitingForDecision + analytics.missingSetup + analytics.withoutOwner;

  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-card border border-border/50 rounded-xl shadow-sm">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold tracking-tight">{pct}%</span>
          <span className="text-xs text-muted-foreground">klart</span>
        </div>
        <Progress value={pct} className="flex-1 h-2 max-w-[200px]" />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {analytics.completed}/{analytics.total}
        </span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {dangerCount > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-destructive/10">
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
            <span className="text-xs font-semibold text-destructive">{dangerCount} kritiska</span>
          </div>
        )}
        {attentionCount > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{attentionCount} kräver uppmärksamhet</span>
          </div>
        )}
        {dangerCount === 0 && attentionCount === 0 && analytics.total > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-primary">Inga problem</span>
          </div>
        )}

        <div className="flex items-center gap-2 pl-2 border-l border-border/50">
          <CountPill icon={Clock} count={analytics.overdue} label="sena" variant="danger" />
          <CountPill icon={ShieldAlert} count={analytics.blocked} label="block" variant="danger" />
          <CountPill icon={HelpCircle} count={analytics.waitingForDecision} label="beslut" variant="warning" />
          <CountPill icon={UserX} count={analytics.withoutOwner} label="ägare" variant="warning" />
        </div>
      </div>
    </div>
  );
};

const CountPill = ({ icon: Icon, count, label, variant }: {
  icon: typeof Clock; count: number; label: string;
  variant: "danger" | "warning";
}) => {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-1 text-xs" title={`${count} ${label}`}>
      <Icon className={cn("h-3 w-3", variant === "danger" ? "text-destructive" : "text-amber-600 dark:text-amber-400")} />
      <span className={cn("font-bold", variant === "danger" ? "text-destructive" : "text-amber-600 dark:text-amber-400")}>{count}</span>
    </div>
  );
};

// ─── Inline staff assign dropdown ───────────────────────────────────────────

const InlineStaffAssign = ({ taskId, staffPool, largeProjectId }: {
  taskId: string;
  staffPool: Array<{ id: string; name: string }>;
  largeProjectId?: string;
}) => {
  const queryClient = useQueryClient();

  const handleAssign = async (staffId: string) => {
    try {
      await updateEstablishmentTask(taskId, { assigned_to_ids: [staffId], assigned_to: staffId });
      queryClient.invalidateQueries({ queryKey: ["establishment-tasks-analytics"] });
      const name = staffPool.find(s => s.id === staffId)?.name || "person";
      toast.success(`Tilldelad till ${name}`);
    } catch {
      toast.error("Kunde inte tilldela");
    }
  };

  return (
    <Select onValueChange={handleAssign}>
      <SelectTrigger className="h-6 w-[110px] text-[10px] border-dashed shrink-0" onClick={(e) => e.stopPropagation()}>
        <SelectValue placeholder="Tilldela →" />
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        {staffPool.map(s => (
          <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

// ─── Inline date picker ─────────────────────────────────────────────────────

const InlineDatePicker = ({ taskId }: { taskId: string }) => {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const handleDateSelect = async (date: Date | undefined) => {
    if (!date) return;
    try {
      const formatted = format(date, "yyyy-MM-dd");
      await updateEstablishmentTask(taskId, { start_date: formatted, end_date: formatted });
      queryClient.invalidateQueries({ queryKey: ["establishment-tasks-analytics"] });
      toast.success(`Datum satt: ${format(date, "d MMM", { locale: sv })}`);
      setOpen(false);
    } catch {
      toast.error("Kunde inte sätta datum");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] px-2 border-dashed shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          Sätt datum →
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end" onClick={(e) => e.stopPropagation()}>
        <Calendar
          mode="single"
          onSelect={handleDateSelect}
          initialFocus
          className="p-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
};

// ─── Bulk assign button ─────────────────────────────────────────────────────

const BulkAssignButton = ({ taskIds, staffPool }: {
  taskIds: string[];
  staffPool: Array<{ id: string; name: string }>;
}) => {
  const queryClient = useQueryClient();

  const handleBulkAssign = async (staffId: string) => {
    try {
      await bulkUpdateEstablishmentTasks(taskIds, { assigned_to: staffId, assigned_to_ids: [staffId] } as any);
      queryClient.invalidateQueries({ queryKey: ["establishment-tasks-analytics"] });
      const name = staffPool.find(s => s.id === staffId)?.name || "person";
      toast.success(`${taskIds.length} uppgifter tilldelade till ${name}`);
    } catch {
      toast.error("Kunde inte tilldela");
    }
  };

  return (
    <Select onValueChange={handleBulkAssign}>
      <SelectTrigger className="h-5 w-auto text-[10px] border-0 bg-transparent gap-1 px-1 text-primary hover:text-primary/80">
        <Users className="h-3 w-3" />
        <SelectValue placeholder="Tilldela alla →" />
      </SelectTrigger>
      <SelectContent>
        {staffPool.map(s => (
          <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

// ─── Today's Focus ──────────────────────────────────────────────────────────

const TodayFocus = ({ analytics, staffPool, onTaskClick }: {
  analytics: TaskAnalytics;
  staffPool: Array<{ id: string; name: string }>;
  onTaskClick?: (taskId: string) => void;
}) => {
  const tasks = analytics.upcomingNext10;
  if (tasks.length === 0) return null;

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, EstablishmentTask[]>();
    tasks.forEach(t => {
      const key = t.start_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return Array.from(map.entries());
  }, [tasks]);

  const today = format(new Date(), "yyyy-MM-dd");
  const tomorrow = format(new Date(Date.now() + 86400000), "yyyy-MM-dd");

  const dateLabel = (dateStr: string) => {
    if (dateStr === today) return "Idag";
    if (dateStr === tomorrow) return "Imorgon";
    try {
      return format(new Date(dateStr), "EEE d MMM", { locale: sv });
    } catch {
      return dateStr;
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <CalendarClock className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Pågår & kommande</h3>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{tasks.length}</Badge>
      </div>
      <div className="space-y-1">
        {grouped.map(([dateStr, dateTasks], idx) => (
          <div key={dateStr}>
            <p className={cn(
              "text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 pb-0.5",
              idx > 0 && "pt-1.5"
            )}>
              {dateLabel(dateStr)}
            </p>
            {dateTasks.map(t => (
              <TaskRow
                key={t.id}
                task={t}
                staffPool={staffPool}
                onTaskClick={onTaskClick}
                highlight={dateStr === today ? "today" : undefined}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Action Required ────────────────────────────────────────────────────────

const ActionRequired = ({ issues, staffPool, onTaskClick }: {
  issues: CriticalIssue[];
  staffPool: Array<{ id: string; name: string }>;
  onTaskClick?: (taskId: string) => void;
}) => {
  if (issues.length === 0) return null;

  const grouped = useMemo(() => {
    const map = new Map<CriticalIssue["type"], CriticalIssue[]>();
    issues.forEach(issue => {
      if (!map.has(issue.type)) map.set(issue.type, []);
      map.get(issue.type)!.push(issue);
    });
    return Array.from(map.entries());
  }, [issues]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Zap className="h-4 w-4 text-destructive" />
        <h3 className="text-sm font-semibold text-foreground">Kräver åtgärd</h3>
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">{issues.length}</Badge>
      </div>
      <div className="space-y-3">
        {grouped.map(([type, typeIssues]) => {
          const config = issueConfig[type];
          const Icon = config.icon;
          const taskIds = typeIssues.map(i => i.taskId);

          return (
            <div key={type}>
              <div className="flex items-center gap-1.5 mb-0.5 px-1">
                <div className={cn("h-1.5 w-1.5 rounded-full", config.dotClass)} />
                <span className={cn("text-[11px] font-semibold uppercase tracking-wider flex-1", config.className)}>
                  {config.label} ({typeIssues.length})
                </span>
                {/* Bulk action for "no_owner" */}
                {type === "no_owner" && staffPool.length > 0 && (
                  <BulkAssignButton taskIds={taskIds} staffPool={staffPool} />
                )}
              </div>
              <p className="text-[10px] text-muted-foreground px-1 mb-1">{config.hint}</p>
              <div className="space-y-0.5">
                {typeIssues.slice(0, 4).map(issue => {
                  const staffName = issue.assignedTo
                    ? staffPool.find(s => s.id === issue.assignedTo)?.name
                    : null;
                  return (
                    <div
                      key={`${issue.taskId}-${issue.type}`}
                      className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-accent/50 transition-colors text-left group cursor-pointer"
                      onClick={() => onTaskClick?.(issue.taskId)}
                    >
                      <Icon className={cn("h-3.5 w-3.5 shrink-0", config.className)} />
                      <span className="text-sm truncate flex-1 group-hover:text-primary transition-colors">{issue.taskTitle}</span>

                      {/* Inline action based on type */}
                      {type === "no_owner" && (
                        <InlineStaffAssign taskId={issue.taskId} staffPool={staffPool} />
                      )}
                      {type === "no_dates" && (
                        <InlineDatePicker taskId={issue.taskId} />
                      )}

                      {/* Info for other types */}
                      {type !== "no_owner" && type !== "no_dates" && staffName && (
                        <span className="text-[10px] text-muted-foreground shrink-0">{staffName}</span>
                      )}
                      {type === "blocked" && issue.blockerReason && (
                        <span className="text-[10px] text-destructive/70 truncate max-w-[120px] shrink-0" title={issue.blockerReason}>
                          {issue.blockerReason}
                        </span>
                      )}
                      <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                  );
                })}
                {typeIssues.length > 4 && (
                  <p className="text-[10px] text-muted-foreground px-2">+{typeIssues.length - 4} fler</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Shared task row ────────────────────────────────────────────────────────

const TaskRow = ({ task, staffPool, onTaskClick, highlight }: {
  task: EstablishmentTask;
  staffPool: Array<{ id: string; name: string }>;
  onTaskClick?: (taskId: string) => void;
  highlight?: "today";
}) => {
  const staffNames = (() => {
    const ids = task.assigned_to_ids?.length ? task.assigned_to_ids : (task.assigned_to ? [task.assigned_to] : []);
    return ids.map(id => staffPool.find(s => s.id === id)?.name).filter(Boolean) as string[];
  })();

  return (
    <button
      onClick={() => onTaskClick?.(task.id)}
      className={cn(
        "w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-accent/50 transition-colors text-left group",
        highlight === "today" && "bg-primary/5"
      )}
    >
      {highlight === "today" && <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
      <span className="text-sm truncate flex-1 group-hover:text-primary transition-colors">{task.title}</span>
      {staffNames.length > 0 ? (
        <span className="text-[10px] text-muted-foreground shrink-0">{staffNames.join(", ")}</span>
      ) : (
        <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0">Utan ägare</span>
      )}
      <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </button>
  );
};

// ─── Main Control Panel ─────────────────────────────────────────────────────

const ProjectControlPanel = ({ analytics, staffPool, onTaskClick }: ProjectControlPanelProps) => {
  const hasIssues = analytics.criticalIssues.length > 0;
  const hasToday = analytics.upcomingNext10.length > 0;

  // Dynamic layout: if only one panel has content, let it take full width
  const showBothColumns = hasIssues && hasToday;
  const showAnyContent = hasIssues || hasToday;

  return (
    <div className="space-y-3">
      <ProgressStrip analytics={analytics} />

      {showAnyContent && (
        <div className={cn(
          "grid gap-3",
          showBothColumns ? "grid-cols-1 lg:grid-cols-3" : "grid-cols-1"
        )}>
          {/* Issues card */}
          {hasIssues && (
            <Card className={cn(
              "border-border/50 shadow-sm border-destructive/20",
              showBothColumns ? "lg:col-span-2" : ""
            )}>
              <CardContent className="p-4">
                <ActionRequired issues={analytics.criticalIssues} staffPool={staffPool} onTaskClick={onTaskClick} />
              </CardContent>
            </Card>
          )}

          {/* Today's focus card */}
          {hasToday && (
            <Card className="border-border/50 shadow-sm">
              <CardContent className="p-4">
                <TodayFocus analytics={analytics} staffPool={staffPool} onTaskClick={onTaskClick} />
              </CardContent>
            </Card>
          )}

          {/* No issues — show green state only if today panel exists */}
          {!hasIssues && hasToday && null}
        </div>
      )}
    </div>
  );
};

export default ProjectControlPanel;
