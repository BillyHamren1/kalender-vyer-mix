import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Package,
  Plus,
  RefreshCw,
  Rows3,
} from "lucide-react";
import { addWeeks, endOfWeek, format, startOfWeek } from "date-fns";
import { sv } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWarehouseOpsRange, type OpsJob } from "@/hooks/useWarehouseOpsRange";
import CreateInternalTaskDialog from "@/components/warehouse/CreateInternalTaskDialog";
import CreatePackingWizard from "@/components/packing/CreatePackingWizard";
import WarehouseOverviewNext7Days from "@/components/warehouse-ops/WarehouseOverviewNext7Days";
import WarehouseOpsActionQueue from "@/components/warehouse-ops/WarehouseOpsActionQueue";
import WarehouseBookingQuickOpen from "@/components/warehouse/WarehouseBookingQuickOpen";
import QuickAssignStaffPopover from "@/components/warehouse-ops/QuickAssignStaffPopover";
import { cn } from "@/lib/utils";

const DONE = new Set(["completed", "done", "completed_in", "completed_out"]);
const ACTIVE = new Set(["in_progress", "returning", "back", "started_back", "in_production"]);
type DetailTab = "overview" | "staff" | "packing";

const statusLabel: Record<string, string> = {
  planning: "Ej påbörjad",
  in_progress: "Packas",
  packed: "Packad",
  delivered: "Ute hos kund",
  back: "Retur väntar",
  returning: "Retur pågår",
  started_back: "Retur pågår",
  in_production: "Pågår",
  completed_out: "Utlevererad",
  completed_in: "Retur klar",
  completed: "Klar",
  done: "Klar",
};

/**
 * Lager OPS — viewport-baserat operativt kontrollrum på /warehouse.
 * Sidan scrollar inte på desktop. Arbetsveckan och åtgärdskön har egna,
 * avgränsade scrollområden och vald packning öppnas i bottenpanelen.
 */
