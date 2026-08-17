import { useMemo } from "react";
import {
  AlertTriangle, CalendarClock, CheckCircle2, CircleDot, FileText,
  ListTodo, MapPin, Truck, UserRoundCheck, Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ProjectTask, TaskPhase } from "@/types/project";
import type { ProjectActivity } from "@/services/projectActivityService";
import { cn } from "@/lib/utils";

interface ProjectOverviewHeaderProps {
  tasks: ProjectTask[];
  filesCount: number;
  commentsCount: number;
  activities: ProjectActivity[];
  projectLeader?: string | null;
  rigDate?: string | null;
  eventDate?: string | null;
  rigDownDate?: string | null;
  deliveryAddress?: string | null;
  transportCount?: number;
  bookingCount?: number;
}

const dateKey = (value?: string | null) => value ? value.slice(0, 10) : null;
const phases: Array<{ key: TaskPhase; label: string }> = [
  { key: "preproduction", label: "Förproduktion" },
  { key: "planning", label: "Planering" },
  { key: "setup", label: "Rigg" },
  { key: "live", label: "Event" },
  { key: "teardown", label: "Nedrigg" },
  { key: "post", label: "Efterarbete" },
];

const ProjectOverviewHeader = ({
  tasks, filesCount, commentsCount, projectLeader, rigDate, eventDate, rigDownDate,
  deliveryAddress, transportCount, bookingCount,
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
    const unassigned = open.filter((task) => !task.assigned_to && !(task.assigned_to_ids?.length));
    const upcoming = open.filter((task) => {
      const deadline = dateKey(task.deadline || task.start_date || task.end_date);
      return !!deadline && deadline >= today;
    }).sort((a, b) => (dateKey(a.deadline || a.start_date || a.end_date) || "9999").localeCompare(dateKey(b.deadline || b.start_date || b.end_date) || "9999"));
    const progress = actionable.length > 0 ? Math.round((completed.length / actionable.length) * 100) : 100;
    return { actionable, completed, open, overdue, unassigned, upcoming, progress };
  }, [tasks, today]);

  const warnings = [
    ...(!projectLeader ? ["Projektledare saknas"] : []),
    ...(!eventDate ? ["Eventdatum saknas"] : []),
    ...(!deliveryAddress ? ["Leveransadress saknas"] : []),
    ...(summary.overdue.length ? [`${summary.overdue.length} försenad${summary.overdue.length === 1 ? " aktivitet" : "e aktiviteter"}`] : []),
    ...(summary.unassigned.length ? [`${summary.unassigned.length} öppen${summary.unassigned.length === 1 ? " aktivitet saknar" : "a aktiviteter saknar"} ansvarig`] : []),
  ];
  const nextTask = summary.upcoming[0] || null;
  const phaseProgress = (phase: TaskPhase) => {
    const matching = summary.actionable.filter(t => t.phase === phase);
    if (!matching.length) return null;
    return Math.round((matching.filter(t => t.completed).length / matching.length) * 100);
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="p-5 sm:p-6 border-b border-border/50 bg-card">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CircleDot className={cn("h-4 w-4", warnings.length ? "text-amber-600" : "text-emerald-600")} />
                  <h2 className="text-base font-semibold">Projektläge</h2>
                  {bookingCount !== undefined && bookingCount > 1 && <span className="text-xs text-muted-foreground">· {bookingCount} leveranser</span>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {warnings.length ? `${warnings.length} punkt${warnings.length === 1 ? "" : "er"} behöver din uppmärksamhet.` : summary.open.length ? "Projektet är under kontroll. Nästa aktivitet visas nedan." : "Inga öppna aktiviteter just nu."}
                </p>
              </div>
              <div className="min-w-[240px] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Genomförda aktiviteter</span>
                  <span className="font-semibold">{summary.progress}%</span>
                </div>
                <Progress value={summary.progress} className="h-2" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-5 divide-x divide-y xl:divide-y-0 divide-border/50">
            <Metric icon={ListTodo} label="Öppet" value={summary.open.length} sub={`av ${summary.actionable.length} aktiviteter`} />
            <Metric icon={AlertTriangle} label="Åtgärd" value={warnings.length} sub={warnings.length ? "kontrollpunkter" : "inga avvikelser"} warn={warnings.length > 0} />
            <Metric icon={CalendarClock} label="Nästa" value={nextTask?.title || "Ingen planerad"} sub={nextTask ? dateKey(nextTask.deadline || nextTask.start_date || nextTask.end_date) || "Datum saknas" : "—"} compact />
            <Metric icon={UserRoundCheck} label="Ansvar" value={projectLeader || "Saknas"} sub={summary.unassigned.length ? `${summary.unassigned.length} aktivitet(er) utan ansvarig` : "aktiviteter tilldelade"} compact warn={!projectLeader} />
            <Metric icon={FileText} label="Underlag" value={filesCount} sub={commentsCount > 0 ? `${commentsCount} kommentarer` : "filer i projektet"} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border/50 border-t border-border/50">
            <StatusLine icon={MapPin} label="Plats" value={deliveryAddress || "Leveransadress saknas"} ok={!!deliveryAddress} />
            <StatusLine icon={Truck} label="Transport" value={transportCount === undefined ? "Öppna Logistik för status" : transportCount > 0 ? `${transportCount} bokad${transportCount === 1 ? " transport" : "e transporter"}` : "Ingen transport bokad"} ok={transportCount === undefined || transportCount > 0} />
            <StatusLine icon={Users} label="Projektledning" value={projectLeader ? `Ansvarig: ${projectLeader}` : "Tilldela projektledare"} ok={!!projectLeader} />
          </div>

          {warnings.length > 0 && (
            <div className="px-5 py-4 bg-amber-50/70 dark:bg-amber-950/15 border-t border-amber-200/60 dark:border-amber-900/30">
              <div className="flex items-center gap-2 mb-2"><AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" /><span className="text-sm font-semibold">Behöver din uppmärksamhet</span></div>
              <div className="flex flex-wrap gap-2">
                {warnings.map((warning) => <span key={warning} className="text-xs rounded-md border border-amber-200/70 bg-background/70 px-2.5 py-1.5">{warning}</span>)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <div><h3 className="text-sm font-semibold">Projektfaser</h3><p className="text-xs text-muted-foreground mt-0.5">Samma arbetsmodell från förproduktion till efterarbete.</p></div>
            <div className="hidden sm:flex items-center gap-3 text-[11px] text-muted-foreground"><span>Rigg {dateKey(rigDate) || "—"}</span><span>Event {dateKey(eventDate) || "—"}</span><span>Nedrigg {dateKey(rigDownDate) || "—"}</span></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            {phases.map((phase) => {
              const value = phaseProgress(phase.key);
              return <div key={phase.key} className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5"><div className="flex items-center gap-1.5"><CheckCircle2 className={cn("h-3.5 w-3.5", value === 100 ? "text-emerald-600" : "text-muted-foreground")} /><span className="text-xs font-medium">{phase.label}</span></div><div className="text-[11px] text-muted-foreground mt-1">{value === null ? "Ingen aktivitet" : `${value}% klart`}</div></div>;
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const Metric = ({ icon: Icon, label, value, sub, compact, warn }: any) => <div className="p-4 sm:p-5 min-w-0"><div className="flex items-center gap-2 text-muted-foreground mb-2"><Icon className={cn("h-4 w-4", warn && "text-amber-600")} /><span className="text-xs font-medium uppercase tracking-wide">{label}</span></div><div className={cn(compact ? "text-sm font-semibold truncate" : "text-2xl font-semibold", warn && "text-amber-700")}>{value}</div><p className="text-xs text-muted-foreground mt-1 truncate">{sub}</p></div>;
const StatusLine = ({ icon: Icon, label, value, ok }: any) => <div className="bg-card px-4 py-3 flex items-center gap-3 min-w-0"><div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", ok ? "bg-emerald-500/10" : "bg-amber-500/10")}><Icon className={cn("h-4 w-4", ok ? "text-emerald-700" : "text-amber-700")} /></div><div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="text-xs font-medium truncate">{value}</p></div></div>;

export default ProjectOverviewHeader;
