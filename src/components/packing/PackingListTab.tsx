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

  // Helper to check if product is an accessory (starts with ↳ or L,)
  const isAccessoryProduct = (name: string) => {
    const trimmed = name.trim();
    return trimmed.startsWith('↳') || trimmed.startsWith('└') || trimmed.startsWith('L,');
  };

  // Group items: main products, their package components, and collect all accessories together
  const { mainProducts, packageComponents, allAccessories, progress } = useMemo(() => {
    const main: PackingListItem[] = [];
    const pkgComponents: Record<string, PackingListItem[]> = {};
    const accessories: PackingListItem[] = [];
    
    let totalToPack = 0;
    let totalPacked = 0;

    items.forEach(item => {
      totalToPack += item.quantity_to_pack;
      totalPacked += item.quantity_packed;
      
      const productName = item.product?.name || '';
      const parentId = item.product?.parent_product_id;
      
      // Check if this is an accessory (↳ prefix)
      if (isAccessoryProduct(productName)) {
        accessories.push(item);
      } else if (parentId) {
        // Package component (⦿ prefix) - group under parent
        if (!pkgComponents[parentId]) pkgComponents[parentId] = [];
        pkgComponents[parentId].push(item);
      } else {
        // Main product
        main.push(item);
      }
    });

    return {
      mainProducts: main,
      packageComponents: pkgComponents,
      allAccessories: accessories,
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
            {/* Main products with their package components */}
            {mainProducts.map(item => (
              <div key={item.id}>
                <PackingListItemRow
                  item={item}
                  onUpdate={onUpdateItem}
                  isAccessory={false}
                />
                {/* Render package components (⦿) for this product */}
                {item.product && packageComponents[item.product.id]?.map(comp => (
                  <PackingListItemRow
                    key={comp.id}
                    item={comp}
                    onUpdate={onUpdateItem}
                    isAccessory={true}
                  />
                ))}
              </div>
            ))}
            
            {/* All accessories (↳) grouped together at the end */}
            {allAccessories.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Tillbehör</h4>
                {allAccessories.map(acc => (
                  <PackingListItemRow
                    key={acc.id}
                    item={acc}
                    onUpdate={onUpdateItem}
                    isAccessory={true}
                  />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PackingListTab;
