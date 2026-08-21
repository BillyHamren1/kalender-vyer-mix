import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { Calendar, Package, Plus, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import PackingActionCenter from "@/components/packing/PackingActionCenter";
import PackingActiveWork from "@/components/packing/PackingActiveWork";
import PackingCalendarView from "@/components/packing/PackingCalendarView";
import CreatePackingWizard from "@/components/packing/CreatePackingWizard";
import CreateInternalTaskDialog from "@/components/warehouse/CreateInternalTaskDialog";
import WarehouseOpsSearch from "@/components/warehouse/WarehouseOpsSearch";
import { fetchPackings } from "@/services/packingService";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

/**
 * Lager OPS = den operativa startsidan.
 * Synligt innehåll ska vara arbete, avvikelse eller en direkt väg till arbete.
 * Ingen KPI-dashboard och inga informationskort utan nästa action.
 * Full personal-/resursplanering ligger fortsatt i /warehouse/calendar.
 */
const WarehouseDashboard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreatePacking, setShowCreatePacking] = useState(false);

  useRealtimeInvalidation({
    channelName: "warehouse-ops",
    tables: ["packing_projects", "bookings", "projects", "jobs", "warehouse_project_inbox"],
    queryKeys: [["packings"], ["bookings-without-packing"], ["warehouse-project-inbox"]],
  });

  const {
    data: packings = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["packings"],
    queryFn: fetchPackings,
  });

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden" style={{ background: "var(--gradient-page)" }}>
      <div className="relative mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6 lg:p-8">
        <PageHeader
          icon={Package}
          title="Lager OPS"
          subtitle={format(new Date(), "EEEE d MMMM yyyy", { locale: sv })}
          variant="warehouse"
        >
          <Button
            size="sm"
            onClick={() => setShowCreatePacking(true)}
            className="h-8 rounded-lg bg-warehouse px-4 font-medium shadow-sm hover:bg-warehouse-hover"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Ny packning
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreateTask(true)}
            className="h-8 rounded-lg border-border/60"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Lageruppgift
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 rounded-lg"
          >
            <RefreshCw className={`mr-1.5 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Uppdatera
          </Button>
        </PageHeader>

        <WarehouseOpsSearch packings={packings} />

        {isLoading ? (
          <div className="space-y-3 py-2">
            <div className="h-12 animate-pulse rounded-xl bg-muted/60" />
            <div className="h-24 animate-pulse rounded-xl bg-muted/60" />
          </div>
        ) : (
          <>
            <PackingActionCenter packings={packings} />

            <div id="active-work" className="scroll-mt-4">
              <PackingActiveWork packings={packings} />
            </div>

            <section className="pt-1">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-[hsl(var(--heading))]">Planera packning och retur</h2>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => navigate("/warehouse/calendar")}
                >
                  <Calendar className="mr-1.5 h-4 w-4" />
                  Bemanna i lagerplanering
                </Button>
              </div>
              <PackingCalendarView packings={packings} />
            </section>
          </>
        )}
      </div>

      <CreatePackingWizard
        open={showCreatePacking}
        onOpenChange={setShowCreatePacking}
        onSuccess={() => {
          setShowCreatePacking(false);
          queryClient.invalidateQueries({ queryKey: ["packings"] });
          queryClient.invalidateQueries({ queryKey: ["bookings-without-packing"] });
        }}
      />

      <CreateInternalTaskDialog
        open={showCreateTask}
        onOpenChange={setShowCreateTask}
        onSuccess={() => {
          setShowCreateTask(false);
          refetch();
        }}
      />
    </div>
  );
};

export default WarehouseDashboard;
