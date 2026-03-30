import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import {
  CheckCircle2, ListTodo, CalendarDays, UserX, AlertTriangle, Clock,
  Users, ArrowUpRight, AlertCircle, CalendarClock, ShieldAlert, User,
  HelpCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TaskAnalytics, TeamMemberWorkload, CriticalIssue } from "@/hooks/useTaskAnalytics";
import type { EstablishmentTask } from "@/services/establishmentTaskService";

interface ProjectControlPanelProps {
  analytics: TaskAnalytics;
  staffPool: Array<{ id: string; name: string }>;
  onTaskClick?: (taskId: string) => void;
}

// ─── Status Summary Cards ───────────────────────────────────────────────────

const StatCard = ({ icon: Icon, label, value, subtext, variant = "default" }: {
  icon: typeof CheckCircle2;
  label: string;
  value: number | string;
  subtext?: string;
  variant?: "default" | "success" | "warning" | "danger" | "info";
}) => {
  const variantStyles = {
    default: "bg-muted/50 text-muted-foreground",
    success: "bg-primary/10 text-primary",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    danger: "bg-destructive/10 text-destructive",
    info: "bg-accent text-accent-foreground",
  };

  return (
    <Card className="border-border/50 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-3.5 flex items-center gap-3">
        <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", variantStyles[variant])}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
          <span className="text-lg font-bold tracking-tight leading-tight">{value}</span>
          {subtext && <p className="text-[11px] text-muted-foreground leading-tight">{subtext}</p>}
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Team Workload ──────────────────────────────────────────────────────────

const WorkloadBadge = ({ level }: { level: "low" | "normal" | "high" }) => {
  const config = {
    low: { label: "Låg", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
    normal: { label: "Normal", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
    high: { label: "Hög", className: "bg-destructive/10 text-destructive border-destructive/20" },
  };
  const c = config[level];
  return <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 font-semibold", c.className)}>{c.label}</Badge>;
};

const TeamWorkloadSection = ({ workload, staffPool }: {
  workload: TeamMemberWorkload[];
  staffPool: Array<{ id: string; name: string }>;
}) => {
  const staffNameMap = useMemo(() => {
    const map = new Map<string, string>();
    staffPool.forEach(s => map.set(s.id, s.name));
    return map;
  }, [staffPool]);

  if (workload.length === 0) {
    return (
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Arbetsbelastning
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-sm text-muted-foreground">Ingen personal tilldelad ännu</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          Arbetsbelastning
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="space-y-2">
          {workload.map(w => {
            const name = staffNameMap.get(w.staffId) || "Okänd";
            return (
              <div key={w.staffId} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/30 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{name}</p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{w.totalTasks} uppg</span>
                      {w.inProgress > 0 && <span className="text-primary">• {w.inProgress} pågår</span>}
                      {w.overdue > 0 && <span className="text-destructive">• {w.overdue} försenad</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">{w.completed}/{w.totalTasks}</span>
                  <WorkloadBadge level={w.level} />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Upcoming Tasks ─────────────────────────────────────────────────────────

const UpcomingTaskRow = ({ task, staffPool, onTaskClick }: {
  task: EstablishmentTask;
  staffPool: Array<{ id: string; name: string }>;
  onTaskClick?: (taskId: string) => void;
}) => {
  const staffName = task.assigned_to
    ? staffPool.find(s => s.id === task.assigned_to)?.name || "—"
    : null;

  const formatDate = (d: string) => {
    try { return format(new Date(d), "d MMM", { locale: sv }); } catch { return d; }
  };

  return (
    <button
      onClick={() => onTaskClick?.(task.id)}
      className="w-full flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-accent/50 transition-colors text-left group"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{task.title}</p>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {staffName && <span className="flex items-center gap-1"><User className="h-3 w-3" />{staffName}</span>}
          <span>{formatDate(task.start_date)}</span>
        </div>
      </div>
      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </button>
  );
};

const UpcomingSection = ({ analytics, staffPool, onTaskClick }: {
  analytics: TaskAnalytics;
  staffPool: Array<{ id: string; name: string }>;
  onTaskClick?: (taskId: string) => void;
}) => {
  const hasAny = analytics.upcomingToday.length > 0 || analytics.upcomingTomorrow.length > 0 || analytics.upcomingWeek.length > 0;

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          Kommande aktiviteter
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {!hasAny ? (
          <p className="text-sm text-muted-foreground py-2">Inga kommande aktiviteter de närmaste 7 dagarna</p>
        ) : (
          <div className="space-y-3">
            {analytics.upcomingToday.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-primary uppercase tracking-wider mb-1">Idag</p>
                {analytics.upcomingToday.map(t => (
                  <UpcomingTaskRow key={t.id} task={t} staffPool={staffPool} onTaskClick={onTaskClick} />
                ))}
              </div>
            )}
            {analytics.upcomingTomorrow.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Imorgon</p>
                {analytics.upcomingTomorrow.map(t => (
                  <UpcomingTaskRow key={t.id} task={t} staffPool={staffPool} onTaskClick={onTaskClick} />
                ))}
              </div>
            )}
            {analytics.upcomingWeek.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Nästa 7 dagar</p>
                {analytics.upcomingWeek.map(t => (
                  <UpcomingTaskRow key={t.id} task={t} staffPool={staffPool} onTaskClick={onTaskClick} />
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ─── Critical Issues ────────────────────────────────────────────────────────

const issueConfig: Record<CriticalIssue["type"], { icon: typeof AlertTriangle; label: string; className: string }> = {
  blocked: { icon: ShieldAlert, label: "Blockerad", className: "text-destructive bg-destructive/10" },
  overdue: { icon: Clock, label: "Försenad", className: "text-amber-600 dark:text-amber-400 bg-amber-500/10" },
  decision_needed: { icon: HelpCircle, label: "Beslut krävs", className: "text-violet-600 dark:text-violet-400 bg-violet-500/10" },
  no_owner: { icon: UserX, label: "Saknar ägare", className: "text-orange-600 dark:text-orange-400 bg-orange-500/10" },
  no_dates: { icon: CalendarDays, label: "Saknar datum", className: "text-muted-foreground bg-muted/50" },
};

const CriticalIssuesSection = ({ issues, staffPool, onTaskClick }: {
  issues: CriticalIssue[];
  staffPool: Array<{ id: string; name: string }>;
  onTaskClick?: (taskId: string) => void;
}) => {
  if (issues.length === 0) {
    return (
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            Kritiska problem
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="flex items-center gap-2 text-sm text-primary">
            <CheckCircle2 className="h-4 w-4" />
            Inga problem att hantera
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-destructive" />
          Kritiska problem
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 ml-1">{issues.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <div className="space-y-1">
          {issues.slice(0, 8).map(issue => {
            const config = issueConfig[issue.type];
            const Icon = config.icon;
            const staffName = issue.assignedTo
              ? staffPool.find(s => s.id === issue.assignedTo)?.name
              : null;

            return (
              <button
                key={`${issue.taskId}-${issue.type}`}
                onClick={() => onTaskClick?.(issue.taskId)}
                className="w-full flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-accent/50 transition-colors text-left group"
              >
                <div className={cn("h-6 w-6 rounded-md flex items-center justify-center shrink-0", config.className)}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate group-hover:text-primary transition-colors">{issue.taskTitle}</p>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{config.label}</span>
                    {staffName && <span>• {staffName}</span>}
                  </div>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            );
          })}
          {issues.length > 8 && (
            <p className="text-[11px] text-muted-foreground px-2 pt-1">
              +{issues.length - 8} fler problem
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Main Control Panel ─────────────────────────────────────────────────────

const ProjectControlPanel = ({ analytics, staffPool, onTaskClick }: ProjectControlPanelProps) => {
  const completionPct = analytics.total > 0
    ? Math.round((analytics.completed / analytics.total) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Status Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
        <StatCard icon={ListTodo} label="Totalt" value={analytics.total} variant="info" />
        <StatCard icon={CalendarDays} label="Med datum" value={analytics.withDates} variant="default" />
        <StatCard icon={CalendarDays} label="Utan datum" value={analytics.withoutDates} variant={analytics.withoutDates > 0 ? "warning" : "default"} />
        <StatCard icon={UserX} label="Utan ägare" value={analytics.withoutOwner} variant={analytics.withoutOwner > 0 ? "warning" : "default"} />
        <StatCard icon={Clock} label="Försenade" value={analytics.overdue} variant={analytics.overdue > 0 ? "danger" : "default"} />
        <StatCard icon={ShieldAlert} label="Blockerade" value={analytics.blocked} variant={analytics.blocked > 0 ? "danger" : "default"} />
        <StatCard icon={CheckCircle2} label="Klara" value={`${analytics.completed}/${analytics.total}`} subtext={`${completionPct}%`} variant="success" />
      </div>

      {/* Three-column detail sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <TeamWorkloadSection workload={analytics.teamWorkload} staffPool={staffPool} />
        <UpcomingSection analytics={analytics} staffPool={staffPool} onTaskClick={onTaskClick} />
        <CriticalIssuesSection issues={analytics.criticalIssues} staffPool={staffPool} onTaskClick={onTaskClick} />
      </div>
    </div>
  );
};

export default ProjectControlPanel;
