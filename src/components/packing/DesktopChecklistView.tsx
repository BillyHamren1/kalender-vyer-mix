import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import {
  Check,
  RefreshCw,
  AlertCircle,
  Package,
  ChevronRight,
  ChevronDown,
  QrCode,
  EyeOff,
  Hash,
  Printer,
  History,
  Lock,
} from 'lucide-react';
import { PackingHistoryDialog } from '@/components/packing/PackingHistoryDialog';
import { openPrintablePackingList } from '@/lib/packing/printPackingList';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchPackingListItemsForDesktop as fetchPackingListItems,
  getItemParcelsDesktop as getItemParcels,
  fetchPackingForDesktop as fetchPackingForScanner,
} from '@/services/desktopPackingService';
import { PackingWithBooking } from '@/types/packing';
import PackingQRCode from './PackingQRCode';
import { computePackingProgress } from '@/lib/packing/progress';

// ============================================================================
// READ-ONLY desktop checklist.
//
// SÄKERHETSREGEL: Packningsändringar måste gå via scanner-api med aktiv
// `packing_work_session`. Desktop-vyn saknar fortfarande session/dialog för
// signering vid lämning — fram tills att stödet finns på desktop visar den
// här vyn ENBART status, kolli-tillhörighet, exkluderade rader och historik.
// All mutativ logik (toggle/decrement/parcel/exclude/manual-row/sign) är
// borttagen härifrån. Packa i skannerappen.
// ============================================================================

interface DesktopChecklistViewProps {
  packingId: string;
  packingName: string;
}

interface PackingItem {
  id: string;
  quantity_to_pack: number;
  quantity_packed: number;
  verified_at: string | null;
  verified_by: string | null;
  parcel_id: string | null;
  excluded?: boolean;
  manual_name?: string | null;
  booking_product_id?: string | null;
  booking_products: {
    id: string;
    name: string;
    quantity: number;
    sku: string | null;
    notes: string | null;
    parent_product_id: string | null;
    parent_package_id: string | null;
    is_package_component: boolean | null;
    booking_id?: string;
  } | null;
}

interface BookingGroupInfo {
  bookingId: string;
  client: string;
  bookingNumber: string | null;
  eventdate: string | null;
}

const cleanProductName = (name: string): string =>
  name
    .replace(/^(?:L,\s*)+/, '')
    .replace(/^[↳└⦿\s,\-–—]+/, '')
    .trim();

