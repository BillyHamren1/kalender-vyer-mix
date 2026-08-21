import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { ChevronDown, Package, Plus, RefreshCw, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PackingActionCenter from "@/components/packing/PackingActionCenter";
import PackingActiveWork from "@/components/packing/PackingActiveWork";
import PackingCalendarView from "@/components/packing/PackingCalendarView";
import PackingCard from "@/components/packing/PackingCard";
import CreatePackingWizard from "@/components/packing/CreatePackingWizard";
import CreateInternalTaskDialog from "@/components/warehouse/CreateInternalTaskDialog";
import WarehouseBookingQuickOpen from "@/components/warehouse/WarehouseBookingQuickOpen";
import { fetchPackings, deletePacking } from "@/services/packingService";
import { PackingStatus, PACKING_STATUS_LABELS } from "@/types/packing";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

/**
 * Lager OPS = den operativa startsidan.
 * Här ska användaren kunna se exakt vad som kräver åtgärd och arbeta vidare direkt.
 * Ingen KPI-dashboard och inga informationskort utan nästa action.
 * Full personal-/resursplanering ligger fortsatt i /warehouse/calendar.
 */
const WarehouseDashboard = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreatePacking, setShowCreatePacking] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PackingStatus | "all">("all");
  const [showAllPackings, setShowAllPackings] = useState(false);

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

  const deleteMutation = useMutation({
    mutationFn: deletePacking,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packings"] });
      toast.success("Packning borttagen");
    },
    onError: () => toast.error("Kunde inte ta bort packning"),
  });

  const normalizedSearch = search.trim().toLowerCase();
  const searching = normalizedSearch.length > 0 || statusFilter !== "all";

  const filteredPackings = useMemo(
    () =>
      packings.filter((packing) => {
        const matchesSearch =
          !normalizedSearch ||
          [
            packing.name,
            packing.booking?.client,
            packing.booking?.booking_number,
            packing.booking?.deliveryaddress,
            packing.booking?.delivery_city,
          ].some((value) => value?.toLowerCase().includes(normalizedSearch));
        const matchesStatus = statusFilter === "all" || packing.status === statusFilter;
        return matchesSearch && matchesStatus;
      }),
    [packings, normalizedSearch, statusFilter],
  );

  const showPackingList = searching || showAllPackings;

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

        <WarehouseBookingQuickOpen compact />

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
                <div>
                  <h2 className="text-sm font-semibold text-[hsl(var(--heading))]">Packningsflöde</h2>
                  <p className="text-xs text-muted-foreground">UT och IN över tid. Klicka på ett jobb för att öppna packningen.</p>
                </div>
                <Button variant="outline" size="sm" className="h-8" onClick={() => navigate("/warehouse/calendar")}>
                  Öppna lagerplanering
                </Button>
              </div>
              <PackingCalendarView packings={packings} />
            </section>
          </>
        )}

        <section className="border-t border-border/50 pt-5">
          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[hsl(var(--heading))]">Hitta packlista</h2>
              <p className="text-xs text-muted-foreground">Sök när du behöver öppna en specifik packlista.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-[280px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Bokningsnummer, kund, projekt eller adress…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-9 rounded-lg pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as PackingStatus | "all")}>
                <SelectTrigger className="h-9 w-[170px] rounded-lg">
                  <SelectValue placeholder="Alla statusar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla statusar</SelectItem>
                  {Object.entries(PACKING_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {!showPackingList && (
            <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => setShowAllPackings(true)}>
              <ChevronDown className="mr-1.5 h-4 w-4" />
              Visa alla packlistor
            </Button>
          )}

          {showPackingList && (
            <div className="mt-3">
              {filteredPackings.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
                  Ingen packlista matchar sökningen.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredPackings.map((packing) => (
                    <PackingCard
                      key={packing.id}
                      packing={packing}
                      onClick={() => navigate(`/warehouse/packing/${packing.id}`)}
                      onDelete={() => deleteMutation.mutate(packing.id)}
                      onOpenBooking={packing.booking?.id ? () => navigate(`/warehouse/bookings/${packing.booking!.id}`) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
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
