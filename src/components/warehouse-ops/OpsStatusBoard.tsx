import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, ArrowDownRight, Wrench, CheckCircle2, Clock, Users, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { sv } from "date-fns/locale";
import type { OpsJob } from "@/hooks/useWarehouseOpsRange";

/**
 * Kontrollcentral-vy: jobben fördelade i kolumner efter status.
 * Ingen "lista huller om buller". Varje kolumn = en zon i operationen.
 *
 * Kolumner:
 *   1. UT idag           – planning/in_progress med UT-deadline ≤ idag
 *   2. Pågår             – in_progress (oavsett deadline)
 *   3. Klart att lämna   – packed (UT klart, väntar på leverans)
 *   4. Tillbaka          – back / returning (väntar på/pågår incheckning)
 *   5. Klart             – 100% eller signed_at (samma intervall)
 */

interface Props {
  jobs: OpsJob[];
}

type ColumnKey = "out_today" | "in_progress" | "ready_out" | "back" | "done";

interface Column {
  key: ColumnKey;
  title: string;
  short: string;
  accent: string; // border-left color
  icon: typeof ArrowUpRight;
  description: string;
  filter: (j: OpsJob, todayStr: string) => boolean;
  emptyText: string;
}

const COLUMNS: Column[] = [
  {
    key: "out_today",
    title: "UT planerat",
    short: "UT",
    accent: "border-l-blue-500",
    icon: ArrowUpRight,
    description: "Planerade UT-jobb i intervallet (sorterat på datum)",
    filter: (j) =>
      j.direction === "out" &&
      (j.status === "planning" || j.status === "in_progress") &&
      j.percent < 100,
    emptyText: "Inget planerat UT",
  },
  {
    key: "in_progress",
    title: "Pågår nu",
    short: "•",
    accent: "border-l-emerald-500",
    icon: Users,
    description: "Aktivt scannas just nu",
    filter: (j) => j.status === "in_progress" && j.workers.length > 0,
    emptyText: "Ingen scannar",
  },
  {
    key: "ready_out",
    title: "Klart att lämna",
    short: "✓UT",
    accent: "border-l-cyan-500",
    icon: CheckCircle2,
    description: "Packat, väntar leverans",
    filter: (j) => j.direction === "out" && (j.percent >= 100 || j.status === "packed"),
    emptyText: "Inget redo",
  },
  {
    key: "back",
    title: "Tillbaka",
    short: "IN",
    accent: "border-l-purple-500",
    icon: ArrowDownRight,
    description: "Väntar incheckning eller pågår retur",
    filter: (j) => j.status === "back" || j.status === "returning",
    emptyText: "Inget på retur",
  },
  {
    key: "done",
    title: "Klart",
    short: "✓",
    accent: "border-l-emerald-600",
    icon: CheckCircle2,
    description: "Färdigt i intervallet",
    filter: (j) => !!j.signedAt,
    emptyText: "Inget signerat",
  },
];

