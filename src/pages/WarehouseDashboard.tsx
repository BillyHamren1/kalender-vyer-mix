import { useState } from "react";
import { Package, Plus, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWarehouseOpsRange, type OpsMode } from "@/hooks/useWarehouseOpsRange";
import OpsDateBar from "@/components/warehouse-ops/OpsDateBar";
import OpsAttentionPanel from "@/components/warehouse-ops/OpsAttentionPanel";
import OpsJobsTable from "@/components/warehouse-ops/OpsJobsTable";
import OpsStaffTimeline from "@/components/warehouse-ops/OpsStaffTimeline";
import CreateInternalTaskDialog from "@/components/warehouse/CreateInternalTaskDialog";
import WarehouseProjectInbox from "@/components/warehouse/WarehouseProjectInbox";

const WarehouseDashboard = () => {
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());
  const [mode, setMode] = useState<OpsMode>("day");
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, isFetching, refetch } = useWarehouseOpsRange(anchorDate, mode);

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden" style={{ background: "var(--gradient-page)" }}>
      <div className="relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(184_60%_38%/0.04),transparent)]" />
        <div className="relative p-6 max-w-[1600px] mx-auto">
          <PageHeader
            icon={Package}
            title="Lager Operations"
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

          <div className="mb-6">
            <WarehouseProjectInbox />
          </div>

          <OpsDateBar
            anchorDate={anchorDate}
            mode={mode}
            onChange={(d, m) => {
              setAnchorDate(d);
              setMode(m);
            }}
            summary={data?.summary}
          />

          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
            </div>
          ) : data ? (
            <div className="space-y-4">
              <OpsAttentionPanel items={data.attention} />
              <OpsJobsTable
                jobs={data.jobs}
                mode={mode}
                onPickDay={(d) => {
                  setAnchorDate(d);
                  setMode("day");
                }}
              />
              {mode === "day" && (
                <OpsStaffTimeline
                  anchorDate={anchorDate}
                  shifts={data.shifts}
                  scans={data.scans}
                  jobs={data.jobs}
                />
              )}
            </div>
          ) : null}
        </div>
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
