import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Sparkles, Trash2, ChevronDown, ChevronRight, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProductGrouping, type ProductGroup } from "@/hooks/useProductGrouping";
import { GroupProductsDialog } from "@/components/project/GroupProductsDialog";
import { MoveProductDialog } from "@/components/project/MoveProductDialog";
import { toast } from "sonner";

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
  showGroupingControls?: boolean;
  showSummary?: boolean;
}

// Strippar prefix-markörer som importen lägger på tillbehörs-/komponent-rader.
// VIKTIGT: använd alternation, inte teckenklass — `[L,]` skulle matcha ett ensamt
// `L` och kapa första bokstaven på namn som "Ljusslinga" eller "Lätt lastbil".
export const cleanName = (name: string) =>
  name.replace(/^(?:L,|--|[↳└→✓\u21B3\u2514\u2192\u2713\-–\s])+\s*/, "").trim();

// `-- foo` = paketkomponent (auto-medföljande, ska döljas i bokningsvyn)
const isHiddenPackageComponent = (name: string) => /^\s*--/.test(name);

export const isVisibleAccessory = (p: { name: string; parent_product_id: string | null }) =>
  !!p.parent_product_id && !isHiddenPackageComponent(p.name);

const ProjectProductsList = ({
  bookingId,
  showGroupingControls = true,
  showSummary = true,
}: ProjectProductsListProps) => {
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [moveDialog, setMoveDialog] = useState<{ productId: string; name: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["booking-products", bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_products")
        .select(
          "id, name, quantity, notes, parent_product_id, is_package_component, estimated_weight_kg, estimated_volume_m3, sort_index"
        )
        .eq("booking_id", bookingId)
        .order("sort_index", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data || []) as BookingProduct[];
    },
    enabled: !!bookingId,
  });

  const { grouping, generate, save, clear } = useProductGrouping("booking", bookingId);

  if (isLoading) {
    return (
      <div className="py-4 space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="py-4 text-center text-muted-foreground text-sm">
        Inga produkter kopplade till denna bokning.
      </div>
    );
  }

  const mainProducts = products.filter((p) => !p.parent_product_id && !p.is_package_component);
  const allChildren = products.filter((p) => p.parent_product_id || p.is_package_component);
  // Visa huvudprodukter + ↳-tillbehör (kundvalda). Dölj endast `--`-paketkomponenter.
  const visibleProducts = products.filter(
    (p) => !p.parent_product_id || isVisibleAccessory(p)
  );

  const totalWeight = visibleProducts.reduce(
    (sum, p) => sum + (p.estimated_weight_kg || 0) * p.quantity,
    0
  );
  const totalVolume = visibleProducts.reduce(
    (sum, p) => sum + (p.estimated_volume_m3 || 0) * p.quantity,
    0
  );

  const productById = new Map(mainProducts.map((p) => [p.id, p]));

  const groupedView = grouping
    ? grouping.groups
        .map((g) => ({
          ...g,
          products: g.product_ids
            .map((id) => productById.get(id))
            .filter((p): p is BookingProduct => !!p),
        }))
        .filter((g) => g.products.length > 0)
    : null;

  const handleGenerate = (prompt: string) => {
    generate.mutate(
      {
        prompt,
        products: mainProducts.map((p) => ({ id: p.id, name: cleanName(p.name) })),
        currentGroups: grouping?.groups,
      },
      {
        onSuccess: () => {
          setGroupDialogOpen(false);
          toast.success(grouping?.groups?.length ? "Gruppering uppdaterad" : "Produkter grupperade");
        },
      }
    );
  };

  const moveProduct = (productId: string, targetGroupId: string) => {
    if (!grouping) return;
    const next: ProductGroup[] = grouping.groups.map((g) => ({
      ...g,
      product_ids: g.product_ids.filter((id) => id !== productId),
    }));
    const target = next.find((g) => g.id === targetGroupId);
    if (target) target.product_ids.push(productId);
    save.mutate({ prompt: grouping.prompt || "", groups: next });
    setMoveDialog(null);
  };

  const createAndMove = (productId: string, name: string) => {
    if (!grouping) return;
    const next: ProductGroup[] = grouping.groups.map((g) => ({
      ...g,
      product_ids: g.product_ids.filter((id) => id !== productId),
    }));
    next.push({ id: crypto.randomUUID(), name, product_ids: [productId] });
    save.mutate({ prompt: grouping.prompt || "", groups: next });
    setMoveDialog(null);
  };

  const toggleCollapsed = (gid: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(gid) ? next.delete(gid) : next.add(gid);
      return next;
    });
  };

  const renderProductLine = (product: BookingProduct, withMenu: boolean) => {
    const accessories = allChildren.filter(
      (c) => c.parent_product_id === product.id && isVisibleAccessory(c)
    );
    return (
      <div key={product.id}>
        <div className="grid grid-cols-[minmax(0,1fr)_2rem_5rem] items-center py-2 gap-3">
          <span className="min-w-0 text-sm font-medium text-foreground">{cleanName(product.name)}</span>
          <div className="flex justify-end">
            {withMenu ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() =>
                      setMoveDialog({ productId: product.id, name: cleanName(product.name) })
                    }
                  >
                    Flytta till annan kategori
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
          <span className="text-right text-sm font-medium text-foreground tabular-nums">
            {product.quantity} st
          </span>
        </div>
        {accessories.map((child) => (
          <div key={child.id} className="grid grid-cols-[minmax(0,1fr)_2rem_5rem] items-center py-1 pl-5 pb-1.5 gap-3">
            <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
              {cleanName(child.name)}
            </span>
            <span />
            <span className="text-right text-xs text-muted-foreground tabular-nums">
              {child.quantity} st
            </span>
          </div>
        ))}
      </div>
    );
  };

  const headerRow = (
    <div className="grid grid-cols-[minmax(0,1fr)_2rem_5rem] items-center gap-3 py-2 border-b border-border/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <span>Produkt</span>
      <span />
      <span className="text-right">Antal</span>
    </div>
  );

  return (
    <div>
      {showGroupingControls && (
        <div className="flex items-center gap-2 mb-3">
          <Button
            size="sm"
            variant={grouping ? "outline" : "default"}
            onClick={() => setGroupDialogOpen(true)}
            disabled={generate.isPending}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {grouping ? "Gruppera om" : "Gruppera med AI"}
          </Button>
          {grouping && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => clear.mutate()}
              title="Ta bort gruppering"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}

      {groupedView ? (
        <div className="space-y-2">
          {headerRow}
          {groupedView.map((g) => {
            const isCollapsed = collapsed.has(g.id);
            return (
              <div key={g.id} className="border border-border/40 rounded-md overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleCollapsed(g.id)}
                  className="w-full flex items-center gap-2 bg-muted/40 hover:bg-muted/60 px-3 py-2 text-sm font-semibold text-foreground"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                  <span>{g.name}</span>
                  <span className="text-xs text-muted-foreground font-normal">
                    ({g.products.length})
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="divide-y divide-border/40 px-3">
                    {g.products.map((p) => renderProductLine(p, true))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          {headerRow}
          <div className="divide-y divide-border/40">
            {mainProducts.map((p) => renderProductLine(p, false))}
          </div>
        </div>
      )}

      {showSummary && (
        <div className="mt-3 pt-2 border-t border-border/40 flex items-center gap-4 text-xs text-muted-foreground">
          <span>{visibleProducts.length} produkter</span>
          {totalWeight > 0 && <span>{Math.round(totalWeight)} kg</span>}
          {totalVolume > 0 && <span>{totalVolume.toFixed(1)} m³</span>}
          {grouping && <span>· {grouping.groups.length} kategorier</span>}
        </div>
      )}

      <GroupProductsDialog
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        initialPrompt={grouping?.prompt || ""}
        productCount={mainProducts.length}
        isGenerating={generate.isPending}
        onGenerate={handleGenerate}
        currentGroups={grouping?.groups}
      />

      {moveDialog && grouping && (
        <MoveProductDialog
          open
          onOpenChange={(o) => !o && setMoveDialog(null)}
          productName={moveDialog.name}
          currentGroupId={
            grouping.groups.find((g) => g.product_ids.includes(moveDialog.productId))?.id || null
          }
          groups={grouping.groups}
          onMove={(targetId) => moveProduct(moveDialog.productId, targetId)}
          onCreateGroup={(name) => createAndMove(moveDialog.productId, name)}
        />
      )}
    </div>
  );
};

export default ProjectProductsList;
