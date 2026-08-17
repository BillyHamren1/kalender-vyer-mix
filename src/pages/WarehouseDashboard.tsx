import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package, Plus, RefreshCw, CalendarIcon, LayoutTemplate, ClipboardList, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWarehouseOpsRange } from "@/hooks/useWarehouseOpsRange";
import CreateInternalTaskDialog from "@/components/warehouse/CreateInternalTaskDialog";
import WarehouseOverviewToday from "@/components/warehouse-ops/WarehouseOverviewToday";
import WarehouseOverviewAttention from "@/components/warehouse-ops/WarehouseOverviewAttention";
import WarehouseOverviewNext7Days from "@/components/warehouse-ops/WarehouseOverviewNext7Days";
import WarehouseBookingQuickOpen from "@/components/warehouse/WarehouseBookingQuickOpen";

/**
 * Lageröversikt = kort översikt, inte arbetslista.
 * Arbetslistor bor i /warehouse/packing (inkommande + packning) och /warehouse/calendar (personalplanering).
 */
const NEXT_STEPS = [
  {
    key: "planning",
    icon: ClipboardList,
    title: "Hantera inkommande",
    detail: "Nya projekt som behöver lagerplaneras.",
    route: "/warehouse/packing#actions",
  },
  {
    key: "staffing",
    icon: CalendarIcon,
    title: "Planera personal",
    detail: "Vem ska göra arbetet?",
    route: "/warehouse/calendar",
  },
  {
    key: "packing",
    icon: LayoutTemplate,
    title: "Öppna packning",
    detail: "Genomför och följ upp packning.",
    route: "/warehouse/packing#active-work",
  },
] as const;

const WarehouseDashboard = () => {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);

  const anchorDate = useMemo(() => new Date(), []);
  const { data, isLoading, isFetching, refetch } = useWarehouseOpsRange(anchorDate, "next7");

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden" style={{ background: "var(--gradient-page)" }}>
      <div className="relative p-6 max-w-[1200px] mx-auto space-y-5">
        <PageHeader
          icon={Package}
          title="Lageröversikt"
          subtitle={format(new Date(), "EEEE d MMMM yyyy", { locale: sv })}
          variant="warehouse"
        >
          <Button
            onClick={() => setShowCreate(true)}
            size="sm"
            className="bg-warehouse hover:bg-warehouse-hover shadow-sm font-medium rounded-lg px-4 h-8"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Skapa lageruppgift
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="border-border/60 h-8 rounded-lg"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Uppdatera
          </Button>
        </PageHeader>

        <WarehouseBookingQuickOpen />

        {isLoading || !data ? (
          <div className="space-y-4">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
        ) : (
          <>
            <WarehouseOverviewToday data={data} />
            <WarehouseOverviewAttention items={data.attention} maxItems={4} />
            <WarehouseOverviewNext7Days data={data} />
          </>
        )}

        {/* Vart går jag för att agera? */}
        <section>
          <h2 className="text-sm font-semibold text-[hsl(var(--heading))] mb-3">Gå vidare</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {NEXT_STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <button
                  key={step.key}
                  onClick={() => navigate(step.route)}
                  className="rounded-xl border border-border/60 bg-card p-4 text-left hover:bg-accent/40 transition-colors flex items-start gap-3"
                >
                  <div className="h-9 w-9 rounded-lg bg-warehouse/10 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-warehouse" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-[hsl(var(--heading))] flex items-center gap-1">
                      {step.title}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <CreateInternalTaskDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        onSuccess={() => {
          setShowCreate(false);
          refetch();
        }}
      />
    </div>
  );
};

export default WarehouseDashboard;
