import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CornerDownRight } from "lucide-react";

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

const cleanName = (name: string) => name.replace(/^[↳└L,]+\s*/, "");

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

  const mainProducts = products.filter(p => !p.parent_product_id && !p.is_package_component);
  const childProducts = products.filter(p => p.parent_product_id || p.is_package_component);

  const totalWeight = products.reduce((sum, p) => sum + (p.estimated_weight_kg || 0) * p.quantity, 0);
  const totalVolume = products.reduce((sum, p) => sum + (p.estimated_volume_m3 || 0) * p.quantity, 0);

  return (
    <Card className="bg-card shadow-2xl border-border/40">
      <CardContent className="py-3 px-4">
        <div className="divide-y divide-border/40">
          {mainProducts.map(product => {
            const children = childProducts.filter(c => c.parent_product_id === product.id);
            return (
              <div key={product.id}>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium text-foreground">{cleanName(product.name)}</span>
                  <span className="text-xs font-medium text-muted-foreground tabular-nums">{product.quantity} st</span>
                </div>
                {children.map(child => (
                  <div key={child.id} className="flex items-center justify-between py-1.5 pl-6">
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <CornerDownRight className="h-3 w-3 shrink-0" />
                      {cleanName(child.name)}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{child.quantity} st</span>
                  </div>
                ))}
              </div>
            );
          })}
          {/* Orphaned children (no matching parent in mainProducts) */}
          {childProducts
            .filter(c => !mainProducts.some(m => m.id === c.parent_product_id))
            .map(child => (
              <div key={child.id} className="flex items-center justify-between py-1.5 pl-6">
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CornerDownRight className="h-3 w-3 shrink-0" />
                  {cleanName(child.name)}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">{child.quantity} st</span>
              </div>
            ))}
        </div>

        {/* Summary footer */}
        <div className="mt-3 pt-2 border-t border-border/40 flex items-center gap-4 text-xs text-muted-foreground">
          <span>{products.length} produkter</span>
          {totalWeight > 0 && <span>{Math.round(totalWeight)} kg</span>}
          {totalVolume > 0 && <span>{totalVolume.toFixed(1)} m³</span>}
        </div>
      </CardContent>
    </Card>
  );
};

export default ProjectProductsList;
