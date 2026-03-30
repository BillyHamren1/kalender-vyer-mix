import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import {
  CheckCircle2, CalendarDays, UserX, AlertTriangle, Clock,
  ArrowUpRight, AlertCircle, ShieldAlert, User,
  HelpCircle, ChevronRight, Zap, CalendarClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskAnalytics, CriticalIssue } from "@/hooks/useTaskAnalytics";
import type { EstablishmentTask } from "@/services/establishmentTaskService";

interface ProjectControlPanelProps {
  analytics: TaskAnalytics;
  staffPool: Array<{ id: string; name: string }>;
  onTaskClick?: (taskId: string) => void;
}

// ─── Issue config ───────────────────────────────────────────────────────────

const issueConfig: Record<CriticalIssue["type"], { icon: typeof AlertTriangle; label: string; className: string; dotClass: string }> = {
  blocked:              { icon: ShieldAlert,   label: "Blockerad",       className: "text-destructive",                                         dotClass: "bg-destructive" },
  overdue:              { icon: Clock,         label: "Försenad",        className: "text-amber-600 dark:text-amber-400",                       dotClass: "bg-amber-500" },
  decision_needed:      { icon: HelpCircle,    label: "Beslut krävs",    className: "text-violet-600 dark:text-violet-400",                     dotClass: "bg-violet-500" },
  missing_setup:        { icon: AlertTriangle, label: "Saknar info",     className: "text-amber-600 dark:text-amber-400",                       dotClass: "bg-amber-500" },
  waiting_for_external: { icon: Clock,         label: "Väntar extern",   className: "text-orange-600 dark:text-orange-400",                     dotClass: "bg-orange-500" },
  no_owner:             { icon: UserX,         label: "Utan ägare",      className: "text-orange-600 dark:text-orange-400",                     dotClass: "bg-orange-500" },
  no_dates:             { icon: CalendarDays,  label: "Utan datum",      className: "text-muted-foreground",                                    dotClass: "bg-muted-foreground" },
};

// ─── Progress strip ─────────────────────────────────────────────────────────

