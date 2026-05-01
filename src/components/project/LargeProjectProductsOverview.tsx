import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getLargeProjectBookingLabel } from "@/lib/largeProjectBookingLabel";
import ProjectProductsList from "@/components/project/ProjectProductsList";
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

  const visibleProducts = allProducts.filter(p => p.is_package_component !== true);
  const totalCount = visibleProducts.length;
  const totalWeight = visibleProducts.reduce((s, p) => s + (p.estimated_weight_kg || 0) * p.quantity, 0);
  const totalVolume = visibleProducts.reduce((s, p) => s + (p.estimated_volume_m3 || 0) * p.quantity, 0);

  const cleanName = (name: string) => name.replace(/^[\u21B3\u2514\u2192\u2713L,\-–\s↳└→]+\s*/, "").trim();

  const subTabClass =
    "relative px-3 py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent text-muted-foreground data-[state=active]:text-foreground text-sm font-medium transition-colors hover:text-foreground";

  // Flat list: main product rows + their accessory rows nested directly under
  type FlatRow = {
    id: string;
    name: string;
    quantity: number;
    isAccessory: boolean;
    hasAccessories: boolean;
  };
  const flatRows: FlatRow[] = bookings.flatMap(b => {
    const bProducts = allProducts.filter(p => p.booking_id === b.booking_id);
    const mainProducts = bProducts.filter(p => !p.parent_product_id && !p.is_package_component);
    const allChildren = bProducts.filter(p => p.parent_product_id);
    return mainProducts.flatMap(p => {
      const accessories = allChildren.filter(c => c.parent_product_id === p.id);
      const mainRow: FlatRow = {
        id: `${b.booking_id}-${p.id}`,
        name: cleanName(p.name),
        quantity: p.quantity,
        isAccessory: false,
        hasAccessories: accessories.length > 0,
      };
      const accRows: FlatRow[] = accessories.map(c => ({
        id: `${b.booking_id}-${p.id}-${c.id}`,
        name: cleanName(c.name),
        quantity: c.quantity,
        isAccessory: true,
        hasAccessories: false,
      }));
      return [mainRow, ...accRows];
    });
  });

  return (
    <Tabs defaultValue="list" className="space-y-4">
      <div className="border-b border-border/40 overflow-x-auto">
        <TabsList className="h-auto p-0 bg-transparent gap-0">
          <TabsTrigger value="list" className={subTabClass}>
            Lista
            {flatRows.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-medium rounded-full bg-muted text-foreground">
                {flatRows.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all" className={subTabClass}>
            Grupperat
            {totalCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-medium rounded-full bg-muted text-foreground">
                {totalCount}
              </span>
            )}
          </TabsTrigger>
          {bookings.map(b => {
            const label = getLargeProjectBookingLabel({
              booking_id: b.booking_id,
              display_name: b.display_name,
              booking: b.booking ? { client: b.booking.client, booking_number: b.booking.booking_number } : null,
            });
            const count = allProducts.filter(p => p.booking_id === b.booking_id && p.is_package_component !== true).length;
            return (
              <TabsTrigger key={b.booking_id} value={b.booking_id} className={subTabClass}>
                {label}
                {count > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-medium rounded-full bg-muted text-foreground">
                    {count}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>

      {/* Lista - flat extraherad lista (tillbehör göms i paketet) */}
      <TabsContent value="list">
        {flatRows.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            Inga produkter hittades.
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Header */}
            <div className="grid grid-cols-[minmax(280px,2fr)_140px_120px_110px_110px_110px_110px] gap-3 px-2 pb-3 text-xs font-medium text-muted-foreground">
              <div>Produkt</div>
              <div className="text-center">Antal</div>
              <div className="text-right">Pris</div>
              <div className="text-right">Rabatt %</div>
              <div className="text-right">Rabatt kr</div>
              <div className="text-right">Moms</div>
              <div className="text-right">Summa</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-border/40">
              {flatRows.map(row => (
                <div
                  key={row.id}
                  className="grid grid-cols-[minmax(280px,2fr)_140px_120px_110px_110px_110px_110px] gap-3 items-center px-2 py-2"
                >
                  {/* Produkt */}
                  <div className={row.isAccessory ? "pl-6" : ""}>
                    <div
                      className={
                        row.isAccessory
                          ? "px-3 py-1.5 rounded-md border border-border bg-background text-sm text-foreground"
                          : "px-3 py-1.5 rounded-md border border-border bg-background text-sm font-medium text-foreground"
                      }
                    >
                      {row.isAccessory ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden>↳</span>
                          <span>{row.name}</span>
                        </span>
                      ) : (
                        row.name
                      )}
                    </div>
                  </div>

                  {/* Antal stepper (UI only) */}
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      type="button"
                      disabled
                      className="h-7 w-7 rounded-md border border-border bg-background text-foreground flex items-center justify-center text-sm leading-none cursor-not-allowed"
                      tabIndex={-1}
                    >
                      −
                    </button>
                    <div className="h-7 w-12 rounded-md border border-border bg-background text-foreground flex items-center justify-center text-sm tabular-nums">
                      {row.quantity}
                    </div>
                    <button
                      type="button"
                      disabled
                      className="h-7 w-7 rounded-md border border-border bg-background text-foreground flex items-center justify-center text-sm leading-none cursor-not-allowed"
                      tabIndex={-1}
                    >
                      +
                    </button>
                  </div>

                  {/* Pris */}
                  <div className="h-8 rounded-md border border-border bg-background px-2 flex items-center justify-end text-sm tabular-nums text-foreground" />

                  {/* Rabatt % */}
                  <div className="h-8 rounded-md border border-border bg-background px-2 flex items-center justify-end text-sm tabular-nums text-foreground" />

                  {/* Rabatt kr */}
                  <div className="h-8 rounded-md border border-border bg-background px-2 flex items-center justify-end text-sm tabular-nums text-foreground" />

                  {/* Moms */}
                  <div className="h-8 rounded-md border border-border bg-background px-2 flex items-center justify-between text-sm text-foreground">
                    <span>25%</span>
                    <span aria-hidden className="text-xs">▾</span>
                  </div>

                  {/* Summa */}
                  <div className="text-right text-sm tabular-nums text-foreground pr-1">
                    0 kr
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mt-3 pt-2 border-t border-border/40 flex items-center gap-4 text-xs text-muted-foreground">
          <span>{flatRows.length} rader</span>
          <span>Tillbehör visas indenterade under respektive paket</span>
        </div>
      </TabsContent>

      {/* Grupperat - by booking */}
      <TabsContent value="all">
        {bookings.map(b => {
          const bProducts = allProducts.filter(p => p.booking_id === b.booking_id);
          if (bProducts.length === 0) return null;
          const mainProducts = bProducts.filter(p => !p.parent_product_id && !p.is_package_component);
          const allChildren = bProducts.filter(p => p.parent_product_id || p.is_package_component);
          const label = getLargeProjectBookingLabel({
            booking_id: b.booking_id,
            display_name: b.display_name,
            booking: b.booking ? { client: b.booking.client, booking_number: b.booking.booking_number } : null,
          });

          return (
            <div key={b.booking_id} className="mb-6">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{label}</h4>
              <div className="divide-y divide-border/40">
                {mainProducts.map(product => {
                  const accessories = allChildren.filter(
                    c => c.parent_product_id === product.id && c.is_package_component !== true
                  );
                  return (
                    <div key={product.id}>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm font-medium text-foreground">{cleanName(product.name)}</span>
                        <span className="text-xs font-medium text-muted-foreground tabular-nums">{product.quantity} st</span>
                      </div>
                      {accessories.map(child => (
                        <div key={child.id} className="flex items-center justify-between py-1 pl-5 pb-1.5">
                          <span className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                            {cleanName(child.name)}
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">{child.quantity} st</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Summary footer */}
        <div className="mt-3 pt-2 border-t border-border/40 flex items-center gap-4 text-xs text-muted-foreground">
          <span>{totalCount} produkter</span>
          {totalWeight > 0 && <span>{Math.round(totalWeight)} kg</span>}
          {totalVolume > 0 && <span>{totalVolume.toFixed(1)} m³</span>}
        </div>
      </TabsContent>

      {/* Per booking */}
      {bookings.map(b => (
        <TabsContent key={b.booking_id} value={b.booking_id}>
          <ProjectProductsList bookingId={b.booking_id} />
        </TabsContent>
      ))}
    </Tabs>
  );
};

export default LargeProjectProductsOverview;
