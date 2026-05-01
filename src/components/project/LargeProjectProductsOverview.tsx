import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import type { LargeProjectBooking } from "@/types/largeProject";

interface LargeProjectProductsOverviewProps {
  bookings: LargeProjectBooking[];
}

const LargeProjectProductsOverview = ({ bookings }: LargeProjectProductsOverviewProps) => {
  const bookingIds = bookings.map(b => b.booking_id);

  const { data: allProducts = [], isLoading } = useQuery({
    queryKey: ["large-project-all-products", ...bookingIds],
    queryFn: async () => {
      if (bookingIds.length === 0) return [];
      const { data, error } = await supabase
        .from("booking_products")
        .select("id, name, quantity, notes, parent_product_id, is_package_component, estimated_weight_kg, estimated_volume_m3, sort_index, booking_id")
        .in("booking_id", bookingIds)
        .order("sort_index", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
    enabled: bookingIds.length > 0,
  });

  if (bookingIds.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm">
        Inga bokningar kopplade till projektet.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2 py-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-6 w-full" />)}
      </div>
    );
  }

  const cleanName = (name: string) => name.replace(/^[\u21B3\u2514\u2192\u2713L,\-–\s↳└→]+\s*/, "").trim();
  const flatRows = allProducts
    .filter(product => !product.parent_product_id && product.is_package_component !== true)
    .map(product => ({
      id: `${product.booking_id}-${product.id}`,
      name: cleanName(product.name),
      quantity: product.quantity,
    }));

  return flatRows.length === 0 ? (
    <div className="py-8 text-center text-muted-foreground text-sm">
      Inga produkter hittades.
    </div>
  ) : (
    <div className="overflow-x-auto">
      <div className="min-w-[1180px]">
        <div className="grid grid-cols-[minmax(420px,2.4fr)_170px_160px_150px_150px_150px_120px] gap-4 px-3 pb-4 text-[13px] font-medium text-[#6b7280]">
          <div>Produkt</div>
          <div className="text-center">Antal</div>
          <div className="text-left">Pris</div>
          <div className="text-left">Rabatt %</div>
          <div className="text-left">Rabatt kr</div>
          <div className="text-left">Moms</div>
          <div className="text-right">Summa</div>
        </div>

        <div className="space-y-2">
          {flatRows.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[minmax(420px,2.4fr)_170px_160px_150px_150px_150px_120px] gap-4 items-center px-3 py-1"
            >
              <div className="min-w-0 rounded-md border border-[#e5e7eb] bg-white px-4 py-2.5 text-[15px] text-[#111827]">
                <span className="block truncate">{row.name}</span>
              </div>

              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  disabled
                  tabIndex={-1}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-[#e5e7eb] bg-white text-[20px] leading-none text-[#111827]"
                >
                  −
                </button>
                <div className="flex h-9 min-w-14 items-center justify-center rounded-md border border-[#e5e7eb] bg-white px-3 text-[15px] tabular-nums text-[#111827]">
                  {row.quantity}
                </div>
                <button
                  type="button"
                  disabled
                  tabIndex={-1}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-[#e5e7eb] bg-white text-[20px] leading-none text-[#111827]"
                >
                  +
                </button>
              </div>

              <div className="h-9 rounded-md border border-[#e5e7eb] bg-white" />
              <div className="h-9 rounded-md border border-[#e5e7eb] bg-white" />
              <div className="h-9 rounded-md border border-[#e5e7eb] bg-white" />

              <div className="flex h-9 items-center justify-between rounded-md border border-[#e5e7eb] bg-white px-3 text-[15px] text-[#111827]">
                <span>25%</span>
                <span aria-hidden className="text-[10px]">▾</span>
              </div>

              <div className="pr-2 text-right text-[15px] tabular-nums text-[#111827]">
                0 kr
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LargeProjectProductsOverview;
