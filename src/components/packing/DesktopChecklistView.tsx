import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  Check,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Package,
  ChevronRight,
  ChevronDown,
  QrCode,
  Hash,
  Printer,
  History,
  PackageX,
  Undo2,
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PackingHistoryDialog } from '@/components/packing/PackingHistoryDialog';
import type { PrintablePackingMeta, PrintablePackingRow } from '@/lib/packing/printPackingList';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchPackingListItemsForDesktop as fetchPackingListItems,
  getItemParcelsDesktop as getItemParcels,
  fetchPackingForDesktop as fetchPackingForScanner,
  repairPackingItemsDesktop,
  setWarehousePackingListItemPackability,
} from '@/services/desktopPackingService';
import { PackingWithBooking } from '@/types/packing';
import PackingQRCode from './PackingQRCode';
import { computePackingProgress } from '@/lib/packing/progress';
import type { PackingIntegrityResult } from '@/lib/packing/packingIntegrity';
import PackingIntegrityBanner from './PackingIntegrityBanner';
import PrintPackingListDialog from './PrintPackingListDialog';
import { getOperationsPackingPresentation } from '@/lib/packing/operationsPresentation';
import { buildPackingHierarchy, readPackingRelationship } from '@/lib/packing/packingHierarchy';

// ============================================================================
// Desktop checklist with one bounded warehouse write capability.
//
// SÄKERHETSREGEL: Packningsändringar måste gå via scanner-api med aktiv
// `packing_work_session`. Desktop-vyn saknar fortfarande session/dialog för
// signering vid lämning — fram tills att stödet finns på desktop visar den
// här vyn status, kolli-tillhörighet och historik. Packningsbarhet får ändras
// via WMS-first edit-packing-list; all fysisk packning, kolli, +/- och signering
// hanteras fortfarande enbart i skannern.
// ============================================================================

interface DesktopChecklistViewProps {
  packingId: string;
  packingName: string;
  integrity?: PackingIntegrityResult | null;
  integrityError?: Error | null;
  onRefreshIntegrity?: () => void | Promise<void>;
}

