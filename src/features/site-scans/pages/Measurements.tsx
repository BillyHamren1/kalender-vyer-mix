import { useNavigate } from "react-router-dom";
import { ChevronRight, Mountain, Ruler, ScanLine, TriangleRight } from "lucide-react";
import { useSiteScansList } from "@/features/site-scans/hooks/useSiteScans";
import StatusBadge from "@/features/site-scans/components/shared/StatusBadge";
import EmptyState from "@/features/site-scans/components/shared/EmptyState";
import ErrorState from "@/features/site-scans/components/shared/ErrorState";
import LoadingState from "@/features/site-scans/components/shared/LoadingState";

const formatDate = (iso?: string | null) => {
  if (!iso) return "";

  try {
    return new Date(iso).toLocaleString("sv-SE", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

const Measurements = () => {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useSiteScansList({
    page: 1,
    page_size: 20,
    sort_by: "created_at",
    sort_order: "desc",
  });

  const scans = data?.data ?? [];

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-5 pt-6 pb-4">
        <p className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
          Verktyg
        </p>
        <h1 className="text-2xl font-bold mt-1">Mätning</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          Öppna och granska dina senaste SiteScan-mätningar direkt här.
        </p>
      </header>

      <div className="px-4 pb-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              <ScanLine className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">Nya mätningar</p>
              <p className="text-sm text-muted-foreground mt-1">
                Startas på LiDAR-enheten och synkas hit automatiskt när de finns tillgängliga.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 pt-1 pb-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Senaste mätningar</h2>
      </div>

      <div className="px-4 space-y-3">
        {isLoading && <LoadingState message="Laddar mätningar…" />}

        {isError && (
          <ErrorState
            message={error?.message ?? "Kunde inte hämta mätningar."}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && scans.length === 0 && (
          <EmptyState
            icon={Ruler}
            title="Inga mätningar ännu"
            description="När en SiteScan-mätning har synkats visas den här."
          />
        )}

        {!isLoading && !isError && scans.map((scan) => (
          <button
            key={scan.id}
            onClick={() => navigate(`/m/tools/measure/${scan.id}`)}
            className="w-full rounded-lg border border-border bg-card p-4 text-left transition-transform active:scale-[0.99]"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                <Ruler className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-base truncate">
                      {scan.title || "Mätning utan namn"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDate(scan.created_at)}
                    </div>
                  </div>
                  <StatusBadge status={scan.status} />
                </div>

                {(scan.height_range != null || scan.average_slope != null || scan.surface_area != null) && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {scan.height_range != null && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                        <Mountain className="h-3.5 w-3.5" />
                        {scan.height_range.toFixed(1)} m
                      </span>
                    )}
                    {scan.average_slope != null && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                        <TriangleRight className="h-3.5 w-3.5" />
                        {scan.average_slope.toFixed(1)}°
                      </span>
                    )}
                    {scan.surface_area != null && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1">
                        <Ruler className="h-3.5 w-3.5" />
                        {scan.surface_area.toFixed(1)} m²
                      </span>
                    )}
                  </div>
                )}
              </div>

              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 self-center" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default Measurements;