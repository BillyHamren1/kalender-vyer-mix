import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Package, Plus, RefreshCw, Rows3 } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWarehouseOpsRange } from "@/hooks/useWarehouseOpsRange";
import { fetchInbox } from "@/services/warehouseProjectService";
import CreateInternalTaskDialog from "@/components/warehouse/CreateInternalTaskDialog";
import CreatePackingWizard from "@/components/packing/CreatePackingWizard";
import WarehouseOverviewAttention from "@/components/warehouse-ops/WarehouseOverviewAttention";
import WarehouseOverviewNext7Days from "@/components/warehouse-ops/WarehouseOverviewNext7Days";
import WarehouseBookingQuickOpen from "@/components/warehouse/WarehouseBookingQuickOpen";
import WarehousePlanningInboxBar from "@/components/warehouse/WarehousePlanningInboxBar";

const DONE = new Set(["completed", "done", "completed_in", "completed_out"]);

/**
 * Lager OPS — kompakt operativ lageryta på /warehouse.
 * Sticky topbar (sök + snabbactions) → räknare → inbox (Att planera) →
 * kräver uppmärksamhet → tät arbetsvecka. Ingen luftig dashboard.
 * Personalplanering bor kvar i Lagerplanering (/warehouse/calendar).
 */
const WarehouseOps = () => {
  const navigate = useNavigate();
  const [showTask, setShowTask] = useState(false);
  const [showPacking, setShowPacking] = useState(false);
  const anchorDate = useMemo(() => new Date(), []);
  const { data, isLoading, isFetching, refetch } = useWarehouseOpsRange(anchorDate, "next7");
  const { data: inbox = [] } = useQuery({
    queryKey: ["warehouse-project-inbox"],
    queryFn: () => fetchInbox("new"),
    retry: 1,
  });

  const counters = useMemo(() => {
    if (!data) return { unstaffed: 0, noTime: 0, attention: 0, jobs: 0 };
    const active = data.jobs.filter((job) => !DONE.has(job.status));
    return {
      jobs: active.length,
      unstaffed: active.filter((job) => job.assignedStaff.length === 0).length,
      noTime: active.filter((job) => {
        if (job.anchorTime) return false;
        return job.assignedStaff.length === 0 || job.assignedStaff.every((a) => !a.startTime);
      }).length,
      attention: data.attention.length,
    };
  }, [data]);

  const chip = (active: boolean, tone: "amber" | "orange" | "red") =>
    active
      ? tone === "red"
        ? "rounded-md border border-red-300 bg-red-50 text-red-800 px-2 py-0.5"
        : tone === "amber"
          ? "rounded-md border border-amber-300 bg-amber-50 text-amber-800 px-2 py-0.5"
          : "rounded-md border border-orange-300 bg-orange-50 text-orange-800 px-2 py-0.5"
      : "rounded-md border border-border/60 px-2 py-0.5 text-muted-foreground";

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-background">
      <div className="mx-auto max-w-[1500px] px-3 py-2 sm:px-4 space-y-2">
        <div className="sticky top-0 z-30 -mx-1 rounded-lg border border-border/60 bg-background/95 px-2 py-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/90">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <div className="h-8 w-8 rounded-lg bg-warehouse flex items-center justify-center">
                <Package className="h-4 w-4 text-white" />
              </div>
              <div className="leading-tight hidden sm:block">
                <div className="font-bold text-[15px] text-[hsl(var(--heading))]" title="Lager OPS">Lager OPS</div>
                <div className="text-[10px] text-muted-foreground capitalize">
                  {format(new Date(), "EEE d MMM", { locale: sv })}
                </div>
              </div>
            </div>

            <WarehouseBookingQuickOpen compact className="min-w-0 flex-1 max-w-[480px]" />

            <div className="ml-auto flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs" onClick={() => navigate("/warehouse/calendar")}>
                <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                <span className="hidden md:inline">Bemanning</span>
              </Button>
              <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs" onClick={() => setShowPacking(true)}>
                <Rows3 className="h-3.5 w-3.5 mr-1.5" />
                <span className="hidden md:inline">Ny packning</span>
              </Button>
              <Button onClick={() => setShowTask(true)} size="sm" className="h-8 px-2.5 bg-warehouse hover:bg-warehouse-hover text-xs">
                <Plus className="h-3.5 w-3.5 mr-1" />
                <span className="hidden lg:inline">Lageruppgift</span>
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => refetch()} disabled={isFetching} title="Uppdatera">
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          <div className="mt-1.5 flex items-center gap-1.5 overflow-x-auto text-[11px] whitespace-nowrap">
            <span className="font-semibold text-muted-foreground mr-0.5">7 dagar</span>
            <span className="rounded-md border border-border/60 bg-muted/30 px-2 py-0.5"><b>{counters.jobs}</b> jobb</span>
            <span className={chip(inbox.length > 0, "amber")}><b>{inbox.length}</b> nya</span>
            <span className={chip(counters.unstaffed > 0, "orange")}><b>{counters.unstaffed}</b> obemannade</span>
            <span className={chip(counters.noTime > 0, "orange")}><b>{counters.noTime}</b> saknar tid</span>
            <span className={chip(counters.attention > 0, "red")}><b>{counters.attention}</b> uppmärksamhet</span>
          </div>
        </div>

        <WarehousePlanningInboxBar className="m-0" initialRows={3} />

        {isLoading || !data ? (
          <div className="space-y-2">
            <Skeleton className="h-12 rounded-lg" />
            <Skeleton className="h-64 rounded-lg" />
          </div>
        ) : (
          <>
            <WarehouseOverviewAttention items={data.attention} maxItems={2} compact />
            <WarehouseOverviewNext7Days data={data} />
          </>
        )}
      </div>

      <CreateInternalTaskDialog
        open={showTask}
        onOpenChange={setShowTask}
        onSuccess={() => {
          setShowTask(false);
          refetch();
        }}
      />

      <CreatePackingWizard
        open={showPacking}
        onOpenChange={setShowPacking}
        onSuccess={() => {
          setShowPacking(false);
          refetch();
        }}
      />
    </div>
  );
};

export default WarehouseOps;
