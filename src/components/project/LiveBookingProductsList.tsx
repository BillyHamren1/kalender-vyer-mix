import OrderFlowStatusPanel from "@/components/order-flow/OrderFlowStatusPanel";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { ProductsList } from "@/components/booking/ProductsList";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchLiveBookingById } from "@/services/booking/liveBookingService";
import { fetchWmsPackageRows } from "@/services/booking/packageMembersService";
import { buildPackageMembers } from "@/lib/booking/packageMembers";

interface LiveBookingProductsListProps {
  bookingId: string;
}

const LiveBookingProductsList = ({ bookingId }: LiveBookingProductsListProps) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["live-booking-products", bookingId],
    queryFn: () => fetchLiveBookingById(bookingId),
    enabled: Boolean(bookingId),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const membersQuery = useQuery({
    queryKey: ["booking-package-members", bookingId],
    queryFn: () => fetchWmsPackageRows(bookingId),
    enabled: Boolean(bookingId),
    staleTime: 0,
    refetchOnMount: "always",
  });

  if (isLoading) {
    return (
      <div className="space-y-2 py-3" aria-label="Laddar orderrader">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div role="alert" className="flex items-start gap-2 py-4 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Kunde inte läsa aktuella orderrader från Booking. Ingen äldre kopia visas.</span>
      </div>
    );
  }

  const products = data.products ?? [];
  const packageMembers = buildPackageMembers(products, membersQuery.data ?? []);

  return (
    <>
      <OrderFlowStatusPanel bookingId={bookingId} view="planning" />
      {membersQuery.isError && (
        <div role="alert" className="flex items-start gap-2 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Paketinnehållet kunde inte läsas just nu.</span>
        </div>
      )}
      <ProductsList
        products={products}
        packageMembers={packageMembers}
        showPricing={false}
        embedded
      />
    </>
  );
};

export default LiveBookingProductsList;

