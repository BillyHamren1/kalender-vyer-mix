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
        <div className="grid grid-cols-[minmax(420px,2.4fr)_170px_160px_150px_150px_150px_120px] gap-4 border-b border-border/60 px-3 pb-4 text-[13px] font-medium text-muted-foreground">
          <div>Produkt</div>
          <div className="text-center">Antal</div>
          <div className="text-left">Pris</div>
          <div className="text-left">Rabatt %</div>
          <div className="text-left">Rabatt kr</div>
          <div className="text-left">Moms</div>
          <div className="text-right">Summa</div>
        </div>

        <div className="divide-y divide-border/60">
          {flatRows.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[minmax(420px,2.4fr)_170px_160px_150px_150px_150px_120px] gap-4 items-center px-3 py-3"
            >
              <div className="min-w-0 rounded-md border border-input bg-background px-4 py-3 text-[15px] font-semibold text-foreground">
                <span className="block truncate">{row.name}</span>
              </div>

              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  disabled
                  tabIndex={-1}
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background text-[24px] leading-none text-foreground"
                >
                  −
                </button>
                <div className="flex h-10 min-w-16 items-center justify-center rounded-md border border-input bg-background px-3 text-[15px] font-medium tabular-nums text-foreground">
                  {row.quantity}
                </div>
                <button
                  type="button"
                  disabled
                  tabIndex={-1}
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-input bg-background text-[24px] leading-none text-foreground"
                >
                  +
                </button>
              </div>

              <div className="h-10 rounded-md border border-input bg-background" />
              <div className="h-10 rounded-md border border-input bg-background" />
              <div className="h-10 rounded-md border border-input bg-background" />

              <div className="flex h-10 items-center justify-between rounded-md border border-input bg-background px-3 text-[15px] text-foreground">
                <span>25%</span>
                <span aria-hidden className="text-[10px]">▾</span>
              </div>

              <div className="pr-2 text-right text-[15px] font-medium tabular-nums text-foreground">
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