const formatToTitleCase = (text: string): string => {
  const upperCount = (text.match(/[A-ZÅÄÖ]/g) || []).length;
  const lowerCount = (text.match(/[a-zåäö]/g) || []).length;
  if (lowerCount >= upperCount) return text;
  return text
    .split(' ')
    .map((word) => {
      if (word.length <= 3 && /^[A-ZÅÄÖ0-9]+$/.test(word)) return word;
      if (/\d/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};

const DesktopChecklistView: React.FC<DesktopChecklistViewProps> = ({ packingId, packingName }) => {
  const [packing, setPacking] = useState<PackingWithBooking | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [items, setItems] = useState<PackingItem[]>([]);
  const [progress, setProgress] = useState({ total: 0, verified: 0, percentage: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const itemOrderRef = useRef<Record<string, number>>({});
  const [isSigned, setIsSigned] = useState(false);
  const [signedInfo, setSignedInfo] = useState<{ by: string; at: string } | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  const [bookingGroups, setBookingGroups] = useState<BookingGroupInfo[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [itemParcelMap, setItemParcelMap] = useState<Record<string, number>>({});

  const recalcProgress = useCallback((updatedItems: PackingItem[]) => {
    const { total, verified, percentage } = computePackingProgress(updatedItems);
    setProgress({ total, verified, percentage });
  }, []);

  const loadData = useCallback(
    async (isBackground = false) => {
      try {
        if (!isBackground) setIsLoading(true);

        const [packingData, itemsData] = await Promise.all([
          fetchPackingForScanner(packingId),
          fetchPackingListItems(packingId),
        ]);
        setPacking(packingData);
        if (packingData?.signed_by && packingData?.signed_at) {
          setIsSigned(true);
          setSignedInfo({ by: packingData.signed_by, at: packingData.signed_at });
        }
        const parcelsData = await getItemParcels(packingId);

        // Group info for multi-booking packings
        const productBookingIds = new Set<string>();
        (itemsData as any[]).forEach((item) => {
          const bid = item.booking_products?.booking_id;
          if (bid) productBookingIds.add(bid);
        });

        if (productBookingIds.size > 1) {
          const { data: bookings } = await supabase
            .from('bookings')
            .select('id, client, booking_number')
            .in('id', Array.from(productBookingIds));
          setBookingGroups(
            (bookings || []).map((b) => ({
              bookingId: b.id,
              client: b.client,
              bookingNumber: b.booking_number,
            })),
          );
        } else {
          setBookingGroups([]);
        }

        const typedItems = itemsData as PackingItem[];
        let finalItems: PackingItem[];
        if (Object.keys(itemOrderRef.current).length === 0) {
          const order: Record<string, number> = {};
          typedItems.forEach((item, idx) => {
            order[item.id] = idx;
          });
          itemOrderRef.current = order;
          finalItems = typedItems;
        } else {
          finalItems = [...typedItems].sort(
            (a, b) => (itemOrderRef.current[a.id] ?? 9999) - (itemOrderRef.current[b.id] ?? 9999),
          );
        }
        setItems(finalItems);
        recalcProgress(finalItems);
        setItemParcelMap(parcelsData);
      } catch (err) {
        console.error('Error loading packing data:', err);
        if (!isBackground) toast.error('Kunde inte ladda packlista');
      } finally {
        if (!isBackground) setIsLoading(false);
      }
    },
    [packingId, recalcProgress],
  );

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  // Build parent-children map
  const childrenByParent: Record<string, PackingItem[]> = {};
  items.forEach((item) => {
    const parentId = item.booking_products?.parent_product_id;
    if (parentId) {
      if (!childrenByParent[parentId]) childrenByParent[parentId] = [];
      childrenByParent[parentId].push(item);
    }
  });

  const activeItems = items.filter((i) => !i.excluded);
  const excludedItems = items.filter((i) => i.excluded);
  const manualItems = activeItems.filter((i) => !i.booking_product_id && i.manual_name);
  const productItems = activeItems.filter((i) => i.booking_product_id || !i.manual_name);

  const isMultiBooking = bookingGroups.length > 1;
  const groupedItems = isMultiBooking
    ? bookingGroups.map((group) => ({
        ...group,
        items: productItems.filter((i) => i.booking_products?.booking_id === group.bookingId),
      }))
    : [{ bookingId: 'all', client: '', bookingNumber: null, items: productItems }];

  const renderItem = (item: PackingItem) => {
    const rawName = item.manual_name || item.booking_products?.name || 'Okänd produkt';
    const trimmedName = rawName.trimStart();
    const productId = item.booking_products?.id;

    const isChildByRelation = !!(
      item.booking_products?.parent_product_id ||
      item.booking_products?.parent_package_id ||
      item.booking_products?.is_package_component
    );
    const isChildByPrefix =
      trimmedName.startsWith('↳') ||
      trimmedName.startsWith('└') ||
      trimmedName.startsWith('L,') ||
      trimmedName.startsWith('⦿');
    const isChild = isChildByRelation || isChildByPrefix;
    const hasChildren = productId ? (childrenByParent[productId]?.length || 0) > 0 : false;
    const isParent = !isChild && hasChildren;

    let packed = item.quantity_packed || 0;
    let total = item.quantity_to_pack;

    if (isParent && productId) {
      const children = childrenByParent[productId] || [];
      const allChildrenPacked =
        children.length > 0 && children.every((c) => (c.quantity_packed || 0) >= c.quantity_to_pack);
      total = 1;
      packed = allChildrenPacked ? 1 : 0;
    }

    const cleanName = cleanProductName(rawName);
    const displayName = isChild ? formatToTitleCase(cleanName) : cleanName.toUpperCase();
    const isComplete = packed >= total && total > 0;
    const isPartial = packed > 0 && packed < total;
    const parcelNumber = itemParcelMap[item.id];
    const isManual = !item.booking_product_id && !!item.manual_name;

    return (
      <div
        key={item.id}
        className={`w-full flex items-center gap-3 transition-all ${
          isComplete
            ? 'bg-primary/5'
            : isPartial
              ? 'bg-amber-50/50 dark:bg-amber-950/10'
              : ''
        } ${isParent ? 'bg-muted border-b border-t border-border' : ''} ${
          isChild ? 'pl-6 pr-4 py-2.5' : 'px-4 py-3'
        } ${isManual ? 'border-l-2 border-l-blue-400' : ''}`}
      >
        <div
          className={`shrink-0 rounded-full flex items-center justify-center ${
            isChild ? 'w-6 h-6' : 'w-7 h-7'
          } ${
            isComplete
              ? 'bg-primary'
              : isPartial
                ? 'bg-amber-500'
                : isParent
                  ? 'border-2 border-dashed border-muted-foreground/30'
                  : 'border-2 border-muted-foreground/40'
          }`}
        >
          {isComplete && <Check className="text-white w-3.5 h-3.5" />}
          {isPartial && <span className="text-white text-[11px] font-bold">{packed}</span>}
        </div>

        <div className="flex-1 min-w-0">
          <span
            className={`block truncate ${
              isChild ? 'text-sm font-normal' : 'text-sm font-semibold tracking-wide'
            } ${
              isComplete
                ? 'text-primary line-through'
                : isPartial
                  ? 'text-amber-800 dark:text-amber-400'
                  : isChild
                    ? 'text-muted-foreground'
                    : 'text-foreground'
            }`}
          >
            {displayName}
          </span>
          {item.booking_products?.sku && (
            <span className="text-[11px] text-muted-foreground font-mono">
              [{item.booking_products.sku}]
            </span>
          )}
          {isParent && (
            <span className="text-[11px] text-muted-foreground block">
              Auto vid alla delar packade
            </span>
          )}
        </div>

        {parcelNumber && (
          <div className="shrink-0 flex items-center gap-0.5 text-primary">
            <Package className="h-3.5 w-3.5" />
            <span className="text-xs font-bold">#{parcelNumber}</span>
          </div>
        )}

        <div
          className={`shrink-0 min-w-[64px] flex items-center justify-center rounded-md px-2 py-1 ${
            isComplete
              ? 'bg-primary/10 text-primary'
              : isPartial
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                : 'bg-muted/60 text-muted-foreground'
          }`}
        >
          <span className="font-mono font-bold text-sm">
            {packed}/{total}
          </span>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg text-foreground flex items-center gap-2">
          <Package className="h-5 w-5" />
          Packlista
        </h3>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const clientName = packing?.booking?.client || bookingGroups[0]?.client || null;
              const bookingNumber =
                packing?.booking?.booking_number || bookingGroups[0]?.bookingNumber || null;
              const rigDate = (packing?.booking as any)?.rigdaydate || null;

              const printRows = activeItems.map((item) => {
                const rawName = item.manual_name || item.booking_products?.name || 'Okänd produkt';
                const cleanName = cleanProductName(rawName);
                const isChildByRelation = !!(
                  item.booking_products?.parent_product_id ||
                  item.booking_products?.parent_package_id ||
                  item.booking_products?.is_package_component
                );
                const trimmedName = rawName.trimStart();
                const isChildByPrefix =
                  trimmedName.startsWith('↳') ||
                  trimmedName.startsWith('└') ||
                  trimmedName.startsWith('L,') ||
                  trimmedName.startsWith('⦿');
                const isChild = isChildByRelation || isChildByPrefix;
                const displayName = isChild
                  ? formatToTitleCase(cleanName)
                  : cleanName.toUpperCase();
                const groupLabel = isMultiBooking
                  ? (() => {
                      const bid = item.booking_products?.booking_id;
                      const g = bookingGroups.find((x) => x.bookingId === bid);
                      return g
                        ? `${g.client}${g.bookingNumber ? ` · #${g.bookingNumber}` : ''}`
                        : null;
                    })()
                  : null;
                return {
                  name: displayName,
                  sku: item.booking_products?.sku ?? null,
                  quantity: item.quantity_to_pack,
                  isChild,
                  groupLabel,
                };
              });

              openPrintablePackingList(
                {
                  packingName,
                  bookingNumber,
                  client: clientName,
                  rigDate,
                },
                printRows,
              );
            }}
          >
            <Printer className="h-4 w-4 mr-2" />
            Skriv ut
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}>
            <History className="h-4 w-4 mr-2" />
            Historik
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowQR(!showQR)}>
            <QrCode className="h-4 w-4 mr-2" />
            {showQR ? 'Dölj QR' : 'Visa QR'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => loadData(false)}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Uppdatera
          </Button>
        </div>
      </div>

      {/* Read-only banner */}
      <Card className="border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20">
        <CardContent className="py-3 px-4 flex items-start gap-3">
          <Lock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-900 dark:text-amber-200">
              Packning sker i skannerappen
            </p>
            <p className="text-xs text-amber-800/90 dark:text-amber-200/80 mt-0.5">
              Den här webbvyn är skrivskyddad — kolli, +/-, exkludering, manuella rader
              och signering kräver aktiv packningssession och hanteras enbart i skannern.
              Du ser status, kolli-tillhörighet och historik här.
            </p>
          </div>
        </CardContent>
      </Card>

      {showQR && (
        <div className="mb-4">
          <PackingQRCode packingId={packingId} packingName={packingName} />
        </div>
      )}

      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Progress value={progress.percentage} className="h-2.5" />
        </div>
        <span className="text-sm font-mono font-semibold text-muted-foreground">
          {progress.verified}/{progress.total}
        </span>
        <span className="text-sm font-bold text-primary">{progress.percentage}%</span>
      </div>

      {/* No items */}
      {items.length === 0 && (
        <Card className="border-amber-500/50 bg-amber-50">
          <CardContent className="py-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800 text-sm">Inga produkter</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Gå till Översikt och generera packlistan först.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Product list grouped by booking */}
      {activeItems.length > 0 && (
        <div className="space-y-3">
          {groupedItems.map((group) => {
            const isCollapsed = collapsedGroups.has(group.bookingId);
            const groupProductItems = group.items;

            return (
              <div key={group.bookingId} className="border rounded-lg overflow-hidden bg-card">
                {isMultiBooking && (
                  <button
                    onClick={() => toggleGroupCollapse(group.bookingId)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/60 border-b hover:bg-muted/80 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                      <span className="font-medium text-sm">{group.client}</span>
                      {group.bookingNumber && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Hash className="h-3 w-3" />
                          {group.bookingNumber}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {groupProductItems.length} artiklar
                    </span>
                  </button>
                )}

                {!isCollapsed && (
                  <>
                    {!isMultiBooking && (
                      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/40">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Produkt
                        </span>
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Packat
                        </span>
                      </div>
                    )}
                    <div className="divide-y divide-border/30 max-h-[60vh] overflow-y-auto">
                      {groupProductItems.map(renderItem)}
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {manualItems.length > 0 && (
            <div className="border rounded-lg overflow-hidden bg-card border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between px-4 py-2 border-b bg-blue-50/60 dark:bg-blue-950/30">
                <span className="text-xs font-medium text-blue-700 dark:text-blue-400 uppercase tracking-wider">
                  Manuellt tillagda
                </span>
                <span className="text-xs text-muted-foreground">
                  {manualItems.length} artiklar
                </span>
              </div>
              <div className="divide-y divide-border/30">{manualItems.map(renderItem)}</div>
            </div>
          )}
        </div>
      )}

      {/* Excluded items (read-only) */}
      {excludedItems.length > 0 && (
        <Collapsible open={showExcluded} onOpenChange={setShowExcluded}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between text-muted-foreground"
            >
              <span className="flex items-center gap-1.5">
                <EyeOff className="h-3.5 w-3.5" />
                Exkluderade ({excludedItems.length})
              </span>
              {showExcluded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border rounded-lg overflow-hidden bg-muted/20 mt-1">
              <div className="divide-y divide-border/20">
                {excludedItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 opacity-60">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-muted-foreground line-through truncate block">
                        {item.manual_name || item.booking_products?.name || 'Okänd'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Signed indicator (read-only) */}
      {isSigned && signedInfo && (
        <div className="w-full h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center gap-2 text-primary font-semibold">
          <Check className="h-5 w-5" />
          <span className="text-sm">
            Signerad av {signedInfo.by},{' '}
            {new Date(signedInfo.at).toLocaleDateString('sv-SE', {
              day: 'numeric',
              month: 'short',
            })}{' '}
            {new Date(signedInfo.at).toLocaleTimeString('sv-SE', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      )}

      <PackingHistoryDialog
        open={showHistory}
        onOpenChange={setShowHistory}
        packingId={packingId}
      />

    </div>
  );
};

export default DesktopChecklistView;
