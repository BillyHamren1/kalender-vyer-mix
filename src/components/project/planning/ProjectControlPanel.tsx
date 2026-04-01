import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import {
  CheckCircle2, CalendarDays, UserX, AlertTriangle, Clock,
  AlertCircle, ShieldAlert, User, Users,
  HelpCircle, ChevronRight, Zap, CalendarClock,
  ListTodo, CircleDot, UserCog, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { updateEstablishmentTask, bulkUpdateEstablishmentTasks, BSAValidationError } from "@/services/establishmentTaskService";
import { toast } from "sonner";
import type { TaskAnalytics, CriticalIssue } from "@/hooks/useTaskAnalytics";
import type { EstablishmentTask } from "@/services/establishmentTaskService";

export interface OverviewFilter {
  status?: string;
  person?: string;
  section?: "overdue" | "today" | "unassigned" | "all";
}

interface ProjectControlPanelProps {
  analytics: TaskAnalytics;
  staffPool: Array<{ id: string; name: string }>;
  onTaskClick?: (taskId: string) => void;
  onFilterChange?: (filter: OverviewFilter) => void;
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

// ─── Metrics Row ────────────────────────────────────────────────────────────

const MetricsRow = ({ analytics, onFilterChange }: {
  analytics: TaskAnalytics;
  onFilterChange?: (filter: OverviewFilter) => void;
}) => {
  const pct = analytics.total > 0 ? Math.round((analytics.completed / analytics.total) * 100) : 0;
  const pending = analytics.total - analytics.completed;

  const metrics = [
    { label: "Totalt", value: analytics.total, icon: ListTodo, color: "text-foreground", bg: "bg-muted/50", filter: { section: "all" as const } },
    { label: "Klara", value: analytics.completed, icon: CheckCircle2, color: "text-primary", bg: "bg-primary/10", filter: { status: "done" } },
    { label: "Pågår", value: analytics.inProgress, icon: CircleDot, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10", filter: { status: "in_progress" } },
    { label: "Kvar", value: pending, icon: Clock, color: "text-muted-foreground", bg: "bg-muted/50", filter: { status: "todo" } },
    { label: "Försenade", value: analytics.overdue, icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10", filter: { section: "overdue" as const }, alert: true },
    { label: "Utan ägare", value: analytics.withoutOwner, icon: UserX, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10", filter: { section: "unassigned" as const }, alert: true },
  ];

  return (
    <div className="space-y-2">
      {/* Progress bar */}
      <div className="flex items-center gap-3 px-1">
        <span className="text-2xl font-bold tracking-tight">{pct}%</span>
        <Progress value={pct} className="flex-1 h-2.5" />
        <span className="text-xs text-muted-foreground whitespace-nowrap">{analytics.completed}/{analytics.total}</span>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {metrics.map((m) => (
          <button
            key={m.label}
            onClick={() => onFilterChange?.(m.filter)}
            className={cn(
              "flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border border-border/50 transition-all hover:shadow-md hover:border-border cursor-pointer",
              m.alert && m.value > 0 ? m.bg : "bg-card"
            )}
          >
            <m.icon className={cn("h-4 w-4", m.color)} />
            <span className={cn("text-xl font-bold leading-none tabular-nums", m.value === 0 && "text-muted-foreground")}>{m.value}</span>
            <span className="text-[10px] text-muted-foreground leading-none">{m.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ─── Section: Overdue ───────────────────────────────────────────────────────

const OverdueSection = ({ analytics, staffPool, userMap, onTaskClick, onFilterChange }: {
  analytics: TaskAnalytics;
  staffPool: Array<{ id: string; name: string }>;
  userMap?: Record<string, string>;
  onTaskClick?: (taskId: string) => void;
  onFilterChange?: (filter: OverviewFilter) => void;
}) => {
  const overdueTasks = useMemo(() => {
    return analytics.criticalIssues.filter(i => i.type === "overdue" || i.type === "blocked");
  }, [analytics.criticalIssues]);

  if (overdueTasks.length === 0) return null;

  return (
    <SectionCard
      icon={AlertTriangle}
      title="Försenade & blockerade"
      count={overdueTasks.length}
      variant="danger"
      onHeaderClick={() => onFilterChange?.({ section: "overdue" })}
    >
      {overdueTasks.slice(0, 5).map(issue => {
        const config = issueConfig[issue.type];
        const Icon = config.icon;
        const staffName = issue.assignedTo ? staffPool.find(s => s.id === issue.assignedTo)?.name : null;
        return (
          <div
            key={`${issue.taskId}-${issue.type}`}
            onClick={() => onTaskClick?.(issue.taskId)}
            className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer group"
          >
            <Icon className={cn("h-3.5 w-3.5 shrink-0", config.className)} />
            <span className="text-sm truncate flex-1 group-hover:text-primary transition-colors">{issue.taskTitle}</span>
            {staffName && <span className="text-[10px] text-muted-foreground shrink-0">{staffName}</span>}
            {!staffName && issue.type !== "blocked" && (
              <InlineStaffAssign taskId={issue.taskId} staffPool={staffPool} />
            )}
            <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
          </div>
        );
      })}
      {overdueTasks.length > 5 && (
        <button onClick={() => onFilterChange?.({ section: "overdue" })} className="text-[11px] text-primary px-2 py-1 hover:underline">
          Visa alla {overdueTasks.length} →
        </button>
      )}
    </SectionCard>
  );
};

// ─── Section: Today ─────────────────────────────────────────────────────────

const TodaySection = ({ analytics, staffPool, userMap, onTaskClick, onFilterChange }: {
  analytics: TaskAnalytics;
  staffPool: Array<{ id: string; name: string }>;
  userMap?: Record<string, string>;
  onTaskClick?: (taskId: string) => void;
  onFilterChange?: (filter: OverviewFilter) => void;
}) => {
  const todayTasks = analytics.upcomingToday;
  if (todayTasks.length === 0) return null;

  return (
    <SectionCard
      icon={CalendarClock}
      title="Idag"
      count={todayTasks.length}
      variant="primary"
      onHeaderClick={() => onFilterChange?.({ section: "today" })}
    >
      {todayTasks.slice(0, 5).map(task => (
        <TaskRow key={task.id} task={task} staffPool={staffPool} onTaskClick={onTaskClick} highlight="today" />
      ))}
      {todayTasks.length > 5 && (
        <button onClick={() => onFilterChange?.({ section: "today" })} className="text-[11px] text-primary px-2 py-1 hover:underline">
          Visa alla {todayTasks.length} →
        </button>
      )}
    </SectionCard>
  );
};

// ─── Section: Unassigned ────────────────────────────────────────────────────

const UnassignedSection = ({ analytics, staffPool, onTaskClick, onFilterChange }: {
  analytics: TaskAnalytics;
  staffPool: Array<{ id: string; name: string }>;
  onTaskClick?: (taskId: string) => void;
  onFilterChange?: (filter: OverviewFilter) => void;
}) => {
  const unassigned = useMemo(() => {
    return analytics.tasks.filter(t =>
      t.status !== 'done' &&
      (!t.assigned_to_ids || t.assigned_to_ids.length === 0) &&
      !t.assigned_to && !t.assigned_user_id
    );
  }, [analytics.tasks]);

  if (unassigned.length === 0) return null;

  const taskIds = unassigned.map(t => t.id);

  return (
    <SectionCard
      icon={UserX}
      title="Utan ansvarig"
      count={unassigned.length}
      variant="warning"
      onHeaderClick={() => onFilterChange?.({ section: "unassigned" })}
      headerAction={staffPool.length > 0 ? <BulkAssignButton taskIds={taskIds} staffPool={staffPool} /> : undefined}
    >
      {unassigned.slice(0, 4).map(task => (
        <div
          key={task.id}
          onClick={() => onTaskClick?.(task.id)}
          className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer group"
        >
          <UserX className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-sm truncate flex-1 group-hover:text-primary transition-colors">{task.title}</span>
          <InlineStaffAssign taskId={task.id} staffPool={staffPool} />
          <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
        </div>
      ))}
      {unassigned.length > 4 && (
        <button onClick={() => onFilterChange?.({ section: "unassigned" })} className="text-[11px] text-primary px-2 py-1 hover:underline">
          Visa alla {unassigned.length} →
        </button>
      )}
    </SectionCard>
  );
};

// ─── Section: Tasks per person ──────────────────────────────────────────────

const PersonSection = ({ analytics, staffPool, onFilterChange }: {
  analytics: TaskAnalytics;
  staffPool: Array<{ id: string; name: string }>;
  onFilterChange?: (filter: OverviewFilter) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const workload = analytics.teamWorkload;

  const enriched = useMemo(() => {
    return workload
      .map(w => ({
        ...w,
        staffName: staffPool.find(s => s.id === w.staffId)?.name || w.staffId.slice(0, 8),
      }))
      .sort((a, b) => b.totalTasks - a.totalTasks);
  }, [workload, staffPool]);

  if (workload.length === 0) return null;

  const shown = expanded ? enriched : enriched.slice(0, 4);

  return (
    <SectionCard icon={Users} title="Per person" count={enriched.length} variant="neutral">
      <div className="space-y-1">
        {shown.map(p => {
          const donePct = p.totalTasks > 0 ? Math.round((p.completed / p.totalTasks) * 100) : 0;
          return (
            <button
              key={p.staffId}
              onClick={() => onFilterChange?.({ person: p.staffId })}
              className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-accent/50 transition-colors text-left group"
            >
              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm truncate flex-1 group-hover:text-primary transition-colors">{p.staffName}</span>
              <div className="flex items-center gap-2 shrink-0">
                {p.overdue > 0 && (
                  <span className="text-[10px] font-semibold text-destructive">{p.overdue} sena</span>
                )}
                <Progress value={donePct} className="w-12 h-1.5" />
                <span className="text-[10px] text-muted-foreground tabular-nums w-14 text-right">
                  {p.completed}/{p.totalTasks}
                </span>
              </div>
              <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
            </button>
          );
        })}
      </div>
      {enriched.length > 4 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[11px] text-primary px-2 py-1 hover:underline"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? "Visa färre" : `Visa alla ${enriched.length}`}
        </button>
      )}
    </SectionCard>
  );
};

// ─── Action Required (kept from original) ───────────────────────────────────

const ActionRequired = ({ issues, staffPool, onTaskClick }: {
  issues: CriticalIssue[];
  staffPool: Array<{ id: string; name: string }>;
  onTaskClick?: (taskId: string) => void;
}) => {
  const filteredIssues = useMemo(() => 
    issues.filter(i => 
      i.type !== "overdue" && i.type !== "blocked" && i.type !== "no_owner"
    ), [issues]);

  const grouped = useMemo(() => {
    const map = new Map<CriticalIssue["type"], CriticalIssue[]>();
    filteredIssues.forEach(issue => {
      if (!map.has(issue.type)) map.set(issue.type, []);
      map.get(issue.type)!.push(issue);
    });
    return Array.from(map.entries());
  }, [filteredIssues]);

  if (filteredIssues.length === 0) return null;

  return (
    <SectionCard icon={Zap} title="Övriga problem" count={filteredIssues.length} variant="warning">
      <div className="space-y-3">
        {grouped.map(([type, typeIssues]) => {
          const config = issueConfig[type];
          const Icon = config.icon;
          return (
            <div key={type}>
              <div className="flex items-center gap-1.5 mb-0.5 px-1">
                <div className={cn("h-1.5 w-1.5 rounded-full", config.dotClass)} />
                <span className={cn("text-[11px] font-semibold uppercase tracking-wider flex-1", config.className)}>
                  {config.label} ({typeIssues.length})
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground px-1 mb-1">{config.hint}</p>
              {typeIssues.slice(0, 3).map(issue => {
                const staffName = issue.assignedTo
                  ? staffPool.find(s => s.id === issue.assignedTo)?.name
                  : null;
                return (
                  <div
                    key={`${issue.taskId}-${issue.type}`}
                    className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer group"
                    onClick={() => onTaskClick?.(issue.taskId)}
                  >
                    <Icon className={cn("h-3.5 w-3.5 shrink-0", config.className)} />
                    <span className="text-sm truncate flex-1 group-hover:text-primary transition-colors">{issue.taskTitle}</span>
                    {type === "no_dates" && <InlineDatePicker taskId={issue.taskId} />}
                    {staffName && <span className="text-[10px] text-muted-foreground shrink-0">{staffName}</span>}
                    <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                  </div>
                );
              })}
              {typeIssues.length > 3 && (
                <p className="text-[10px] text-muted-foreground px-2">+{typeIssues.length - 3} fler</p>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
};

// ─── Shared components ──────────────────────────────────────────────────────

const SectionCard = ({ icon: Icon, title, count, variant, children, onHeaderClick, headerAction }: {
  icon: typeof AlertTriangle;
  title: string;
  count: number;
  variant: "danger" | "warning" | "primary" | "neutral";
  children: React.ReactNode;
  onHeaderClick?: () => void;
  headerAction?: React.ReactNode;
}) => {
  const borderClass = {
    danger: "border-destructive/20",
    warning: "border-amber-500/20",
    primary: "border-primary/20",
    neutral: "border-border/50",
  }[variant];

  const badgeVariant = {
    danger: "destructive" as const,
    warning: "secondary" as const,
    primary: "secondary" as const,
    neutral: "secondary" as const,
  }[variant];

  return (
    <Card className={cn("border shadow-sm", borderClass)}>
      <CardContent className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <Icon className={cn("h-4 w-4", {
            "text-destructive": variant === "danger",
            "text-amber-600 dark:text-amber-400": variant === "warning",
            "text-primary": variant === "primary",
            "text-muted-foreground": variant === "neutral",
          })} />
          <button
            onClick={onHeaderClick}
            className={cn("text-sm font-semibold text-foreground flex-1 text-left", onHeaderClick && "hover:text-primary transition-colors")}
          >
            {title}
          </button>
          <Badge variant={badgeVariant} className="text-[10px] px-1.5 py-0 h-4">{count}</Badge>
          {headerAction}
        </div>
        {children}
      </CardContent>
    </Card>
  );
};

const TaskRow = ({ task, staffPool, userMap, onTaskClick, highlight }: {
  task: EstablishmentTask;
  staffPool: Array<{ id: string; name: string }>;
  userMap?: Record<string, string>;
  onTaskClick?: (taskId: string) => void;
  highlight?: "today";
}) => {
  const staffNames = (() => {
    const ids = task.assigned_to_ids?.length ? task.assigned_to_ids : (task.assigned_to ? [task.assigned_to] : []);
    return ids.map(id => staffPool.find(s => s.id === id)?.name).filter(Boolean) as string[];
  })();

  // Check internal user assignment
  const userName = task.assigned_user_id && userMap ? userMap[task.assigned_user_id] : null;
  const hasOwner = staffNames.length > 0 || !!userName;

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
      {hasOwner ? (
        <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-1">
          {staffNames.length > 0 && <><User className="h-2.5 w-2.5 inline" />{staffNames.join(", ")}</>}
          {userName && !staffNames.length && <><UserCog className="h-2.5 w-2.5 inline" />{userName}</>}
        </span>
      ) : (
        <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0">Utan ägare</span>
      )}
      <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </button>
  );
};

// ─── Inline staff assign dropdown ───────────────────────────────────────────

const InlineStaffAssign = ({ taskId, staffPool }: {
  taskId: string;
  staffPool: Array<{ id: string; name: string }>;
}) => {
  const queryClient = useQueryClient();

  const handleAssign = async (staffId: string) => {
    try {
      await updateEstablishmentTask(taskId, { assigned_to_ids: [staffId], assigned_to: staffId });
      queryClient.invalidateQueries({ queryKey: ["establishment-tasks-analytics"] });
      const name = staffPool.find(s => s.id === staffId)?.name || "person";
      toast.success(`Tilldelad till ${name}`);
    } catch (e) {
      toast.error(e instanceof BSAValidationError ? "Personen måste först bemannas via kalendern" : "Kunde inte tilldela");
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
    } catch (e) {
      toast.error(e instanceof BSAValidationError ? "Personen måste först bemannas via kalendern" : "Kunde inte tilldela");
    }
  };

  return (
    <Select onValueChange={handleBulkAssign}>
      <SelectTrigger className="h-5 w-auto text-[10px] border-0 bg-transparent gap-1 px-1 text-primary hover:text-primary/80" onClick={(e) => e.stopPropagation()}>
        <Users className="h-3 w-3" />
        <SelectValue placeholder="Tilldela alla →" />
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        {staffPool.map(s => (
          <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

// ─── Main Control Panel ─────────────────────────────────────────────────────

const ProjectControlPanel = ({ analytics, staffPool, onTaskClick, onFilterChange }: ProjectControlPanelProps) => {
  // Resolve internal user names for display in task rows
  const internalUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of analytics.tasks) {
      if (t.assigned_user_id) ids.add(t.assigned_user_id);
    }
    return Array.from(ids);
  }, [analytics.tasks]);

  const { data: userMap = {} } = useQuery({
    queryKey: ["control-panel-users", internalUserIds.join(",")],
    queryFn: async () => {
      if (internalUserIds.length === 0) return {};
      const { data } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", internalUserIds);
      const map: Record<string, string> = {};
      (data || []).forEach((u) => {
        map[u.user_id] = u.full_name || u.email || "Okänd";
      });
      return map;
    },
    enabled: internalUserIds.length > 0,
  });

  return (
    <div className="space-y-3">
      {/* Metrics overview */}
      <Card className="border-border/50 shadow-sm">
        <CardContent className="p-4">
          <MetricsRow analytics={analytics} onFilterChange={onFilterChange} />
        </CardContent>
      </Card>

      {/* Sections grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <OverdueSection analytics={analytics} staffPool={staffPool} userMap={userMap} onTaskClick={onTaskClick} onFilterChange={onFilterChange} />
        <TodaySection analytics={analytics} staffPool={staffPool} userMap={userMap} onTaskClick={onTaskClick} onFilterChange={onFilterChange} />
        <UnassignedSection analytics={analytics} staffPool={staffPool} onTaskClick={onTaskClick} onFilterChange={onFilterChange} />
        <PersonSection analytics={analytics} staffPool={staffPool} userMap={userMap} onFilterChange={onFilterChange} />
      </div>

      {/* Other issues */}
      <ActionRequired issues={analytics.criticalIssues} staffPool={staffPool} onTaskClick={onTaskClick} />
    </div>
  );
};

export default ProjectControlPanel;
