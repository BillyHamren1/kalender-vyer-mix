import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { QrCode, CheckCircle2, Package } from "lucide-react";
import { PackingListItem } from "@/types/packing";
import PackingListItemRow from "./PackingListItemRow";
import PackingQRCode from "./PackingQRCode";
import { Skeleton } from "@/components/ui/skeleton";
import PackingListGroup from "./PackingListGroup";

interface PackingListTabProps {
  packingId: string;
  packingName: string;
  items: PackingListItem[];
  isLoading: boolean;
  onUpdateItem: (id: string, updates: Partial<PackingListItem>) => void;
  onMarkAllPacked: () => void;
}

const PackingListTab = ({
  packingId,
  packingName,
  items,
  isLoading,
  onUpdateItem,
  onMarkAllPacked
}: PackingListTabProps) => {
  const [showQR, setShowQR] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);

  // Helper to check if product is an accessory (↳/└/L, prefix)
  const isAccessoryProduct = (name: string) => {
    const trimmed = name.trim();
    return trimmed.startsWith('↳') || trimmed.startsWith('└') || trimmed.startsWith('L,');
  };

  // Group items per main product:
  // - packageComponents: child items that are NOT accessories
  // - accessories: child items marked as accessories (↳)
  // - orphanedItems: items whose product no longer exists in the booking
  // Accessories should appear under their parent and be listed together (contiguously).
  const { mainProducts, packageComponents, accessoriesByParent, orphanedItems, progress, groupHasNewByKey } = useMemo(() => {
    const main: PackingListItem[] = [];
    const pkgComponents: Record<string, PackingListItem[]> = {};
    const accByParent: Record<string, PackingListItem[]> = {};
    const orphaned: PackingListItem[] = [];
    const groupNewMap: Record<string, boolean> = {};
    
    let totalToPack = 0;
    let totalPacked = 0;

    items.forEach(item => {
      // Orphaned items go to a separate section
      if (item.isOrphaned) {
        orphaned.push(item);
        return;
      }

      totalToPack += item.quantity_to_pack;
      totalPacked += item.quantity_packed;
      
      const productName = item.product?.name || '';
      const parentId = item.product?.parent_product_id;

      // Main product
      if (!parentId) {
        main.push(item);
        return;
      }

      // Child item under parent
      if (isAccessoryProduct(productName)) {
        if (!accByParent[parentId]) accByParent[parentId] = [];
        accByParent[parentId].push(item);
      } else {
        if (!pkgComponents[parentId]) pkgComponents[parentId] = [];
        pkgComponents[parentId].push(item);
      }
    });

    // Sort main products: any group with new items first (parent OR any child)
    const groupHasNew = (parent: PackingListItem) => {
      const parentId = parent.product?.id;
      if (!parentId) return !!parent.isNewlyAdded;
      return (
        !!parent.isNewlyAdded ||
        (pkgComponents[parentId]?.some((i) => i.isNewlyAdded) ?? false) ||
        (accByParent[parentId]?.some((i) => i.isNewlyAdded) ?? false)
      );
    };

    // Precompute for rendering
    main.forEach((p) => {
      const key = p.product?.id ?? p.id;
      groupNewMap[key] = groupHasNew(p);
    });

    main.sort((a, b) => {
      const aNew = groupHasNew(a);
      const bNew = groupHasNew(b);
      if (aNew && !bNew) return -1;
      if (!aNew && bNew) return 1;
      return 0;
    });

    return {
      mainProducts: main,
      packageComponents: pkgComponents,
      accessoriesByParent: accByParent,
      orphanedItems: orphaned,
      groupHasNewByKey: groupNewMap,
      progress: {
        total: totalToPack,
        packed: totalPacked,
        percentage: totalToPack > 0 ? Math.round((totalPacked / totalToPack) * 100) : 0
      }
    };
  }, [items]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Ingen packlista tillgänglig</h3>
          <p className="text-muted-foreground">
            Packlistan genereras automatiskt från bokningens produkter.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5" />
            Packlista
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowQR(!showQR)}
            >
              <QrCode className="h-4 w-4 mr-2" />
              {showQR ? 'Dölj QR' : 'Visa QR'}
            </Button>
            <Button
              size="sm"
              onClick={onMarkAllPacked}
              disabled={progress.packed === progress.total}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Markera alla
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* QR Code section */}
          {showQR && (
            <div className="mb-6">
              <PackingQRCode packingId={packingId} packingName={packingName} />
            </div>
          )}

          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">
                Packat: {progress.packed}/{progress.total} artiklar
              </span>
              <span className="font-medium">{progress.percentage}%</span>
            </div>
            <Progress value={progress.percentage} className="h-2" />
          </div>

          {/* Product list - scrollable */}
          <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-2">
            {/* Main products with their children */}
            {mainProducts.map(item => (
              <div key={item.id}>
                <PackingListGroup
                  parent={item}
                  packageComponents={item.product ? (packageComponents[item.product.id] || []) : []}
                  accessories={item.product ? (accessoriesByParent[item.product.id] || []) : []}
                  onUpdate={onUpdateItem}
                  defaultOpen={groupHasNewByKey[item.product?.id ?? item.id] ?? false}
                />
              </div>
            ))}

            {/* Orphaned items section - at the bottom */}
            {orphanedItems.length > 0 && (
              <>
                <div className="border-t border-dashed border-destructive/30 mt-4 pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-destructive"
                    onClick={() => setShowRemoved((v) => !v)}
                  >
                    {showRemoved ? "Dölj" : "Visa"} borttagna från bokningen ({orphanedItems.length})
                  </Button>
                </div>
                {showRemoved && (
                  <div className="space-y-1">
                    {orphanedItems.map(item => (
                      <PackingListItemRow
                        key={item.id}
                        item={item}
                        onUpdate={onUpdateItem}
                        isAccessory={!!item.product?.parent_product_id}
                        isOrphaned={true}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PackingListTab;