const ProgressStrip = ({ analytics }: { analytics: TaskAnalytics }) => {
  const pct = analytics.total > 0 ? Math.round((analytics.completed / analytics.total) * 100) : 0;
  const dangerCount = analytics.overdue + analytics.blocked;
  const attentionCount = analytics.waitingForDecision + analytics.missingSetup + analytics.withoutOwner;

  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-card border border-border/50 rounded-xl shadow-sm">
      {/* Progress */}
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

      {/* Danger indicators */}
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

        {/* Key counts */}
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

// ─── Today's Focus ──────────────────────────────────────────────────────────

const TodayFocus = ({ analytics, staffPool, onTaskClick }: {
  analytics: TaskAnalytics;
  staffPool: Array<{ id: string; name: string }>;
  onTaskClick?: (taskId: string) => void;
}) => {
  const todayTasks = analytics.upcomingToday;
  const tomorrowTasks = analytics.upcomingTomorrow;

  if (todayTasks.length === 0 && tomorrowTasks.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <CalendarClock className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Pågår & kommande</h3>
      </div>
      <div className="space-y-1">
        {todayTasks.map(t => (
          <TaskRow key={t.id} task={t} staffPool={staffPool} onTaskClick={onTaskClick} highlight="today" />
        ))}
        {tomorrowTasks.length > 0 && (
          <>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pt-1.5 pb-0.5 px-1">Imorgon</p>
            {tomorrowTasks.slice(0, 3).map(t => (
              <TaskRow key={t.id} task={t} staffPool={staffPool} onTaskClick={onTaskClick} />
            ))}
            {tomorrowTasks.length > 3 && (
              <p className="text-[10px] text-muted-foreground px-1">+{tomorrowTasks.length - 3} fler</p>
            )}
          </>
        )}
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

  // Group by type for cleaner display
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
          return (
            <div key={type}>
              <div className="flex items-center gap-1.5 mb-1 px-1">
                <div className={cn("h-1.5 w-1.5 rounded-full", config.dotClass)} />
                <span className={cn("text-[11px] font-semibold uppercase tracking-wider", config.className)}>
                  {config.label} ({typeIssues.length})
                </span>
              </div>
              <div className="space-y-0.5">
                {typeIssues.slice(0, 4).map(issue => {
                  const staffName = issue.assignedTo
                    ? staffPool.find(s => s.id === issue.assignedTo)?.name
                    : null;
                  return (
                    <button
                      key={`${issue.taskId}-${issue.type}`}
                      onClick={() => onTaskClick?.(issue.taskId)}
                      className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-accent/50 transition-colors text-left group"
                    >
                      <Icon className={cn("h-3.5 w-3.5 shrink-0", config.className)} />
                      <span className="text-sm truncate flex-1 group-hover:text-primary transition-colors">{issue.taskTitle}</span>
                      {staffName && (
                        <span className="text-[10px] text-muted-foreground shrink-0">{staffName}</span>
                      )}
                      {issue.type === "blocked" && issue.blockerReason && (
                        <span className="text-[10px] text-destructive/70 truncate max-w-[120px] shrink-0" title={issue.blockerReason}>
                          {issue.blockerReason}
                        </span>
                      )}
                      <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </button>
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

// ─── Ownership overview ─────────────────────────────────────────────────────

const OwnershipOverview = ({ analytics, staffPool, onTaskClick }: {
  analytics: TaskAnalytics;
  staffPool: Array<{ id: string; name: string }>;
  onTaskClick?: (taskId: string) => void;
}) => {
  const staffNameMap = useMemo(() => {
    const map = new Map<string, string>();
    staffPool.forEach(s => map.set(s.id, s.name));
    return map;
  }, [staffPool]);

  const workload = analytics.teamWorkload;
  if (workload.length === 0 && analytics.withoutOwner === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <User className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Ägarskap</h3>
      </div>
      <div className="space-y-1.5">
        {workload.slice(0, 6).map(w => {
          const name = staffNameMap.get(w.staffId) || "Okänd";
          const hasProblems = w.overdue > 0 || w.blocked > 0;
          return (
            <div key={w.staffId} className="flex items-center justify-between gap-2 py-1 px-1">
              <div className="flex items-center gap-2 min-w-0">
                <div className={cn(
                  "h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold",
                  hasProblems ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                )}>
                  {name.charAt(0)}
                </div>
                <span className="text-sm truncate">{name}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-muted-foreground">{w.completed}/{w.totalTasks}</span>
                {w.overdue > 0 && <span className="text-[10px] font-bold text-destructive">{w.overdue} sen</span>}
                {w.blocked > 0 && <span className="text-[10px] font-bold text-destructive">{w.blocked} block</span>}
              </div>
            </div>
          );
        })}
        {analytics.withoutOwner > 0 && (
          <div className="flex items-center gap-2 py-1 px-1 text-amber-600 dark:text-amber-400">
            <UserX className="h-3.5 w-3.5" />
            <span className="text-sm font-medium">{analytics.withoutOwner} uppgifter utan ägare</span>
          </div>
        )}
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
  const staffName = task.assigned_to
    ? staffPool.find(s => s.id === task.assigned_to)?.name
    : null;

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
      {staffName ? (
        <span className="text-[10px] text-muted-foreground shrink-0">{staffName}</span>
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
  const hasToday = analytics.upcomingToday.length > 0 || analytics.upcomingTomorrow.length > 0;
  const hasContent = hasIssues || hasToday || analytics.teamWorkload.length > 0;

  return (
    <div className="space-y-3">
      {/* Level 1: Progress strip — always visible, compact */}
      <ProgressStrip analytics={analytics} />

      {/* Level 2: Operational briefing — only if there's content */}
      {hasContent && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Column 1: Action required (highest priority) */}
          <Card className={cn(
            "border-border/50 shadow-sm",
            hasIssues && "border-destructive/20"
          )}>
            <CardContent className="p-4">
              {hasIssues ? (
                <ActionRequired issues={analytics.criticalIssues} staffPool={staffPool} onTaskClick={onTaskClick} />
              ) : (
                <div className="flex items-center gap-2 py-4 justify-center text-primary">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="text-sm font-medium">Inga problem att hantera</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Column 2: Today's focus */}
          <Card className="border-border/50 shadow-sm">
            <CardContent className="p-4">
              {hasToday ? (
                <TodayFocus analytics={analytics} staffPool={staffPool} onTaskClick={onTaskClick} />
              ) : (
                <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
                  <CalendarDays className="h-5 w-5" />
                  <span className="text-sm">Inga aktiviteter idag</span>
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  );
};

export default ProjectControlPanel;
