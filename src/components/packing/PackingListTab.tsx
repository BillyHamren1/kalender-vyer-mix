import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { QrCode, CheckCircle2, Package, ChevronDown, ChevronRight } from "lucide-react";
import { PackingListItem } from "@/types/packing";
import { BookingGroup } from "@/hooks/usePackingList";
import PackingListItemRow from "./PackingListItemRow";
import PackingQRCode from "./PackingQRCode";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface PackingListTabProps {
  packingId: string;
  packingName: string;
  items: PackingListItem[];
  isLoading: boolean;
  onUpdateItem: (id: string, updates: Partial<PackingListItem>) => void;
  onMarkAllPacked: () => void;
  bookingGroups?: BookingGroup[];
  isMultiBooking?: boolean;
}

// Helper to check if product is an accessory (↳/└/L, prefix)
const isAccessoryProduct = (name: string) => {
  const trimmed = name.trim();
  return trimmed.startsWith('↳') || trimmed.startsWith('└') || trimmed.startsWith('L,');
};

interface GroupedItems {
  mainProducts: PackingListItem[];
  childrenByParent: Record<string, PackingListItem[]>;
  orphanedChildren: PackingListItem[];
  progress: { total: number; packed: number; percentage: number };
}

const groupItems = (items: PackingListItem[]): GroupedItems => {
  const main: PackingListItem[] = [];
  const childrenByParentId: Record<string, PackingListItem[]> = {};
  let totalToPack = 0;
  let totalPacked = 0;

  items.forEach(item => {
    totalToPack += item.quantity_to_pack;
    totalPacked += item.quantity_packed;
    const parentId = item.product?.parent_product_id;
    if (!parentId) {
      main.push(item);
    } else {
      if (!childrenByParentId[parentId]) childrenByParentId[parentId] = [];
      childrenByParentId[parentId].push(item);
    }
  });

  // Sort children: package components first, then accessories
  Object.values(childrenByParentId).forEach(children => {
    children.sort((a, b) => {
      const aIsAccessory = isAccessoryProduct(a.product?.name || '');
      const bIsAccessory = isAccessoryProduct(b.product?.name || '');
      if (!aIsAccessory && bIsAccessory) return -1;
      if (aIsAccessory && !bIsAccessory) return 1;
      return 0;
    });
  });

  const mainProductIds = new Set(main.map(m => m.product?.id).filter(Boolean));
  const orphanedChildItems: PackingListItem[] = [];
  Object.entries(childrenByParentId).forEach(([parentId, children]) => {
    if (!mainProductIds.has(parentId)) orphanedChildItems.push(...children);
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
};

const ItemList = ({
  grouped,
  onUpdateItem,
}: {
  grouped: GroupedItems;
  onUpdateItem: (id: string, updates: Partial<PackingListItem>) => void;
}) => (
  <div className="space-y-1">
    {grouped.mainProducts.map(item => (
      <div key={item.id}>
        <PackingListItemRow item={item} onUpdate={onUpdateItem} isAccessory={false} />
        {item.product?.id && grouped.childrenByParent[item.product.id]?.map(child => (
          <PackingListItemRow key={child.id} item={child} onUpdate={onUpdateItem} isAccessory={true} />
        ))}
      </div>
    ))}
    {grouped.orphanedChildren.length > 0 && (
      <>
        <div className="border-t border-dashed border-muted mt-4 pt-3">
          <p className="text-xs text-muted-foreground font-medium mb-2">
            Tillbehör utan huvudprodukt ({grouped.orphanedChildren.length})
          </p>
        </div>
        {grouped.orphanedChildren.map(item => (
          <PackingListItemRow key={item.id} item={item} onUpdate={onUpdateItem} isAccessory={false} />
        ))}
      </>
    )}
  </div>
);

const BookingSection = ({
  group,
  onUpdateItem,
}: {
  group: BookingGroup;
  onUpdateItem: (id: string, updates: Partial<PackingListItem>) => void;
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const grouped = useMemo(() => groupItems(group.items), [group.items]);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="w-full">
        <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/40 rounded-lg hover:bg-muted/60 transition-colors">
          {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <Package className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">{group.client}</span>
          {group.bookingNumber && (
            <span className="text-xs text-muted-foreground font-mono">#{group.bookingNumber}</span>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {grouped.progress.packed}/{grouped.progress.total} ({grouped.progress.percentage}%)
          </span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-2 pt-1">
          <ItemList grouped={grouped} onUpdateItem={onUpdateItem} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const PackingListTab = ({
  packingId,
  packingName,
  items,
  isLoading,
  onUpdateItem,
  onMarkAllPacked,
  bookingGroups = [],
  isMultiBooking = false,
}: PackingListTabProps) => {
  const [showQR, setShowQR] = useState(false);

  const totalGrouped = useMemo(() => groupItems(items), [items]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5" />
            Packlista
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowQR(!showQR)}>
              <QrCode className="h-4 w-4 mr-2" />
              {showQR ? 'Dölj QR' : 'Visa QR'}
            </Button>
            <Button
              size="sm"
              onClick={onMarkAllPacked}
              disabled={totalGrouped.progress.packed === totalGrouped.progress.total}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Markera alla
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showQR && (
            <div className="mb-6">
              <PackingQRCode packingId={packingId} packingName={packingName} />
            </div>
          )}

          {/* Total progress */}
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">
                Packat: {totalGrouped.progress.packed}/{totalGrouped.progress.total} artiklar
              </span>
              <span className="font-medium">{totalGrouped.progress.percentage}%</span>
            </div>
            <Progress value={totalGrouped.progress.percentage} className="h-2" />
          </div>

          {isMultiBooking && bookingGroups.length > 0 ? (
            <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-2">
              {/* Summary section */}
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                  Sammanfattning — alla produkter
                </h4>
                <ItemList grouped={totalGrouped} onUpdateItem={onUpdateItem} />
              </div>

              {/* Per-booking sections */}
              <div className="border-t border-border/40 pt-4 space-y-2">
                <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                  Per bokning
                </h4>
                {bookingGroups.map(group => (
                  <BookingSection
                    key={group.bookingId}
                    group={group}
                    onUpdateItem={onUpdateItem}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-2">
              <ItemList grouped={totalGrouped} onUpdateItem={onUpdateItem} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default PackingListTab;
