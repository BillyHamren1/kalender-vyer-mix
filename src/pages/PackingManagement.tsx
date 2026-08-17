import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Package, Trash2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PackingCard from "@/components/packing/PackingCard";
import PackingActionCenter from "@/components/packing/PackingActionCenter";
import PackingActiveWork from "@/components/packing/PackingActiveWork";
import PackingCalendarView from "@/components/packing/PackingCalendarView";
import CreatePackingWizard from "@/components/packing/CreatePackingWizard";
import BulkCleanupDialog from "@/components/packing/BulkCleanupDialog";
import PreflightBatchDebugPanel from "@/components/scanner/PreflightBatchDebugPanel";
import { fetchPackings, deletePacking } from "@/services/packingService";
import { PackingStatus, PACKING_STATUS_LABELS } from "@/types/packing";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";

const PackingManagement = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PackingStatus | "all">("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCleanupOpen, setIsCleanupOpen] = useState(false);
  const [showAllPackings, setShowAllPackings] = useState(false);
  const [preselectedBookingId, setPreselectedBookingId] = useState<string | undefined>();

  useRealtimeInvalidation({
    channelName: 'packing-management',
    tables: ['packing_projects', 'bookings', 'projects', 'jobs'],
    queryKeys: [['packings'], ['bookings-without-packing']],
  });

  const { data: packings = [], isLoading } = useQuery({
    queryKey: ['packings'],
    queryFn: fetchPackings
  });

  const deleteMutation = useMutation({
    mutationFn: deletePacking,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packings'] });
      toast.success('Packning borttagen');
    },
    onError: () => toast.error('Kunde inte ta bort packning')
  });

  const searching = search.trim().length > 0 || statusFilter !== "all";

  const normalizedSearch = search.trim().toLowerCase();
  const filteredPackings = packings.filter(packing => {
    const matchesSearch = !normalizedSearch || [
      packing.name,
      packing.booking?.client,
      packing.booking?.booking_number,
      packing.booking?.deliveryaddress,
      packing.booking?.delivery_city,
    ].some((value) => value?.toLowerCase().includes(normalizedSearch));
    const matchesStatus = statusFilter === "all" || packing.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusSummary = [
    { label: 'planerade', value: packings.filter(p => p.status === 'planning').length },
    { label: 'pågående', value: packings.filter(p => p.status === 'in_progress').length },
    { label: 'i produktion', value: packings.filter(p => p.status === 'delivered').length },
    { label: 'klara', value: packings.filter(p => p.status === 'completed').length },
  ];

  const handlePackingClick = (packingId: string) => {
    navigate(`/warehouse/packing/${packingId}`);
  };

  const handleDelete = (packingId: string) => {
    deleteMutation.mutate(packingId);
  };

  const showList = showAllPackings && !searching;

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--gradient-page)' }}>
      <div className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(184_60%_38%/0.04),transparent)]" />

        <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-[1600px]">
          {/* Header */}
          <PageHeader
            icon={Package}
            title="Planera packning"
            subtitle="Hantera packningsprojekt och uppgifter"
            variant="warehouse"
            action={{
              label: "Ny packning",
              icon: Plus,
              onClick: () => setIsCreateOpen(true)
            }}
          />

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Sök packning, projekt eller bokning..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 rounded-xl border-border/40"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as PackingStatus | "all")}>
              <SelectTrigger className="w-[180px] rounded-xl border-border/40">
                <SelectValue placeholder="Filtrera status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla statusar</SelectItem>
                {Object.entries(PACKING_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCleanupOpen(true)}
              className="text-destructive border-destructive/30 hover:bg-destructive/10 h-10"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Rensa gamla
            </Button>
          </div>

          {/* Kompakt statusrad (ersätter de fyra stora KPI-korten) */}
          <p className="mb-5 text-xs text-muted-foreground">
            {statusSummary.map((s, i) => (
              <span key={s.label}>
                {i > 0 && ' · '}
                <span className="font-medium text-foreground">{s.value}</span> {s.label}
              </span>
            ))}
          </p>

          {searching ? (
            <section className="mb-6 rounded-2xl border border-border/60 bg-card/70 p-4 sm:p-5 shadow-sm">
              <div className="flex items-end justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-[hsl(var(--heading))]">Sökresultat</h2>
                  <p className="text-xs text-muted-foreground">Öppna packlistan genom att klicka på kortet, eller gå direkt till lagerbokningen.</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{filteredPackings.length} träffar</span>
              </div>
              {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map(i => <div key={i} className="h-48 bg-muted animate-pulse rounded-2xl" />)}
                </div>
              ) : filteredPackings.length === 0 ? (
                <div className="text-center py-10 text-sm text-muted-foreground">Ingen packning hittades. Prova bokningsnummer, kund eller leveransadress.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredPackings.map(packing => (
                    <PackingCard
                      key={packing.id}
                      packing={packing}
                      onClick={() => handlePackingClick(packing.id)}
                      onDelete={() => handleDelete(packing.id)}
                      onOpenBooking={packing.booking?.id ? () => navigate(`/warehouse/bookings/${packing.booking!.id}`) : undefined}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : (
            <>
              {/* 1. Kräver åtgärd */}
              <div id="actions" className="scroll-mt-4">
                <PackingActionCenter packings={packings} />
              </div>

              {/* 2. Packningskalender (låst komponent) */}
              <div className="mb-6">
                <PackingCalendarView packings={packings} />
              </div>

              {/* 3. Pågående arbete */}
              <div id="active-work" className="scroll-mt-4">
                <PackingActiveWork packings={packings} />
              </div>
            </>
          )}

          {/* Alla packningar — dolt bakom "Visa alla packningar" */}
          <div className="mt-6">
            {!searching && !showList && (
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => setShowAllPackings(true)}
              >
                <ChevronDown className="h-4 w-4 mr-2" />
                Visa alla packningar ({packings.length})
              </Button>
            )}

            {showList && (
              isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-48 bg-card animate-pulse rounded-2xl border border-border/40" />
                  ))}
                </div>
              ) : filteredPackings.length === 0 ? (
                <div className="text-center py-16 rounded-2xl bg-card border border-border/40 shadow-2xl">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-[hsl(var(--heading))] mb-2">Inga packningar hittades</h3>
                  <p className="text-muted-foreground mb-4 text-[0.925rem]">
                    {searching
                      ? "Prova att ändra dina filter"
                      : "Skapa din första packning för att komma igång"}
                  </p>
                  {!searching && (
                    <Button className="bg-warehouse hover:bg-warehouse-hover shadow-xl shadow-warehouse/25 font-semibold" onClick={() => setIsCreateOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Skapa packning
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredPackings.map(packing => (
                    <PackingCard
                      key={packing.id}
                      packing={packing}
                      onClick={() => handlePackingClick(packing.id)}
                      onDelete={() => handleDelete(packing.id)}
                      onOpenBooking={packing.booking?.id ? () => navigate(`/warehouse/bookings/${packing.booking!.id}`) : undefined}
                    />
                  ))}
                </div>
              )
            )}
          </div>

          <BulkCleanupDialog
            open={isCleanupOpen}
            onOpenChange={setIsCleanupOpen}
          />

          <CreatePackingWizard 
            open={isCreateOpen} 
            onOpenChange={(open) => {
              setIsCreateOpen(open);
              if (!open) setPreselectedBookingId(undefined);
            }}
            preselectedBookingId={preselectedBookingId}
            onSuccess={() => {
              setIsCreateOpen(false);
              setPreselectedBookingId(undefined);
              queryClient.invalidateQueries({ queryKey: ['packings'] });
              queryClient.invalidateQueries({ queryKey: ['bookings-without-packing'] });
            }}
          />

          <details className="mt-8">
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Dev / Debug
            </summary>
            <PreflightBatchDebugPanel />
          </details>
        </div>
      </div>
    </div>
  );
};

export default PackingManagement;
