import { useActiveTerrainSurface } from "@/hooks/useBookingSiteSurfaces";
import EmptyState from "@/components/shared/EmptyState";
import LoadingState from "@/components/shared/LoadingState";
import { Mountain } from "lucide-react";

interface BookingDrawingTabProps {
  bookingId: string | undefined;
}

/**
 * Drawing / 3D tab for booking detail.
 * Uses the active terrain surface to inject heightmap/mesh URLs
 * into whatever 3D viewer or drawing canvas the app uses.
 *
 * Currently renders a placeholder with asset readiness info.
 * Replace the inner content with your 3D scene component when available.
 */
const BookingDrawingTab = ({ bookingId }: BookingDrawingTabProps) => {
  const { activeSurface, isLoading } = useActiveTerrainSurface(bookingId);

  if (!bookingId) return null;

  if (isLoading) {
    return <LoadingState message="Laddar terrängdata för ritning…" />;
  }

  if (!activeSurface) {
    return (
      <EmptyState
        icon={Mountain}
        title="Ingen terrängyta tillgänglig"
        description="Koppla en SiteScan-terrängyta till bokningen för att aktivera 3D-ritning."
      />
    );
  }

  // Active surface is available — pass URLs to 3D scene
  const { heightmap_url, mesh_url, point_cloud_url } = activeSurface;

  return (
    <div className="space-y-4">
      {/* Scene injection point */}
      <div className="rounded-lg border border-border bg-muted/30 flex items-center justify-center min-h-[320px]">
        <div className="text-center space-y-2 px-4">
          <Mountain className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium text-foreground/80">
            3D-terrängvy
          </p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Aktiv yta laddad från scan{" "}
            <span className="font-mono">{activeSurface.site_scan_id.slice(0, 8)}</span>.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-3 text-[11px]">
            {heightmap_url && (
              <span className="rounded bg-primary/10 text-primary px-2 py-0.5">
                Höjdkarta
              </span>
            )}
            {mesh_url && (
              <span className="rounded bg-primary/10 text-primary px-2 py-0.5">
                Mesh
              </span>
            )}
            {point_cloud_url && (
              <span className="rounded bg-primary/10 text-primary px-2 py-0.5">
                Punktmoln
              </span>
            )}
          </div>
        </div>
      </div>

      {/* TODO: Replace the above placeholder with:
        <TerrainScene
          heightmapUrl={heightmap_url}
          meshUrl={mesh_url}
          pointCloudUrl={point_cloud_url}
        />
      */}
    </div>
  );
};

export default BookingDrawingTab;
