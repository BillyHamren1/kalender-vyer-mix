import { useActiveTerrainSurface } from "@/hooks/useBookingSiteSurfaces";
import DataSectionCard from "@/components/shared/DataSectionCard";
import EmptyState from "@/components/shared/EmptyState";
import LoadingState from "@/components/shared/LoadingState";
import ErrorState from "@/components/shared/ErrorState";
import StatusBadge from "@/components/shared/StatusBadge";
import { Mountain, Layers } from "lucide-react";

interface MeasurementsTerrainCardProps {
  bookingId: string | undefined;
}

/** Renders the active terrain surface metrics for a booking. */
const MeasurementsTerrainCard = ({ bookingId }: MeasurementsTerrainCardProps) => {
  const { activeSurface, isLoading, isError, error, refetch } =
    useActiveTerrainSurface(bookingId);

  if (!bookingId) return null;

  const metrics = activeSurface?.metrics_json as Record<string, unknown> | null;

  const metricRows: { label: string; value: string }[] = [];
  if (metrics) {
    if (metrics.height_range != null)
      metricRows.push({ label: "Höjdskillnad", value: `${metrics.height_range} m` });
    if (metrics.min_height != null)
      metricRows.push({ label: "Min höjd", value: `${metrics.min_height} m` });
    if (metrics.max_height != null)
      metricRows.push({ label: "Max höjd", value: `${metrics.max_height} m` });
    if (metrics.average_slope != null)
      metricRows.push({ label: "Medellutning", value: `${metrics.average_slope}°` });
    if (metrics.surface_area != null)
      metricRows.push({ label: "Yta", value: `${metrics.surface_area} m²` });
  }

  return (
    <DataSectionCard
      title="Terrängyta"
      description={
        activeSurface
          ? "Aktiv yta från SiteScan"
          : undefined
      }
      actions={
        activeSurface ? (
          <StatusBadge status="ready" />
        ) : null
      }
    >
      {isLoading && <LoadingState message="Laddar terrängdata…" />}

      {isError && (
        <ErrorState
          message={error?.message ?? "Kunde inte ladda terrängdata."}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && !activeSurface && (
        <EmptyState
          icon={Mountain}
          title="Ingen aktiv terrängyta"
          description="Ingen SiteScan-terrängyta är kopplad till denna bokning ännu."
        />
      )}

      {!isLoading && !isError && activeSurface && (
        <div className="space-y-4">
          {/* Source info */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Layers className="h-3.5 w-3.5" />
            <span className="font-mono">{activeSurface.site_scan_id}</span>
          </div>

          {/* Metrics grid */}
          {metricRows.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {metricRows.map((m) => (
                <div
                  key={m.label}
                  className="rounded-md border border-border bg-surface-elevated/50 px-3 py-2.5"
                >
                  <p className="text-[11px] text-muted-foreground">{m.label}</p>
                  <p className="text-sm font-semibold font-heading mt-0.5">{m.value}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Inga terrängmätningar tillgängliga.
            </p>
          )}

          {/* Asset links */}
          <div className="flex flex-wrap gap-2 text-[11px]">
            {activeSurface.heightmap_url && (
              <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-muted-foreground">
                Höjdkarta ✓
              </span>
            )}
            {activeSurface.mesh_url && (
              <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-muted-foreground">
                Mesh ✓
              </span>
            )}
            {activeSurface.point_cloud_url && (
              <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-muted-foreground">
                Punktmoln ✓
              </span>
            )}
          </div>
        </div>
      )}
    </DataSectionCard>
  );
};

export default MeasurementsTerrainCard;