interface PackingItem {
  id: string;
  quantity_to_pack: number;
  quantity_packed: number;
  verified_at: string | null;
  verified_by: string | null;
  parcel_id: string | null;
  packed_at?: string | null;
  planning_excluded_at?: string | null;
  excluded?: boolean;
  product_packable_default?: boolean;
  booking_packability_override?: boolean | null;
  warehouse_packability_override?: boolean | null;
  is_packable?: boolean | null;
  packability_source?: 'product_default' | 'booking_override' | 'warehouse_override' | null;
  packability_revision?: number;
  source_booking_id?: string | null;
  wms_line_id?: string | null;
  wms_sku?: string | null;
  notes?: string | null;
  manual_name?: string | null;
  booking_product_id?: string | null;
  booking_products: {
    id: string;
    name: string;
    quantity: number;
    sku: string | null;
    notes: string | null;
    sort_index?: number | null;
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
  internalnotes: string | null;
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

const DesktopChecklistView: React.FC<DesktopChecklistViewProps> = ({
  packingId,
  packingName,
  integrity = null,
  integrityError = null,
  onRefreshIntegrity,
}) => {
  const [packing, setPacking] = useState<PackingWithBooking | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [items, setItems] = useState<PackingItem[]>([]);
  const [progress, setProgress] = useState({ total: 0, verified: 0, percentage: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const itemOrderRef = useRef<Record<string, number>>({});
  const [isSigned, setIsSigned] = useState(false);
  const [signedInfo, setSignedInfo] = useState<{ by: string; at: string } | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [bookingGroups, setBookingGroups] = useState<BookingGroupInfo[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [itemParcelMap, setItemParcelMap] = useState<Record<string, number>>({});
  const [isRepairing, setIsRepairing] = useState(false);
  const loadDataRef = useRef<((bg?: boolean) => Promise<void>) | null>(null);
  const [pendingEdit, setPendingEdit] = useState<
    { item: PackingItem; mode: 'set_packable' | 'set_non_packable'; name: string } | null
  >(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [printRows, setPrintRows] = useState<PrintablePackingRow[]>([]);
  const [printMeta, setPrintMeta] = useState<PrintablePackingMeta | null>(null);

  const handleRepair = useCallback(async () => {
    setIsRepairing(true);
    try {
      const res = await repairPackingItemsDesktop(packingId);
      if (res.inserted > 0) {
        toast.success(`${res.inserted} rader lades till i packlistan`);
      } else {
        toast.info('Inga saknade rader hittades');
      }
      await loadDataRef.current?.(true);
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte generera packlistan');
    } finally {
      setIsRepairing(false);
    }
  }, [packingId]);

  const recalcProgress = useCallback((updatedItems: PackingItem[]) => {
    // Kanonisk regel i computePackingProgress: excluded !== true && is_packable !== false.
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
          const bid = item.source_booking_id || item.booking_products?.booking_id;
          if (bid) productBookingIds.add(bid);
        });

        if (productBookingIds.size > 1) {
          const { data: bookings } = await supabase
            .from('bookings')
            .select('id, client, booking_number, eventdate, internalnotes')
            .in('id', Array.from(productBookingIds));
          setBookingGroups(
            (bookings || []).map((b) => ({
              bookingId: b.id,
              client: b.client,
              bookingNumber: b.booking_number,
              eventdate: b.eventdate,
              internalnotes: b.internalnotes,
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

  loadDataRef.current = loadData;

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

  // Historiskt utfasade rader (excluded === true) finns kvar i databasen men
  // är inte längre en del av packlistan — de döljs helt, oavsett is_packable.
  const currentItems = items.filter((i) => i.excluded !== true);

  // Build parent-children map (endast aktuella rader)
  const childrenByParent: Record<string, PackingItem[]> = {};
  currentItems.forEach((item) => {
    const parentId = item.booking_products?.parent_product_id;
    if (parentId) {
      if (!childrenByParent[parentId]) childrenByParent[parentId] = [];
      childrenByParent[parentId].push(item);
    }
  });

  // Alla aktuella WMS-projicerade rader visas i samma hierarki/ordning.
  // Aktuella icke-packningsbara rader visas överstrukna men räknas inte i
  // progress och skrivs inte ut. Never rebuild this list from booking_products.
  const packableItems = currentItems.filter((i) => i.is_packable !== false);
  const manualItems = currentItems.filter((i) => !i.booking_product_id && !i.wms_line_id && i.manual_name);
  const productItems = currentItems.filter((i) => !manualItems.includes(i));


  const isMultiBooking = bookingGroups.length > 1;
  const groupedItems = isMultiBooking
    ? bookingGroups.map((group) => ({
        ...group,
        items: productItems.filter(
          (i) => (i.source_booking_id || i.booking_products?.booking_id) === group.bookingId,
        ),
      }))
    : [{ bookingId: 'all', client: '', bookingNumber: null, eventdate: null, items: productItems }];

  const integrityPending = !integrity && !integrityError;
  const integrityMismatch = Boolean(integrity?.sourceAvailable && !integrity?.isExactMatch);
  // Utskrift blockeras aldrig – osäkert läge markeras istället på utskriften.
  const printPreliminaryReason = integrityError
    ? 'packlistans integritet kunde inte verifieras'
    : integrityMismatch
      ? 'avvikelse mellan bokning och packlista'
      : integrityPending
        ? 'integritetskontrollen har inte slutförts'
        : null;
  const printTitle = printPreliminaryReason
    ? `Skrivs ut som PRELIMINÄR (${printPreliminaryReason})`
    : 'Skriv ut packlistan eller spara som PDF';

  const preparePrint = () => {
    const clientName = packing?.booking?.client || bookingGroups[0]?.client || null;
    const bookingNumber = packing?.booking?.booking_number || bookingGroups[0]?.bookingNumber || null;
    const rigDate = (packing?.booking as any)?.rigdaydate || null;

    const rows = groupedItems.flatMap((group) => buildPackingHierarchy<PackingItem>(
      group.items.filter((item) => item.is_packable !== false),
    ).flatMap((entry) => {
      const hierarchyItems = entry.kind === 'standalone'
        ? [{ item: entry.item, packageName: null, relationshipKind: 'standalone' as const }]
        : [
            ...entry.group.members.map((item) => ({
              item,
              packageName: entry.group.packageName,
              relationshipKind: 'package_member' as const,
            })),
            ...entry.group.accessories.map((item) => ({
              item,
              packageName: entry.group.packageName,
              relationshipKind: 'accessory' as const,
            })),
          ];

      return hierarchyItems.map(({ item, packageName, relationshipKind }) => {
      const rawName = item.manual_name || item.booking_products?.name || 'Okänd produkt';
      const cleanName = cleanProductName(rawName);
      const isChild = relationshipKind !== 'standalone';
      const displayName = isChild ? formatToTitleCase(cleanName) : cleanName.toUpperCase();
      const groupLabel = isMultiBooking
        ? (() => {
            const bid = item.source_booking_id || item.booking_products?.booking_id;
            const group = bookingGroups.find((candidate) => candidate.bookingId === bid);
            return group
              ? `${group.client}${group.bookingNumber ? ` · #${group.bookingNumber}` : ''}`
              : null;
          })()
        : null;

      return {
        name: displayName,
        sku: item.wms_sku ?? item.booking_products?.sku ?? null,
        quantity: item.quantity_to_pack,
        isChild,
        groupLabel,
        parcelNumber: itemParcelMap[item.id] ?? null,
        notes: item.notes ?? item.booking_products?.notes ?? null,
        packageName,
        relationshipKind,
      };
      });
    }));

    const multiBookingNotes = bookingGroups
      .filter((group) => group.internalnotes?.trim())
      .map((group) => `${group.bookingNumber ? `#${group.bookingNumber} · ` : ''}${group.client}: ${group.internalnotes}`)
      .join('\n\n');
    const internalNotes = isMultiBooking
      ? multiBookingNotes || null
      : (packing?.notes || (packing?.booking as any)?.internalnotes || null);

    setPrintRows(rows);
    setPrintMeta({
      packingName,
      bookingNumber,
      client: clientName,
      rigDate,
      internalNotes,
      parcelCount: new Set(Object.values(itemParcelMap)).size,
    });
    setShowPrintDialog(true);
  };

  // WMS-boundaryn tillåter planering och pågående packning; touched-rader
  // blockeras alltid server-side och kontrolleras även före anropet.
  const canEdit = packing?.status === 'planning' || packing?.status === 'in_progress';

  const isRowTouched = (row: PackingItem) =>
    (row.quantity_packed || 0) > 0 || !!row.parcel_id || !!row.packed_at || !!row.verified_at;

  const requestEdit = (item: PackingItem, mode: 'set_packable' | 'set_non_packable') => {
    const name = cleanProductName(item.manual_name || item.booking_products?.name || 'Okänd produkt');
    setPendingEdit({ item, mode, name });
  };


  const confirmEdit = async () => {
    if (!pendingEdit) return;
    setIsSavingEdit(true);
    try {
      const res = await setWarehousePackingListItemPackability(
        packingId,
        pendingEdit.item.id,
        pendingEdit.mode,
        pendingEdit.item.packability_revision,
      );
      toast.success(
        pendingEdit.mode === 'set_non_packable'
          ? `Markerad som ej packningsbar (${res.affected_count} rad${res.affected_count === 1 ? '' : 'er'}). WMS har verifierat ändringen.`
          : `Markerad som packningsbar (${res.affected_count} rad${res.affected_count === 1 ? '' : 'er'}). WMS har verifierat ändringen.`,
      );
      setPendingEdit(null);
      await loadData(true);
      await onRefreshIntegrity?.();
    } catch (err: any) {
      toast.error(err?.message || 'Kunde inte uppdatera packlistan.');
    } finally {
      setIsSavingEdit(false);
    }
  };
  const renderItem = (item: PackingItem) => {
    const rawName = item.manual_name || item.booking_products?.name || 'Okänd produkt';
    const trimmedName = rawName.trimStart();
    const productId = item.booking_products?.id;

    const isChildByRelation = !!(
      item.booking_products?.parent_product_id ||
      item.booking_products?.parent_package_id ||
      item.booking_products?.is_package_component
    );
    const relationship = readPackingRelationship(item);
    const wmsPackageName = relationship.packageName;
    const isChildByPrefix =
      trimmedName.startsWith('↳') ||
      trimmedName.startsWith('└') ||
      trimmedName.startsWith('L,') ||
      trimmedName.startsWith('⦿');
    const isChild = isChildByRelation || isChildByPrefix || relationship.kind !== 'standalone';
    const hasChildren = productId ? (childrenByParent[productId]?.length || 0) > 0 : false;
    const isParent = !isChild && hasChildren;

    let packed = item.quantity_packed || 0;
    let total = item.quantity_to_pack;

    if (isParent && productId) {
      const children = (childrenByParent[productId] || []).filter((child) => child.is_packable !== false);
      const allChildrenPacked =
        children.length > 0 && children.every((c) => (c.quantity_packed || 0) >= c.quantity_to_pack);
      total = 1;
      packed = allChildrenPacked ? 1 : 0;
    }

    const cleanName = cleanProductName(rawName);
    const displayName = isChild ? formatToTitleCase(cleanName) : cleanName.toUpperCase();
    const presentation = getOperationsPackingPresentation(item);
    const isComplete = presentation.isPackable && packed >= total && total > 0;
    const isPartial = presentation.isPackable && packed > 0 && packed < total;
    const parcelNumber = itemParcelMap[item.id];
    const isManual = !item.booking_product_id && !!item.manual_name;
    const isExcluded = !presentation.isPackable;
    const touched = isRowTouched(item);

    const row = (
      <div
        key={item.id}
        className={`w-full flex items-center gap-3 transition-all ${presentation.rowClassName} ${
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
          {!presentation.isPackable ? (
            <PackageX className="text-muted-foreground w-3.5 h-3.5" />
          ) : (
            <>
              {isComplete && <Check className="text-white w-3.5 h-3.5" />}
              {isPartial && <span className="text-white text-[11px] font-bold">{packed}</span>}
            </>
          )}
        </div>

          <div className="flex-1 min-w-0">
            <span
              className={`block truncate ${presentation.nameClassName} ${
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
          {(item.wms_sku || item.booking_products?.sku) && (
            <span className="text-[11px] text-muted-foreground font-mono">
              [{item.wms_sku || item.booking_products?.sku}]
            </span>
          )}
          {isParent && (
            <span className="text-[11px] text-muted-foreground block">
              Auto vid alla delar packade
            </span>
          )}
          {!presentation.isPackable && (
            <span className="text-[11px] text-muted-foreground block">Ej packningsbar</span>
          )}
        </div>

        {parcelNumber && (
          <div className="shrink-0 flex items-center gap-0.5 text-primary">
            <Package className="h-3.5 w-3.5" />
            <span className="text-xs font-bold">#{parcelNumber}</span>
          </div>
        )}

        {presentation.isPackable && (
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
        )}
      </div>
    );

    if (!canEdit) return row;

    return (
      <ContextMenu key={item.id}>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent className="w-64">
          <ContextMenuLabel className="truncate font-normal text-muted-foreground">
            {cleanName}
          </ContextMenuLabel>
          <ContextMenuItem
            disabled={!isExcluded && touched}
            className="cursor-pointer"
            onSelect={() => requestEdit(item, isExcluded ? 'set_packable' : 'set_non_packable')}
          >
            {isExcluded ? (
              <Undo2 className="h-4 w-4 mr-2" />
            ) : (
              <Package className="h-4 w-4 mr-2" />
            )}
            {isExcluded ? 'Markera som packningsbar' : 'Markera som ej packningsbar'}
          </ContextMenuItem>
          {!isExcluded && touched && (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              Redan packad, kontrollerad eller lagd i kolli.
            </p>
          )}
        </ContextMenuContent>
      </ContextMenu>
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
            title={printTitle}
            onClick={preparePrint}
          >
            <Printer className="h-4 w-4 mr-2" />
            Skriv ut
          </Button>
          {printPreliminaryReason && (
            <span
              className="inline-flex items-center gap-1 text-xs text-amber-600"
              title={`Utskriften märks som preliminär: ${printPreliminaryReason}`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Preliminär
            </span>
          )}
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

      <PackingIntegrityBanner
        integrity={integrity}
        error={integrityError}
        packingId={packingId}
        packingStatus={packing?.status}
        onRefresh={async () => {
          await onRefreshIntegrity?.();
          await loadData(true);
        }}
      />

      {packing?.notes && (
        <Card className="border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="py-3 px-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
              Intern information
            </p>
            <p className="mt-1 text-sm whitespace-pre-wrap">{packing.notes}</p>
          </CardContent>
        </Card>
      )}


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

      {canEdit && items.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Högerklicka på en rad för att markera den som packningsbar eller ej packningsbar.
        </p>
      )}

      {/* No items */}
      {items.length === 0 && (
        <Card className="border-amber-500/50 bg-amber-50">
          <CardContent className="py-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-amber-800 text-sm">Packlistan är inte genererad</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Bokningens orderrader har inte skrivits in i packlistan. Generera dem här.
                </p>
                <Button
                  size="sm"
                  className="mt-3"
                  disabled={isRepairing}
                  onClick={handleRepair}
                >
                  {isRepairing ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Package className="mr-2 h-4 w-4" />
                  )}
                  Generera packlista
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}


      {/* Product list grouped by booking */}
      {items.length > 0 && (
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
                    <div className="flex items-center gap-2 flex-wrap">
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                      {group.bookingNumber && (
                        <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <Hash className="h-3 w-3" />
                          {group.bookingNumber}
                        </span>
                      )}
                      <span className="font-medium text-sm">{group.client}</span>
                      {group.eventdate && (
                        <span className="text-xs text-muted-foreground">
                          · {new Date(group.eventdate).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}
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
                      {buildPackingHierarchy<PackingItem>(groupProductItems).map((entry) => entry.kind === 'standalone' ? (
                        renderItem(entry.item)
                      ) : (
                        <div key={entry.group.key} className="divide-y divide-border/30">
                          <div className="px-4 py-3 bg-muted border-y border-border">
                            <span className="text-sm font-bold text-foreground uppercase">{entry.group.packageName}</span>
                          </div>
                          {entry.group.members.length > 0 && (
                            <div>
                              <div className="px-4 py-1.5 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase">
                                Paketmedlemmar
                              </div>
                              {entry.group.members.map(renderItem)}
                            </div>
                          )}
                          {entry.group.accessories.length > 0 && (
                            <div>
                              <div className="px-4 py-1.5 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase">
                                Tillbehör
                              </div>
                              {entry.group.accessories.map(renderItem)}
                            </div>
                          )}
                        </div>
                      ))}
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

      <AlertDialog
        open={!!pendingEdit}
        onOpenChange={(open) => {
          if (!open && !isSavingEdit) setPendingEdit(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingEdit?.mode === 'set_packable'
                ? 'Markera som packningsbar?'
                : 'Markera som ej packningsbar?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingEdit?.mode === 'set_packable' ? (
                <>
                  «{pendingEdit?.name}» aktiveras i packflödet.
                  {' '}
                  Bokningen är oförändrad.
                </>
              ) : (

                <>
                  «{pendingEdit?.name}» ligger kvar synlig men tas bort från det operativa packflödet.
                  {' '}
                  Ingenting raderas och bokningen med dess orderrader ändras inte — raden kan
                  återställas här.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSavingEdit}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSavingEdit}
              onClick={(e) => {
                e.preventDefault();
                void confirmEdit();
              }}
            >
              {pendingEdit?.mode === 'set_packable' ? 'Markera packningsbar' : 'Markera ej packningsbar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PrintPackingListDialog
        open={showPrintDialog}
        onOpenChange={setShowPrintDialog}
        meta={printMeta}
        rows={printRows}
      />

    </div>
  );
};

export default DesktopChecklistView;
