import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronDown, ChevronRight } from "lucide-react";
import { getLargeProjectBookingLabel } from "@/lib/largeProjectBookingLabel";
import type { LargeProjectBooking } from "@/types/largeProject";

interface LargeProjectProductsOverviewProps {
  bookings: LargeProjectBooking[];
}

const LargeProjectProductsOverview = ({ bookings }: LargeProjectProductsOverviewProps) => {
  const bookingIds = bookings.map(b => b.booking_id);
  const [search, setSearch] = useState("");
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [collapsedOverrides, setCollapsedOverrides] = useState<Record<string, boolean>>({});

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

  // Group rows per booking (company)
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookings.map(b => {
      const bProducts = allProducts.filter(p => p.booking_id === b.booking_id);
      const mainProducts = bProducts.filter(p => !p.parent_product_id && !p.is_package_component);
      const client = b.booking?.client || "—";
      const deliveryParts = [b.booking?.deliveryaddress, b.booking?.delivery_postal_code, b.booking?.delivery_city]
        .filter(Boolean)
        .join(", ");
      const label = getLargeProjectBookingLabel({
        booking_id: b.booking_id,
        display_name: b.display_name,
        booking: b.booking ? { client: b.booking.client, booking_number: b.booking.booking_number } : null,
      });
      const rows = mainProducts.map(p => ({
        id: `${b.booking_id}-${p.id}`,
        name: cleanName(p.name),
        quantity: p.quantity,
        client,
        delivery: deliveryParts || "—",
      }));
      const filtered = q
        ? rows.filter(r =>
            r.name.toLowerCase().includes(q) ||
            r.client.toLowerCase().includes(q) ||
            r.delivery.toLowerCase().includes(q) ||
            label.toLowerCase().includes(q)
          )
        : rows;
      return { bookingId: b.booking_id, label, rows: filtered, totalRows: rows.length };
    }).filter(g => g.rows.length > 0);
  }, [bookings, allProducts, search]);

  const totalVisibleRows = groups.reduce((s, g) => s + g.rows.length, 0);

  const isGroupCollapsed = (id: string) =>
    collapsedOverrides[id] !== undefined ? collapsedOverrides[id] : allCollapsed;

  const toggleGroup = (id: string) =>
    setCollapsedOverrides(prev => ({ ...prev, [id]: !isGroupCollapsed(id) }));

  const toggleAll = () => {
    const next = !allCollapsed;
    setAllCollapsed(next);
    setCollapsedOverrides({});
  };

  return (
    <div className="space-y-4 w-full">
      {/* Sökfält + kollapsa-knapp i full bredd */}
      <div className="flex items-center gap-3 w-full">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Sök produkt, kund eller adress..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10 bg-card"
          />
        </div>
        <Button variant="outline" onClick={toggleAll} className="h-10 shrink-0 gap-2">
          {allCollapsed ? (
            <>
              <ChevronRight className="h-4 w-4" />
              Expandera alla
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" />
              Kollapsa alla
            </>
          )}
        </Button>
      </div>

      {/* Lista grupperad per bolag */}
      {groups.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground text-sm">
          Inga produkter hittades.
        </div>
      ) : (
        <Card className="border-border/50 shadow-sm overflow-hidden w-full">
          <div className="overflow-x-auto bg-card">
            <div className="min-w-[860px]">
              <div className="grid grid-cols-[minmax(0,2fr)_120px_minmax(0,1.6fr)_minmax(0,2fr)] gap-6 border-b border-border/60 px-4 py-3 text-sm font-semibold text-foreground">
                <span>Produkt:</span>
                <span>Antal:</span>
                <span>Kund:</span>
                <span>Levadress:</span>
              </div>
              {groups.map(g => {
                const collapsed = isGroupCollapsed(g.bookingId);
                return (
                  <div key={g.bookingId} className="border-b border-border/40 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => toggleGroup(g.bookingId)}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-foreground bg-muted/40 hover:bg-muted/60 transition-colors"
                    >
                      {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      <span className="truncate">{g.label}</span>
                      <span className="ml-auto inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-medium rounded-full bg-primary/10 text-primary">
                        {g.rows.length}
                      </span>
                    </button>
                    {!collapsed && (
                      <div className="divide-y divide-border/40">
                        {g.rows.map(row => (
                          <div
                            key={row.id}
                            className="grid grid-cols-[minmax(0,2fr)_120px_minmax(0,1.6fr)_minmax(0,2fr)] items-center gap-6 px-4 py-3 text-sm text-foreground"
                          >
                            <span className="truncate font-medium" title={row.name}>{row.name}</span>
                            <span className="tabular-nums text-muted-foreground">{row.quantity} st</span>
                            <span className="truncate text-muted-foreground" title={row.client}>{row.client}</span>
                            <span className="truncate text-muted-foreground" title={row.delivery}>{row.delivery}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      <div className="pt-2 border-t border-border/40 flex items-center gap-4 text-xs text-muted-foreground">
        <span>{totalVisibleRows} rader</span>
        <span>Tillbehör är inkluderade i respektive paket</span>
      </div>
    </div>
  );
};

export default LargeProjectProductsOverview;
