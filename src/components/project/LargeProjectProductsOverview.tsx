import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import type { LargeProjectBooking } from "@/types/largeProject";

interface LargeProjectProductsOverviewProps {
  bookings: LargeProjectBooking[];
}

const LargeProjectProductsOverview = ({ bookings }: LargeProjectProductsOverviewProps) => {
  const bookingIds = bookings.map(b => b.booking_id);
  const [search, setSearch] = useState("");

  const { data: allProducts = [], isLoading } = useQuery({
    queryKey: ["large-project-all-products", ...bookingIds],
    queryFn: async () => {
      if (bookingIds.length === 0) return [];
      const { data, error } = await supabase
        .from("booking_products")
        .select("id, name, parent_product_id, is_package_component, sort_index, booking_id")
        .in("booking_id", bookingIds)
        .order("sort_index", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data || [];
    },
    enabled: bookingIds.length > 0,
  });

  const cleanName = (name: string) => name.replace(/^[\u21B3\u2514\u2192\u2713L,\-–\s↳└→]+\s*/, "").trim();

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const flat = allProducts
      .filter(p => !p.parent_product_id && !p.is_package_component)
      .map(p => ({ id: p.id, name: cleanName(p.name) }));
    return q ? flat.filter(r => r.name.toLowerCase().includes(q)) : flat;
  }, [allProducts, search]);

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

  return (
    <div className="space-y-4 w-full">
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Sök produkt..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-10 bg-card"
        />
      </div>

      {rows.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground text-sm">
          Inga produkter hittades.
        </div>
      ) : (
        <Card className="border-border/50 shadow-sm overflow-hidden w-full">
          <div className="bg-card">
            <div className="border-b border-border/60 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Produkt
            </div>
            <div className="divide-y divide-border/40">
              {rows.map(row => (
                <div
                  key={row.id}
                  className="px-4 py-3 text-sm font-medium text-foreground"
                  title={row.name}
                >
                  {row.name}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <div className="pt-2 border-t border-border/40 text-xs text-muted-foreground">
        {rows.length} produkter
      </div>
    </div>
  );
};

export default LargeProjectProductsOverview;
