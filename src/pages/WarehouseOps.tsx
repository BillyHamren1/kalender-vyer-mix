import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import OpsUnifiedSearch from "@/components/warehouse-ops/OpsUnifiedSearch";
import OpsActionRequired from "@/components/warehouse-ops/OpsActionRequired";
import OpsActiveWork from "@/components/warehouse-ops/OpsActiveWork";
import PackingCalendarView from "@/components/packing/PackingCalendarView";
import CreatePackingWizard from "@/components/packing/CreatePackingWizard";
import CreateInternalTaskDialog from "@/components/warehouse/CreateInternalTaskDialog";
import { fetchPackings } from "@/services/packingService";
import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

/**
 * Lager OPS — konsoliderad operativ lageryta.
 * Ersätter tidigare separata "Dashboard" + "Planera packning".
 * Personalplanering/bemanning bor kvar i Lagerplanering (/warehouse/calendar).
 */
const WarehouseOps = () => {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTaskOpen, setIsTaskOpen] = useState(false);

  useRealtimeInvalidation({
    channelName: 'warehouse-ops',
    tables: ['packing_projects', 'bookings', 'projects', 'jobs'],
    queryKeys: [['packings'], ['bookings-without-packing']],
  });

  const { data: packings = [], isLoading } = useQuery({
    queryKey: ['packings'],
    queryFn: fetchPackings,
  });

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden" style={{ background: 'var(--gradient-page)' }}>
      <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-[1600px]">
        <PageHeader
          icon={Package}
          title="Lager OPS"
          subtitle="Sök, åtgärda och följ lagerarbetet"
          variant="warehouse"
        >
          <Button
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            className="bg-warehouse hover:bg-warehouse-hover font-medium rounded-lg h-8 px-4"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Ny packning
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-lg border-border/60"
            onClick={() => setIsTaskOpen(true)}
          >
            Skapa lageruppgift
          </Button>
        </PageHeader>

        <OpsUnifiedSearch packings={packings} />

        {isLoading ? (
          <div className="space-y-4">
            <div className="h-28 rounded-2xl bg-muted animate-pulse" />
            <div className="h-96 rounded-2xl bg-muted animate-pulse" />
          </div>
        ) : (
          <>
            <OpsActionRequired packings={packings} />

            <div className="mb-6">
              <PackingCalendarView packings={packings} />
            </div>

            <OpsActiveWork packings={packings} />
          </>
        )}
      </div>

      <CreatePackingWizard
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSuccess={() => {
          setIsCreateOpen(false);
          queryClient.invalidateQueries({ queryKey: ['packings'] });
        }}
      />

      <CreateInternalTaskDialog
        open={isTaskOpen}
        onOpenChange={setIsTaskOpen}
        onSuccess={() => {
          setIsTaskOpen(false);
          queryClient.invalidateQueries({ queryKey: ['packings'] });
        }}
      />
    </div>
  );
};

export default WarehouseOps;
