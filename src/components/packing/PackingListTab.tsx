import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { QrCode, CheckCircle2, Package } from "lucide-react";
import { PackingListItem } from "@/types/packing";
import PackingListItemRow from "./PackingListItemRow";
import PackingQRCode from "./PackingQRCode";
import { Skeleton } from "@/components/ui/skeleton";

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
  // Group items: mainProducts at top, children grouped by parent_product_id
  // Order within children: package components (⦿) first, then accessories (↳)
  const { mainProducts, childrenByParent, orphanedChildren, progress } = useMemo(() => {
    const main: PackingListItem[] = [];
    const childrenByParentId: Record<string, PackingListItem[]> = {};
    
    let totalToPack = 0;
    let totalPacked = 0;

    // First pass: separate main products from children
    items.forEach(item => {
      totalToPack += item.quantity_to_pack;
      totalPacked += item.quantity_packed;
      
      const parentId = item.product?.parent_product_id;

      if (!parentId) {
        // Main product (no parent)
        main.push(item);
      } else {
        // Child product - group by parent
        if (!childrenByParentId[parentId]) childrenByParentId[parentId] = [];
        childrenByParentId[parentId].push(item);
      }
    });

    // Sort children: package components (⦿) first, then accessories (↳)
    Object.values(childrenByParentId).forEach(children => {
      children.sort((a, b) => {
        const aName = a.product?.name || '';
        const bName = b.product?.name || '';
        const aIsAccessory = isAccessoryProduct(aName);
        const bIsAccessory = isAccessoryProduct(bName);
        // Package components (not accessories) come before accessories
        if (!aIsAccessory && bIsAccessory) return -1;
        if (aIsAccessory && !bIsAccessory) return 1;
        return 0;
      });
    });



    // Find children whose parent is NOT in mainProducts (orphaned children)
    const mainProductIds = new Set(main.map(m => m.product?.id).filter(Boolean));
    const orphanedChildItems: PackingListItem[] = [];

    Object.entries(childrenByParentId).forEach(([parentId, children]) => {
      if (!mainProductIds.has(parentId)) {
        orphanedChildItems.push(...children);
      }
    });

    return {
      mainProducts: main,
      childrenByParent: childrenByParentId,
      orphanedChildren: orphanedChildItems,
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
            {/* Main products with their children (package components + accessories) */}
            {mainProducts.map(item => (
              <div key={item.id}>
                <PackingListItemRow
                  item={item}
                  onUpdate={onUpdateItem}
                  isAccessory={false}
                />
                {item.product?.id && childrenByParent[item.product.id]?.map(child => (
                  <PackingListItemRow
                    key={child.id}
                    item={child}
                    onUpdate={onUpdateItem}
                    isAccessory={true}
                  />
                ))}
              </div>
            ))}

            {/* Children without parent in list - shown as main items */}
            {orphanedChildren.length > 0 && (
              <>
                <div className="border-t border-dashed border-muted mt-4 pt-3">
                  <p className="text-xs text-muted-foreground font-medium mb-2">
                    Tillbehör utan huvudprodukt ({orphanedChildren.length})
                  </p>
                </div>
                {orphanedChildren.map(item => (
                  <PackingListItemRow
                    key={item.id}
                    item={item}
                    onUpdate={onUpdateItem}
                    isAccessory={false}
                  />
                ))}
              </>
            )}

          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PackingListTab;
