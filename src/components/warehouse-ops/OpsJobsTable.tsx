import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO, isValid } from "date-fns";
import { sv } from "date-fns/locale";
import { ArrowUpRight, ArrowDownRight, Wrench, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { PACKING_STATUS_LABELS, type PackingStatus } from "@/types/packing";
import type { OpsJob, OpsMode } from "@/hooks/useWarehouseOpsRange";

interface Props {
  jobs: OpsJob[];
  mode: OpsMode;
  onPickDay?: (date: Date) => void;
}

const dirIcon = (dir: OpsJob["direction"]) =>
  dir === "out" ? ArrowUpRight : dir === "in" ? ArrowDownRight : Wrench;

const dirColor = (dir: OpsJob["direction"]) =>
  dir === "out"
    ? "bg-blue-500/10 text-blue-700 border-blue-500/30"
    : dir === "in"
      ? "bg-purple-500/10 text-purple-700 border-purple-500/30"
      : "bg-slate-500/10 text-slate-700 border-slate-500/30";

const OpsJobsTable = ({ jobs, mode, onPickDay }: Props) => {
  const navigate = useNavigate();

  const grouped = useMemo(() => {
    if (mode === "day") return [{ key: "all", date: null as Date | null, jobs }];
    const byDay = new Map<string, { date: Date; jobs: OpsJob[] }>();
    for (const j of jobs) {
      const key = j.anchorDate || "ingen";
      const existing = byDay.get(key);
      if (existing) existing.jobs.push(j);
      else {
        byDay.set(key, {
          date: j.anchorDate && isValid(parseISO(j.anchorDate)) ? parseISO(j.anchorDate) : new Date(),
          jobs: [j],
        });
      }
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, val]) => ({ key, ...val }));
  }, [jobs, mode]);

  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">
        Inga lagerjobb i valt intervall.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border/60">
        <h2 className="text-sm font-semibold">Jobb</h2>
      </div>

      {grouped.map((group) => (
        <div key={group.key}>
          {mode === "week" && group.date && (
            <button
              onClick={() => onPickDay?.(group.date!)}
              className="w-full text-left px-4 py-1.5 bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/70 transition"
            >
              {format(group.date, "EEEE d MMM", { locale: sv })} · {group.jobs.length} jobb
            </button>
          )}
          <ul className="divide-y divide-border/40">
            {group.jobs
              .slice()
              .sort((a, b) => {
                // active first
                const aw = a.workers.length > 0 ? 0 : 1;
                const bw = b.workers.length > 0 ? 0 : 1;
                if (aw !== bw) return aw - bw;
                return (a.anchorTime || "99:99") < (b.anchorTime || "99:99") ? -1 : 1;
              })
              .map((j) => (
                <JobRow key={j.id} job={j} onClick={() => navigate(`/warehouse/packing/${j.id}`)} />
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

const JobRow = ({ job, onClick }: { job: OpsJob; onClick: () => void }) => {
  const Icon = dirIcon(job.direction);
  const isDone = job.percent >= 100 || !!job.signedAt;
  const statusLabel = PACKING_STATUS_LABELS[job.status as PackingStatus] || job.status;

  return (
    <li
      onClick={onClick}
      className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_2fr_3fr_2fr_auto] gap-3 items-center px-4 py-2.5 text-sm cursor-pointer hover:bg-accent/40 transition-colors"
    >
      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium", dirColor(job.direction))}>
        <Icon className="h-3.5 w-3.5" />
        {job.direction === "out" ? "UT" : job.direction === "in" ? "IN" : "INT"}
      </span>

      <div className="min-w-0">
        <div className="font-medium truncate">
          {job.bookingNumber ? `${job.bookingNumber} · ${job.client || job.name}` : job.name}
        </div>
        <div className="text-xs text-muted-foreground truncate">{statusLabel}</div>
      </div>

      <div className="hidden md:flex items-center gap-2 min-w-0">
        <Progress value={job.percent} className="h-1.5 flex-1" />
        <span className="text-xs text-muted-foreground w-10 text-right">{job.percent}%</span>
      </div>

      <div className="hidden md:flex items-center gap-1 -space-x-1.5">
        {job.workers.slice(0, 3).map((w) => (
          <span
            key={w.staffId}
            title={w.name}
            className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-warehouse text-white text-[10px] font-bold border-2 border-card"
          >
            {w.name?.[0]?.toUpperCase() || "?"}
          </span>
        ))}
        {job.workers.length > 3 && (
          <span className="inline-flex items-center justify-center h-6 px-1.5 rounded-full bg-muted text-[10px] font-medium border-2 border-card">
            +{job.workers.length - 3}
          </span>
        )}
        {job.workers.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
      </div>

      <div className="text-right text-xs text-muted-foreground tabular-nums whitespace-nowrap flex items-center gap-1 justify-end">
        {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
        {job.anchorTime ? job.anchorTime.slice(0, 5) : job.anchorDate?.slice(5) || "—"}
      </div>
    </li>
  );
};

export default OpsJobsTable;
