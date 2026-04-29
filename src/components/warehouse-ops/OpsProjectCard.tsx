import { useNavigate } from "react-router-dom";
import { ArrowDownToLine, ArrowUpFromLine, Boxes, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatDistanceToNow, differenceInCalendarDays, parseISO, isValid } from "date-fns";
import { sv } from "date-fns/locale";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { OpsProject } from "@/hooks/useWarehouseOpsBoard";
import { cn } from "@/lib/utils";

interface Props {
  project: OpsProject;
  emphasis?: "active" | "overdue" | "soon" | "upcoming" | "done";
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function deadlineLabel(p: OpsProject): { text: string; tone: "danger" | "warn" | "muted" | "ok" } {
  if (p.signedAt) {
    return { text: `Signerad ${formatDistanceToNow(parseISO(p.signedAt), { addSuffix: true, locale: sv })}`, tone: "ok" };
  }
  const dateStr = p.startDate;
  if (!dateStr) return { text: "Ingen deadline", tone: "muted" };
  const d = parseISO(dateStr);
  if (!isValid(d)) return { text: "Ingen deadline", tone: "muted" };
  const days = differenceInCalendarDays(d, new Date());
  if (days < 0) return { text: `${Math.abs(days)} dagar försenat`, tone: "danger" };
  if (days === 0) return { text: "Idag", tone: "warn" };
  if (days === 1) return { text: "Imorgon", tone: "warn" };
  if (days <= 3) return { text: `Om ${days} dagar`, tone: "warn" };
  return { text: `Om ${days} dagar`, tone: "muted" };
}

const directionMeta = {
  out: { label: "UT", icon: ArrowUpFromLine, classes: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  in: { label: "IN", icon: ArrowDownToLine, classes: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  internal: { label: "INTERN", icon: Boxes, classes: "bg-muted text-muted-foreground border-border" },
} as const;

export default function OpsProjectCard({ project, emphasis }: Props) {
  const navigate = useNavigate();
  const dir = directionMeta[project.direction];
  const DirIcon = dir.icon;
  const dl = deadlineLabel(project);

  const tonClasses = {
    danger: "text-destructive",
    warn: "text-amber-600",
    muted: "text-muted-foreground",
    ok: "text-emerald-600",
  } as const;

  const borderEmphasis =
    emphasis === "overdue"
      ? "border-destructive/40 hover:border-destructive/60"
      : emphasis === "active"
      ? "border-primary/40 hover:border-primary/60"
      : emphasis === "done"
      ? "border-emerald-500/30 hover:border-emerald-500/50"
      : "border-border/60 hover:border-border";

  const handleClick = () => {
    // Prefer warehouse project hub, fall back to packing detail
    if (project.warehouseProjectId) navigate(`/warehouse/project/${project.warehouseProjectId}`);
    else navigate(`/warehouse/packing/${project.id}`);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "text-left w-full bg-card rounded-xl border p-4 transition-all shadow-sm hover:shadow-md",
        borderEmphasis
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className={cn("h-5 px-1.5 text-[10px] font-semibold gap-1", dir.classes)}>
              <DirIcon className="h-3 w-3" />
              {dir.label}
            </Badge>
            {project.bookingNumber && (
              <span className="text-[11px] text-muted-foreground font-mono">#{project.bookingNumber}</span>
            )}
          </div>
          <h3 className="font-semibold text-sm leading-tight truncate">{project.name}</h3>
          {project.client && project.client !== project.name && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{project.client}</p>
          )}
        </div>
        {emphasis === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />}
        {emphasis === "overdue" && <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />}
      </div>

      {/* Progress */}
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium tabular-nums">
            {project.verifiedItems} / {project.totalItems}
          </span>
          <span className={cn("tabular-nums font-semibold", project.percent >= 100 ? "text-emerald-600" : "text-foreground")}>
            {project.percent}%
          </span>
        </div>
        <Progress value={project.percent} className="h-1.5" />
      </div>

      {/* Footer: deadline + workers */}
      <div className="flex items-center justify-between gap-2">
        <div className={cn("flex items-center gap-1 text-xs", tonClasses[dl.tone])}>
          <Clock className="h-3 w-3" />
          <span className="truncate">{dl.text}</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {project.signedByName && project.signedAt && (
            <span className="text-[10px] text-muted-foreground mr-1 hidden sm:inline">
              av {project.signedByName.split(" ")[0]}
            </span>
          )}
          {project.workers.length > 0 ? (
            <div className="flex -space-x-1.5">
              {project.workers.slice(0, 3).map((w) => (
                <Avatar key={w.staffId} className="h-6 w-6 border-2 border-card">
                  <AvatarFallback className="text-[9px] bg-primary/10 text-primary font-semibold">
                    {initials(w.name)}
                  </AvatarFallback>
                </Avatar>
              ))}
              {project.workers.length > 3 && (
                <Avatar className="h-6 w-6 border-2 border-card">
                  <AvatarFallback className="text-[9px] bg-muted text-muted-foreground">
                    +{project.workers.length - 3}
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground italic">Ingen aktiv</span>
          )}
        </div>
      </div>
    </button>
  );
}
