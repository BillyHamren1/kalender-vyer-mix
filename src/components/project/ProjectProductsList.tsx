import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";


interface BookingProduct {
  id: string;
  name: string;
  quantity: number;
  notes: string | null;
  parent_product_id: string | null;
  is_package_component: boolean | null;
  estimated_weight_kg: number | null;
  estimated_volume_m3: number | null;
  sort_index: number | null;
}

interface ProjectProductsListProps {
  bookingId: string;
}

const cleanName = (name: string) => name.replace(/^[\u21B3\u2514\u2192\u2713L,\-–\s↳└→]+\s*/, "").trim();

const ProjectProductsList = ({ bookingId }: ProjectProductsListProps) => {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["booking-products", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_products")
        .select("id, name, quantity, notes, parent_product_id, is_package_component, estimated_weight_kg, estimated_volume_m3, sort_index")
        .eq("booking_id", bookingId)
        .order("sort_index", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []) as BookingProduct[];
    },
    enabled: !!bookingId,
  });

  if (isLoading) {
    return (
      <Card className="bg-card shadow-2xl border-border/40">
        <CardContent className="py-4 px-4 space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-6 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (products.length === 0) {
    return (
      <Card className="bg-card shadow-2xl border-border/40">
        <CardContent className="py-6 px-4 text-center text-muted-foreground text-sm">
          Inga produkter kopplade till denna bokning.
        </CardContent>
      </Card>
    );
  }

  // Main products: no parent, not a package component
  const mainProducts = products.filter(p => !p.parent_product_id && !p.is_package_component);
  // All children
  const allChildren = products.filter(p => p.parent_product_id || p.is_package_component);

  // Visible products for footer count (exclude package components)
  const visibleProducts = products.filter(p => p.is_package_component !== true);

  const totalWeight = visibleProducts.reduce((sum, p) => sum + (p.estimated_weight_kg || 0) * p.quantity, 0);
  const totalVolume = visibleProducts.reduce((sum, p) => sum + (p.estimated_volume_m3 || 0) * p.quantity, 0);

  return (
    <Card className="bg-card shadow-2xl border-border/40">
      <CardContent className="py-3 px-4">
        <div className="divide-y divide-border/40">
          {mainProducts.map(product => {
            // Accessories: children with is_package_component = false (not true)
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

        {/* Summary footer */}
        <div className="mt-3 pt-2 border-t border-border/40 flex items-center gap-4 text-xs text-muted-foreground">
          <span>{visibleProducts.length} produkter</span>
          {totalWeight > 0 && <span>{Math.round(totalWeight)} kg</span>}
          {totalVolume > 0 && <span>{totalVolume.toFixed(1)} m³</span>}
        </div>
      </CardContent>
    </Card>
  );
};

export default ProjectProductsList;
