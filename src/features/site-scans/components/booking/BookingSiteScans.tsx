import { useBookingSiteScans } from "@/hooks/useBookingSiteScans";
import DataSectionCard from "@/components/shared/DataSectionCard";
import EmptyState from "@/components/shared/EmptyState";
import LoadingState from "@/components/shared/LoadingState";
import ErrorState from "@/components/shared/ErrorState";
import ScanPreviewCard from "@/components/shared/ScanPreviewCard";
import { ScanLine } from "lucide-react";

interface BookingSiteScansProps {
  bookingId: string | undefined;
}

const BookingSiteScans = ({ bookingId }: BookingSiteScansProps) => {
  const { data: scans, isLoading, isError, error, refetch } = useBookingSiteScans(bookingId);

  if (!bookingId) return null;

  return (
    <DataSectionCard
      title="Site Scans"
      description={
        isLoading
          ? "Laddar…"
          : scans && scans.length > 0
            ? `${scans.length} scan${scans.length !== 1 ? "s" : ""} länkade till denna bokning`
            : undefined
      }
      actions={
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
          <ScanLine className="h-3.5 w-3.5" />
          EventFlow
        </span>
      }
    >
      {isLoading && <LoadingState message="Laddar site scans…" />}

      {isError && (
        <ErrorState
          message={error?.message ?? "Kunde inte ladda site scans."}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && scans && scans.length === 0 && (
        <EmptyState
          icon={ScanLine}
          title="Inga site scans"
          description="Inga SiteScan-mätningar är länkade till denna bokning ännu."
        />
      )}

      {!isLoading && !isError && scans && scans.length > 0 && (
        <div className="grid gap-4">
          {scans.map((scan) => (
            <ScanPreviewCard key={scan.id} scan={scan} />
          ))}
        </div>
      )}
    </DataSectionCard>
  );
};

export default BookingSiteScans;