const WarehouseOps = () => {
  const navigate = useNavigate();
  const [showTask, setShowTask] = useState(false);
  const [showPacking, setShowPacking] = useState(false);
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const { data, isLoading, isFetching, refetch } = useWarehouseOpsRange(anchorDate, "week");

  useEffect(() => {
    setSelectedJobId(null);
    setDetailsOpen(false);
  }, [anchorDate]);

  const selectedJob = useMemo(
    () => data?.jobs.find((job) => job.id === selectedJobId) || null,
    [data?.jobs, selectedJobId],
  );

  const weekJobs = useMemo(() => {
    if (!data) return [];
    const firstDay = format(startOfWeek(anchorDate, { weekStartsOn: 1 }), "yyyy-MM-dd");
    const lastDay = format(endOfWeek(anchorDate, { weekStartsOn: 1 }), "yyyy-MM-dd");
    return data.jobs.filter((job) => {
      const hasAssignment = job.assignedStaff.some((assignment) => assignment.assignmentDate >= firstDay && assignment.assignmentDate <= lastDay);
      const anchorInWeek = !!job.anchorDate && job.anchorDate >= firstDay && job.anchorDate <= lastDay;
      const activeAcrossWeek = ACTIVE.has(job.status) && (!job.endDate || job.endDate >= firstDay);
      return hasAssignment || anchorInWeek || activeAcrossWeek;
    });
  }, [anchorDate, data]);

  const weekAttention = useMemo(() => {
    if (!data) return [];
    const visibleIds = new Set(weekJobs.map((job) => job.packingId));
    return data.attention.filter((item) => !item.jobId || visibleIds.has(item.jobId));
  }, [data, weekJobs]);

  const weekStart = startOfWeek(anchorDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(anchorDate, { weekStartsOn: 1 });
  const weekLabel = `${format(weekStart, "'Vecka' I · d", { locale: sv })}–${format(weekEnd, "d MMM", { locale: sv })}`;

  const selectJob = (job: OpsJob) => {
    setSelectedJobId(job.id);
    setDetailTab("overview");
    setDetailsOpen(true);
  };

  return (
    <div className="h-full min-h-0 overflow-hidden bg-background">
      <div className="h-full min-h-0 px-2.5 py-2 sm:px-3 flex flex-col gap-2">
        <header className="shrink-0 rounded-lg border border-border/60 bg-background/95 shadow-sm">
          <div className="h-12 px-2.5 flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <div className="h-8 w-8 rounded-lg bg-warehouse flex items-center justify-center">
                <Package className="h-4 w-4 text-white" />
              </div>
              <div className="leading-tight hidden lg:block">
                <div className="font-bold text-[15px] text-[hsl(var(--heading))]">Planning OPS</div>
                <div className="text-[9px] text-muted-foreground">Operativ lagerstyrning</div>
              </div>
            </div>

            <div className="flex h-8 items-center rounded-md border border-border/60 bg-card shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-r-none" title="Föregående vecka" onClick={() => setAnchorDate((date) => addWeeks(date, -1))}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="min-w-[132px] px-2 text-center text-[11px] font-semibold tabular-nums">{weekLabel}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-l-none" title="Nästa vecka" onClick={() => setAnchorDate((date) => addWeeks(date, 1))}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={() => setAnchorDate(new Date())}>Idag</Button>

            <WarehouseBookingQuickOpen compact className="min-w-0 flex-1 max-w-[480px]" />

            <div className="ml-auto flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs" onClick={() => navigate("/warehouse/calendar")}>
                <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                <span className="hidden xl:inline">Bemanning</span>
              </Button>
              <Button variant="ghost" size="sm" className="h-8 px-2.5 text-xs" onClick={() => setShowPacking(true)}>
                <Rows3 className="h-3.5 w-3.5 mr-1.5" />
                <span className="hidden xl:inline">Ny packning</span>
              </Button>
              <Button onClick={() => setShowTask(true)} size="sm" className="h-8 px-2.5 bg-warehouse hover:bg-warehouse-hover text-xs">
                <Plus className="h-3.5 w-3.5 mr-1" />
                <span className="hidden 2xl:inline">Lageruppgift</span>
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => refetch()} disabled={isFetching} title="Uppdatera">
                <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
              </Button>
            </div>
          </div>

          {/* Passiva räknare är borttagna med flit: allt som kräver åtgärd
              visas som konkret jobb med knapp i åtgärdskön till höger. */}

        </header>

        <main className="min-h-0 flex-1 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_350px] gap-2 overflow-hidden">
          {isLoading || !data ? (
            <>
              <Skeleton className="h-full rounded-lg" />
              <Skeleton className="h-full rounded-lg hidden xl:block" />
            </>
          ) : (
            <>
              <WarehouseOverviewNext7Days data={data} selectedJobId={selectedJobId} onSelectJob={selectJob} />
              <div className="hidden xl:block min-h-0">
                <WarehouseOpsActionQueue jobs={weekJobs} attention={weekAttention} />
              </div>
            </>
          )}
        </main>

        <section className={cn(
          "shrink-0 rounded-lg border border-border/60 bg-card overflow-hidden transition-[height] duration-200",
          detailsOpen && selectedJob ? "h-[154px]" : "h-10",
        )}>
          <div className="h-10 px-3 flex items-center gap-3 border-b border-border/55">
            <button type="button" className="h-7 w-7 rounded flex items-center justify-center hover:bg-accent" disabled={!selectedJob} onClick={() => selectedJob && setDetailsOpen((open) => !open)} title={detailsOpen ? "Fäll ihop" : "Visa jobbdetalj"}>
              {detailsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
            <span className="text-xs font-bold">Valt jobb</span>
            <span className="text-xs text-muted-foreground truncate">
              {selectedJob ? `${selectedJob.bookingNumber || selectedJob.name} · ${selectedJob.client || selectedJob.name}` : "Välj ett jobb i arbetsveckan"}
            </span>
            {selectedJob && (
              <>
                <div className="ml-4 h-full hidden sm:flex items-center gap-1">
                  {(["overview", "staff", "packing"] as DetailTab[]).map((tab) => (
                    <button key={tab} type="button" className={cn("h-full px-2.5 text-[11px] font-semibold border-b-2", detailTab === tab ? "border-warehouse text-warehouse" : "border-transparent text-muted-foreground hover:text-foreground")} onClick={() => { setDetailTab(tab); setDetailsOpen(true); }}>
                      {tab === "overview" ? "Översikt" : tab === "staff" ? "Personal" : "Packning"}
                    </button>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="ml-auto h-7 px-2 text-[10px]" onClick={() => navigate(`/warehouse/packing/${selectedJob.packingId}`)}>
                  Öppna full vy <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </>
            )}
          </div>

          {detailsOpen && selectedJob && (
            <div className="h-[113px] px-4 py-3 overflow-y-auto">
              {detailTab === "overview" && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-2 text-xs">
                  <Detail label="Status" value={statusLabel[selectedJob.status] || selectedJob.status} />
                  <Detail label="Typ" value={selectedJob.direction === "in" ? "Retur" : selectedJob.direction === "internal" ? "Lager" : "Packning"} />
                  <Detail label="Planerad dag" value={selectedJob.anchorDate || "Datum saknas"} warning={!selectedJob.anchorDate} />
                  <Detail label="Planerad tid" value={selectedJob.anchorTime || "Tid saknas"} warning={!selectedJob.anchorTime} />
                </div>
              )}
              {detailTab === "staff" && (
                <div className="flex items-start gap-5 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground mb-1">Planerad personal</div>
                    <div className="font-semibold truncate">
                      {selectedJob.assignedStaff.length > 0
                        ? selectedJob.assignedStaff.map((a) => `${a.name}${a.startTime ? ` ${a.startTime.slice(0, 5)}` : ""}`).join(" · ")
                        : "Ingen personal tilldelad"}
                    </div>
                  </div>
                  <QuickAssignStaffPopover packingId={selectedJob.packingId} packingName={selectedJob.bookingNumber || selectedJob.name} assignedNames={selectedJob.assignedStaff.map((a) => a.name).filter(Boolean)} label={selectedJob.assignedStaff.length > 0 ? "Ändra bemanning" : "Bemanna"} muted={selectedJob.assignedStaff.length === 0} />
                </div>
              )}
              {detailTab === "packing" && (
                <div className="grid grid-cols-[minmax(180px,1fr)_auto] items-center gap-6 text-xs">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">Packstatus</span>
                      <span className="font-bold tabular-nums">{selectedJob.verifiedItems}/{selectedJob.totalItems} · {selectedJob.percent}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-warehouse transition-[width]" style={{ width: `${Math.min(100, selectedJob.percent)}%` }} />
                    </div>
                  </div>
                  <span className="text-muted-foreground">Senast uppdaterad {format(new Date(selectedJob.updatedAt), "d MMM HH:mm", { locale: sv })}</span>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <CreateInternalTaskDialog open={showTask} onOpenChange={setShowTask} onSuccess={() => { setShowTask(false); refetch(); }} />
      <CreatePackingWizard open={showPacking} onOpenChange={setShowPacking} onSuccess={() => { setShowPacking(false); refetch(); }} />
    </div>
  );
};

const Detail = ({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) => (
  <div className="min-w-0">
    <div className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">{label}</div>
    <div className={cn("mt-0.5 font-semibold truncate", warning && "text-orange-700")}>{value}</div>
  </div>
);

export default WarehouseOps;
