import React, { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  Inbox,
  PackageOpen,
  UserRoundPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConvertInboxDialog } from "@/components/warehouse/ConvertInboxDialog";
import QuickAssignStaffPopover from "@/components/warehouse-ops/QuickAssignStaffPopover";
import { cn } from "@/lib/utils";
import { fetchInbox } from "@/services/warehouseProjectService";
import type { OpsAttention, OpsJob } from "@/hooks/useWarehouseOpsRange";
import type { WarehouseProjectInboxItem } from "@/types/warehouseProject";

interface Props {
  jobs: OpsJob[];
  attention: OpsAttention[];
}

type QueueItem =
  | { id: string; priority: 0 | 1 | 2; kind: "inbox"; inbox: WarehouseProjectInboxItem }
  | { id: string; priority: 0 | 1 | 2; kind: "attention"; attention: OpsAttention }
  | { id: string; priority: 0 | 1 | 2; kind: "unstaffed" | "no-time"; job: OpsJob };

const DONE = new Set(["completed", "done", "completed_in", "completed_out"]);

function queueItems(
  inbox: WarehouseProjectInboxItem[],
  attention: OpsAttention[],
  jobs: OpsJob[],
): QueueItem[] {
  const items: QueueItem[] = [];

  inbox.forEach((item) => items.push({
    id: `inbox-${item.id}`,
    priority: 1,
    kind: "inbox",
    inbox: item,
  }));

  attention.forEach((item) => items.push({
    id: `attention-${item.id}`,
    priority: item.level === "critical" ? 0 : item.level === "warning" ? 1 : 2,
    kind: "attention",
    attention: item,
  }));

  jobs.filter((job) => !DONE.has(job.status)).forEach((job) => {
    const hasPeople = job.assignedStaff.length > 0 || job.workers.length > 0;
    if (!hasPeople) {
      items.push({ id: `unstaffed-${job.id}`, priority: 1, kind: "unstaffed", job });
    }
    const hasPlannedTime = !!job.anchorTime || job.assignedStaff.some((a) => !!a.startTime);
    // Ett helt obemannat jobb får en enda tydlig första action. Tidsfrågan
    // visas först när någon faktiskt är tilldelad, så kön inte dubblar samma jobb.
    if (hasPeople && !hasPlannedTime) {
      items.push({ id: `no-time-${job.id}`, priority: 2, kind: "no-time", job });
    }
  });

  return items.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id, "sv"));
}

const priorityStyles = {
  0: { icon: AlertCircle, iconClass: "text-red-600" },
  1: { icon: AlertTriangle, iconClass: "text-amber-600" },
  2: { icon: CalendarClock, iconClass: "text-slate-500" },
} as const;

const WarehouseOpsActionQueue: React.FC<Props> = ({ jobs, attention }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeInbox, setActiveInbox] = useState<WarehouseProjectInboxItem | null>(null);
  const { data: inbox = [], isError } = useQuery({
    queryKey: ["warehouse-project-inbox"],
    queryFn: () => fetchInbox("new"),
    retry: 1,
  });
  const items = useMemo(() => queueItems(inbox, attention, jobs), [inbox, attention, jobs]);

  return (
    <section className="h-full min-h-0 rounded-lg border border-border/60 bg-card flex flex-col overflow-hidden">
      <header className="h-10 shrink-0 px-3 border-b border-border/60 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <h2 className="text-sm font-bold text-[hsl(var(--heading))]">Att lösa nu</h2>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold tabular-nums">
          {items.length}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain divide-y divide-border/45">
        {items.length === 0 ? (
          <div className="h-full min-h-40 flex flex-col items-center justify-center px-6 text-center">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 mb-3" />
            <p className="text-sm font-semibold">Inget kräver åtgärd</p>
            <p className="text-xs text-muted-foreground mt-1">
              {isError ? "Inkorgen kunde inte hämtas." : "Veckan är planerad utan öppna avvikelser."}
            </p>
          </div>
        ) : items.map((item) => {
          const cfg = priorityStyles[item.priority];
          const Icon = cfg.icon;

          if (item.kind === "inbox") {
            const row = item.inbox;
            return (
              <div key={item.id} className="min-h-[58px] px-3 py-2 flex items-center gap-2.5 hover:bg-accent/25">
                <Inbox className="h-4 w-4 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold text-amber-800">NYTT · ATT PLANERA</div>
                  <div className="text-xs font-semibold truncate">{row.source_project_number || "Nytt lagerbehov"}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{row.client_name || "Kund saknas"}</div>
                </div>
                <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] shrink-0" onClick={() => setActiveInbox(row)}>
                  Planera
                </Button>
              </div>
            );
          }

          if (item.kind === "attention") {
            const row = item.attention;
            return (
              <button
                key={item.id}
                type="button"
                className="w-full min-h-[58px] px-3 py-2 flex items-center gap-2.5 text-left hover:bg-accent/35"
                onClick={() => row.jobId && navigate(`/warehouse/packing/${row.jobId}`)}
              >
                <Icon className={cn("h-4 w-4 shrink-0", cfg.iconClass)} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold truncate">{row.title}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{row.detail}</div>
                </div>
                {row.jobId && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
              </button>
            );
          }

          const row = item.job;
          const title = row.bookingNumber || row.name;
          const isUnstaffed = item.kind === "unstaffed";
          return (
            <div key={item.id} className="min-h-[58px] px-3 py-2 flex items-center gap-2.5 hover:bg-accent/25">
              {isUnstaffed
                ? <UserRoundPlus className="h-4 w-4 shrink-0 text-amber-600" />
                : <CalendarClock className="h-4 w-4 shrink-0 text-slate-500" />}
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold text-muted-foreground">{isUnstaffed ? "OBEMANNAT" : "TID SAKNAS"}</div>
                <div className="text-xs font-semibold truncate">{title}</div>
                <div className="text-[11px] text-muted-foreground truncate">{row.client || row.name}</div>
              </div>
              {isUnstaffed ? (
                <QuickAssignStaffPopover
                  packingId={row.id}
                  packingName={title}
                  assignedNames={row.assignedStaff.map((a) => a.name).filter(Boolean)}
                  label="Bemanna"
                  muted
                />
              ) : (
                <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] shrink-0" onClick={() => navigate("/warehouse/calendar")}>
                  Sätt tid
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <footer className="h-8 shrink-0 px-3 border-t border-border/60 bg-muted/15 flex items-center text-[10px] text-muted-foreground">
        <PackageOpen className="h-3.5 w-3.5 mr-1.5" />
        Actions ligger här tills de är lösta
      </footer>

      <ConvertInboxDialog
        item={activeInbox}
        open={!!activeInbox}
        onOpenChange={(open) => !open && setActiveInbox(null)}
        onSuccess={async () => {
          setActiveInbox(null);
          await queryClient.invalidateQueries({ queryKey: ["warehouse-project-inbox"] });
          await queryClient.invalidateQueries({ queryKey: ["warehouse-projects"] });
          await queryClient.invalidateQueries({ queryKey: ["warehouse-ops-range"] });
        }}
      />
    </section>
  );
};

export default WarehouseOpsActionQueue;