const OpsStatusBoard = ({ jobs }: Props) => {
  const navigate = useNavigate();
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const buckets = useMemo(() => {
    const map = new Map<ColumnKey, OpsJob[]>();
    for (const c of COLUMNS) map.set(c.key, []);
    for (const j of jobs) {
      // Ett jobb kan dyka upp i max EN kolumn — vi går i prioordning.
      // Done först (slutar listan), back, ready_out, in_progress, out_today.
      if (j.signedAt) {
        map.get("done")!.push(j);
        continue;
      }
      if (j.status === "back" || j.status === "returning") {
        map.get("back")!.push(j);
        continue;
      }
      if (j.direction === "out" && (j.percent >= 100 || j.status === "packed")) {
        map.get("ready_out")!.push(j);
        continue;
      }
      if (j.status === "in_progress" && j.workers.length > 0) {
        map.get("in_progress")!.push(j);
        continue;
      }
      if (
        j.direction === "out" &&
        (j.status === "planning" || j.status === "in_progress") &&
        j.percent < 100
      ) {
        map.get("out_today")!.push(j);
        continue;
      }
    }
    // Sortera varje kolumn
    for (const c of COLUMNS) {
      map.get(c.key)!.sort((a, b) => {
        const ad = a.anchorDate || "9999";
        const bd = b.anchorDate || "9999";
        if (ad !== bd) return ad < bd ? -1 : 1;
        return (a.anchorTime || "99:99") < (b.anchorTime || "99:99") ? -1 : 1;
      });
    }
    return map;
  }, [jobs, todayStr]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      {COLUMNS.map((col) => {
        const list = buckets.get(col.key) || [];
        const Icon = col.icon;
        return (
          <div
            key={col.key}
            className={cn(
              "rounded-xl border border-border/60 bg-card flex flex-col overflow-hidden",
              "min-h-[420px] max-h-[560px]",
            )}
          >
            <div className={cn("px-3 py-2.5 border-b border-border/60 border-l-4", col.accent)}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                  <h3 className="text-sm font-semibold truncate">{col.title}</h3>
                </div>
                <span className="text-xs font-bold tabular-nums px-1.5 py-0.5 rounded bg-muted text-foreground">
                  {list.length}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{col.description}</p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {list.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground italic px-3 py-6">
                  {col.emptyText}
                </div>
              ) : (
                <ul className="divide-y divide-border/40">
                  {list.map((j) => (
                    <JobCard key={j.id} job={j} onClick={() => navigate(`/warehouse/packing/${j.id}`)} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const JobCard = ({ job, onClick }: { job: OpsJob; onClick: () => void }) => {
  const isLate =
    job.direction === "out" &&
    !!job.anchorDate &&
    job.anchorDate < format(new Date(), "yyyy-MM-dd") &&
    job.percent < 100;

  const lastActMins = job.lastActivityAt
    ? differenceInMinutes(new Date(), parseISO(job.lastActivityAt))
    : null;

  const dirIcon = job.direction === "out" ? ArrowUpRight : job.direction === "in" ? ArrowDownRight : Wrench;
  const Icon = dirIcon;

  return (
    <li
      onClick={onClick}
      className="px-3 py-2 cursor-pointer hover:bg-accent/40 transition-colors text-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="font-semibold text-xs truncate">
              {job.bookingNumber || job.name}
            </span>
            {isLate && <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {job.client || job.name}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs font-bold tabular-nums">{job.percent}%</div>
          {job.anchorDate && (
            <div className="text-[10px] text-muted-foreground tabular-nums">
              {format(parseISO(job.anchorDate), "EEE d MMM", { locale: sv })}
              {job.anchorTime ? ` ${job.anchorTime.slice(0, 5)}` : ""}
            </div>
          )}
        </div>
      </div>

      {/* Compact progress bar */}
      <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full transition-all",
            job.percent >= 100 ? "bg-emerald-500" : isLate ? "bg-red-500" : "bg-warehouse",
          )}
          style={{ width: `${Math.min(100, job.percent)}%` }}
        />
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center -space-x-1.5">
          {job.workers.slice(0, 3).map((w) => (
            <span
              key={w.staffId}
              title={w.name}
              className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-warehouse text-white text-[8px] font-bold border border-card"
            >
              {w.name?.[0]?.toUpperCase() || "?"}
            </span>
          ))}
          {job.workers.length > 3 && (
            <span className="text-[10px] text-muted-foreground ml-2">+{job.workers.length - 3}</span>
          )}
        </div>
        {lastActMins !== null && lastActMins < 60 * 8 && (
          <span className="text-[10px] text-muted-foreground tabular-nums flex items-center gap-0.5">
            <Clock className="h-2.5 w-2.5" />
            {lastActMins < 60 ? `${Math.floor(lastActMins)}m` : `${Math.floor(lastActMins / 60)}h`}
          </span>
        )}
      </div>
    </li>
  );
};

export default OpsStatusBoard;
