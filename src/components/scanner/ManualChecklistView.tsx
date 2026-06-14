import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { ArrowLeft, Check, RefreshCw, AlertCircle, Package, ChevronRight, X, Plus, Minus, PenLine } from 'lucide-react';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client'; // still used for staff lookup
import { 
  fetchPackingListItems, 
  togglePackingItemManually,
  decrementPackingItem,
  createParcel,
  assignItemToParcel,
  getItemParcels,
  fetchPackingForScanner,
  signPacking
} from '@/services/scannerService';
import { PackingPreflightPanel } from './PackingPreflightPanel';
import { PackingWithBooking, PackingParcel } from '@/types/packing';
import { useScannerRealtime } from '@/hooks/scanner/useScannerRealtime';
import { computePackingProgress } from '@/lib/packing/progress';

interface ManualChecklistViewProps {
  packingId: string;
  onBack: () => void;
  verifierName?: string;
}

interface PackingItem {
  id: string;
  quantity_to_pack: number;
  quantity_packed: number;
  verified_at: string | null;
  verified_by: string | null;
  parcel_id: string | null;
  booking_products: {
    id: string;
    name: string;
    quantity: number;
    sku: string | null;
    notes: string | null;
    parent_product_id: string | null;
    parent_package_id: string | null;
    is_package_component: boolean | null;
  } | null;
}

const cleanProductName = (name: string): string => {
  return name.replace(/^[↳└⦿\s,L\-–—]+/, '').trim();
};

const formatToTitleCase = (text: string): string => {
  const upperCount = (text.match(/[A-ZÅÄÖ]/g) || []).length;
  const lowerCount = (text.match(/[a-zåäö]/g) || []).length;
  if (lowerCount >= upperCount) return text;
  
  return text.split(' ').map(word => {
    if (word.length <= 3 && /^[A-ZÅÄÖ0-9]+$/.test(word)) return word;
    if (/\d/.test(word)) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
};

export const ManualChecklistView: React.FC<ManualChecklistViewProps> = ({ 
  packingId, 
  onBack,
  verifierName = 'Manual' 
}) => {
  const { user } = useAuth();
  const [packing, setPacking] = useState<PackingWithBooking | null>(null);
  const [items, setItems] = useState<PackingItem[]>([]);
  const [progress, setProgress] = useState({ total: 0, verified: 0, percentage: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const itemOrderRef = useRef<Record<string, number>>({});
  const [tappedItemId, setTappedItemId] = useState<string | null>(null);
  const [staffFirstName, setStaffFirstName] = useState<string>('');
  const [isSigned, setIsSigned] = useState(false);
  const [signedInfo, setSignedInfo] = useState<{ by: string; at: string } | null>(null);
  const [isSigning, setIsSigning] = useState(false);

  useEffect(() => {
    if (!user?.email) return;
    supabase.from('staff_members').select('name').eq('email', user.email).maybeSingle()
      .then(({ data }) => {
        if (data?.name) setStaffFirstName(data.name.split(' ')[0]);
      });
  }, [user?.email]);

  // Kolli mode state
  const [isKolliMode, setIsKolliMode] = useState(false);
  const [activeParcel, setActiveParcel] = useState<PackingParcel | null>(null);
  const [itemParcelMap, setItemParcelMap] = useState<Record<string, number>>({});
  const loadData = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) setIsLoading(true);
      // Fetch packing + items first (items auto-generates packing_list_items)
      const [packingData, itemsData] = await Promise.all([
        fetchPackingForScanner(packingId),
        fetchPackingListItems(packingId),
      ]);

      setPacking(packingData);
      if (packingData?.signed_by && packingData?.signed_at) {
        setIsSigned(true);
        setSignedInfo({ by: packingData.signed_by, at: packingData.signed_at });
      }

      // Now that items exist in DB, fetch parcels
      const parcelsData = await getItemParcels(packingId);

      const typedItems = itemsData as PackingItem[];
      let finalItems: PackingItem[];
      if (Object.keys(itemOrderRef.current).length === 0) {
        const order: Record<string, number> = {};
        typedItems.forEach((item, idx) => { order[item.id] = idx; });
        itemOrderRef.current = order;
        finalItems = typedItems;
      } else {
        const sorted = [...typedItems].sort(
          (a, b) => (itemOrderRef.current[a.id] ?? 9999) - (itemOrderRef.current[b.id] ?? 9999)
        );
        
        if (isBackground) {
          setItems(prev => {
            const prevMap = new Map(prev.map(i => [i.id, i]));
            const merged = sorted.map(serverItem => {
              const localItem = prevMap.get(serverItem.id);
              if (localItem && localItem.quantity_packed > serverItem.quantity_packed) {
                return { ...serverItem, quantity_packed: localItem.quantity_packed };
              }
              return serverItem;
            });
            recalcProgress(merged);
            return merged;
          });
          setItemParcelMap(parcelsData);
          return;
        }
        finalItems = sorted;
      }
      setItems(finalItems);
      recalcProgress(finalItems);
      setItemParcelMap(parcelsData);
    } catch (err) {
      console.error('Error loading packing data:', err);
      if (!isBackground) toast.error('Could not load packing list');
    } finally {
      if (!isBackground) setIsLoading(false);
    }
  }, [packingId]);

  // Realtime sync: refetch when packing data changes
  const realtimeTables = useMemo(() => ['packing_list_items', 'packing_projects'], []);
  useScannerRealtime({
    tables: realtimeTables,
    onChanged: useCallback(() => loadData(true), [loadData]),
    pollingInterval: 30000,
  });

  useEffect(() => { loadData(false); }, [loadData]);

  const startKolliMode = useCallback(async () => {
    try {
      const parcel = await createParcel(packingId, verifierName);
      setActiveParcel(parcel);
      setIsKolliMode(true);
      toast.success(`Parcel #${parcel.parcel_number} started`);
    } catch (err) {
      toast.error('Could not create parcel');
    }
  }, [packingId, verifierName]);

  const nextParcel = useCallback(async () => {
    try {
      const parcel = await createParcel(packingId, verifierName);
      setActiveParcel(parcel);
      toast.success(`Parcel #${parcel.parcel_number} started`);
      const parcelsData = await getItemParcels(packingId);
      setItemParcelMap(parcelsData);
    } catch (err) {
      toast.error('Could not create next parcel');
    }
  }, [packingId, verifierName]);

  const exitKolliMode = useCallback(async () => {
    setIsKolliMode(false);
    setActiveParcel(null);
    await loadData(false);
    toast.info('Parcel mode ended');
  }, [loadData]);

  // Recalculate progress locally from items array (excluding parent items that have children)
  const recalcProgress = useCallback((updatedItems: PackingItem[]) => {
    // Single source of truth — see src/lib/packing/progress.ts.
    // Server-side checkIfAllPacked uses the same rule via the Deno mirror.
    const { total, verified, percentage } = computePackingProgress(updatedItems);
    setProgress({ total, verified, percentage });
  }, []);

  // Handle increment
  const handleIncrement = useCallback(async (itemId: string, quantityToPack: number, isParent: boolean) => {
    if (isParent) return;
    setTappedItemId(itemId);
    setTimeout(() => setTappedItemId(null), 200);

    const result = await togglePackingItemManually(itemId, false, quantityToPack, verifierName);
    if (!result.success) {
      console.warn('[manual-checkoff] bundle_sync_failed', {
        itemId,
        bundleErrorCode: (result as any).bundleErrorCode,
        warning: result.warning,
        error: result.error,
      });
      toast.error(result.error || result.warning || 'WMS nekade manuell avbockning');
      return;
    }
    if (isKolliMode && activeParcel) {
      await assignItemToParcel(itemId, activeParcel.id);
      setItemParcelMap(prev => ({ ...prev, [itemId]: activeParcel.parcel_number }));
    }
    // Optimistic local update (only after WMS accepted)
    setItems(prev => {
      const updated = prev.map(i =>
        i.id === itemId
          ? { ...i, quantity_packed: Math.min((i.quantity_packed || 0) + 1, i.quantity_to_pack) }
          : i
      );
      recalcProgress(updated);
      return updated;
    });
    if (result.bundleSynced === false) {
      toast.warning(result.warning || 'Packad lokalt men inte synkad till WMS');
    }
  }, [verifierName, isKolliMode, activeParcel, recalcProgress]);

  // Handle decrement (subtract 1)
  const handleDecrement = useCallback(async (itemId: string, isParent: boolean) => {
    if (isParent) return;
    const result = await decrementPackingItem(itemId, verifierName);
    if (result.success) {
      // Optimistic local update
      setItems(prev => {
        const updated = prev.map(i =>
          i.id === itemId
            ? { ...i, quantity_packed: Math.max((i.quantity_packed || 0) - 1, 0) }
            : i
        );
        recalcProgress(updated);
        return updated;
      });
    } else {
      toast.error(result.error || 'Could not update');
    }
  }, [verifierName, recalcProgress]);

  // Build parent-children map
  const childrenByParent: Record<string, PackingItem[]> = {};
  items.forEach(item => {
    const parentId = item.booking_products?.parent_product_id;
    if (parentId) {
      if (!childrenByParent[parentId]) childrenByParent[parentId] = [];
      childrenByParent[parentId].push(item);
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold truncate">{packing?.name}</h1>
          {packing?.booking?.client && (
            <p className="text-xs text-muted-foreground truncate">{packing.booking.client}</p>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={() => loadData(false)} className="shrink-0 h-8 w-8">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* WMS preflight check (run before scanning) */}
      <PackingPreflightPanel
        packingId={packingId}
        bookingNumber={packing?.booking?.booking_number ?? null}
      />
      <div className="flex items-center gap-2 px-1">
        <div className="flex-1">
          <Progress value={progress.percentage} className="h-2.5" />
        </div>
        <span className="text-xs font-mono font-semibold text-muted-foreground whitespace-nowrap">
          {progress.verified}/{progress.total}
        </span>
        <span className="text-xs font-bold text-primary whitespace-nowrap">
          {progress.percentage}%
        </span>
        {!isKolliMode && (
          <Button onClick={startKolliMode} size="sm" variant="outline" className="h-8 px-2.5 gap-1">
            <Package className="h-3.5 w-3.5" />
            <span className="text-xs">Parcel</span>
          </Button>
        )}
      </div>

      {/* Kolli mode banner */}
      {isKolliMode && activeParcel && (
        <div className="bg-primary text-primary-foreground rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              <span className="font-semibold text-sm">PARCEL #{activeParcel.parcel_number}</span>
            </div>
            <div className="flex gap-2">
              <Button onClick={nextParcel} size="sm" variant="secondary" className="h-7 text-xs gap-1">
                 <ChevronRight className="h-3 w-3" />
                 Next
              </Button>
              <Button onClick={exitKolliMode} size="sm" variant="secondary" className="h-7 text-xs gap-1">
                 <X className="h-3 w-3" />
                 End
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Hint */}
      <p className="text-[10px] text-muted-foreground px-1">
        Use + and − to count up/down each component
      </p>

      {/* No items */}
      {items.length === 0 && (
        <Card className="border-amber-500/50 bg-amber-50">
          <CardContent className="py-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800 text-sm">Inga produkter</p>
                <p className="text-xs text-amber-700 mt-0.5">Packlistan har inte genererats än.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Product list — large touch targets */}
      {items.length > 0 && (
        <div className="border rounded-lg overflow-hidden bg-card">
          <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/40">
             <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Product</span>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Packed</span>
          </div>
          
          <div className="divide-y divide-border/30 max-h-[calc(100vh-280px)] overflow-y-auto">
            {items.map(item => {
              const rawName = item.booking_products?.name || 'Unknown product';
              const trimmedName = rawName.trimStart();
              const productId = item.booking_products?.id;
              
              const isChildByRelation = !!(
                item.booking_products?.parent_product_id || 
                item.booking_products?.parent_package_id || 
                item.booking_products?.is_package_component
              );
              const isChildByPrefix = (
                trimmedName.startsWith('↳') || 
                trimmedName.startsWith('└') || 
                trimmedName.startsWith('L,') ||
                trimmedName.startsWith('⦿')
              );
              const isChild = isChildByRelation || isChildByPrefix;
              
              const hasChildren = productId ? (childrenByParent[productId]?.length || 0) > 0 : false;
              const isParent = !isChild && hasChildren;
              
              let packed = item.quantity_packed || 0;
              let total = item.quantity_to_pack;
              
              if (isParent && productId) {
                const children = childrenByParent[productId] || [];
                const childrenPacked = children.filter(c => (c.quantity_packed || 0) >= c.quantity_to_pack).length;
                const allChildrenPacked = children.length > 0 && childrenPacked === children.length;
                total = 1;
                packed = allChildrenPacked ? 1 : 0;
              }
              
              const cleanName = cleanProductName(rawName);
              const displayName = isChild ? formatToTitleCase(cleanName) : cleanName.toUpperCase();
              
              const isComplete = packed >= total && total > 0;
              const isPartial = packed > 0 && packed < total;
              const isTapped = tappedItemId === item.id;
              
              const parcelNumber = itemParcelMap[item.id];
              
              return (
                <div 
                  key={item.id}
                  className={`w-full flex items-center gap-2 transition-all select-none ${
                    isComplete 
                      ? 'bg-primary/5' 
                      : isPartial 
                        ? 'bg-amber-50/50' 
                        : ''
                  } ${
                    isParent ? 'bg-muted border-b border-t border-border' : ''
                  } ${
                    isTapped ? 'bg-primary/10' : ''
                  } ${isChild ? 'pl-3 pr-2 py-2' : 'px-3 py-2.5'}`}
                >
                  {/* Status circle */}
                  <div className={`shrink-0 rounded-full flex items-center justify-center ${
                    isChild ? 'w-5 h-5' : 'w-6 h-6'
                  } ${
                    isComplete 
                      ? 'bg-primary' 
                      : isPartial 
                        ? 'bg-amber-500' 
                        : isParent
                          ? 'border-2 border-dashed border-muted-foreground/30'
                          : 'border-2 border-muted-foreground/40'
                  }`}>
                    {isComplete && <Check className="text-white w-3 h-3" />}
                    {isPartial && <span className="text-white text-[10px] font-bold">{packed}</span>}
                  </div>
                  {/* Product name */}
                  <div className="flex-1 min-w-0">
                    <span className={`block truncate ${
                      isChild 
                        ? 'text-xs font-normal' 
                        : 'text-xs font-semibold tracking-wide'
                    } ${
                      isComplete 
                        ? 'text-primary' 
                        : isPartial 
                          ? 'text-amber-800'
                          : isChild 
                            ? 'text-muted-foreground' 
                            : 'text-foreground'
                    }`}>
                      {displayName}
                    </span>
                    {isParent && (
                      <span className="text-[9px] text-muted-foreground">
                        Auto when all parts packed
                      </span>
                    )}
                  </div>

                  {/* Parcel badge */}
                  {parcelNumber && (
                    <div className="shrink-0 flex items-center gap-0.5 text-primary">
                      <Package className="h-3 w-3" />
                      <span className="text-[10px] font-bold">#{parcelNumber}</span>
                    </div>
                  )}
                  
                  {/* +/- controls and quantity */}
                  {!isParent ? (
                    <div className="shrink-0 flex items-center gap-1">
                      <button
                        onClick={() => handleDecrement(item.id, false)}
                        disabled={packed === 0}
                        className={`w-9 h-9 rounded-md flex items-center justify-center border transition-colors ${
                          packed === 0 
                            ? 'border-muted text-muted-foreground/30 cursor-not-allowed' 
                            : 'border-border text-foreground active:bg-muted hover:bg-muted/60'
                        }`}
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <div className={`min-w-[44px] flex items-center justify-center rounded-md px-1.5 py-1 ${
                        isComplete 
                          ? 'bg-primary/10 text-primary' 
                          : isPartial 
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-muted/60 text-muted-foreground'
                      }`}>
                        <span className="font-mono font-bold text-xs">
                          {packed}/{total}
                        </span>
                      </div>
                      <button
                        onClick={() => handleIncrement(item.id, item.quantity_to_pack, false)}
                        disabled={isComplete}
                        className={`w-9 h-9 rounded-md flex items-center justify-center border transition-colors ${
                          isComplete 
                            ? 'border-muted text-muted-foreground/30 cursor-not-allowed' 
                            : 'border-primary bg-primary/10 text-primary active:bg-primary/20 hover:bg-primary/15'
                        }`}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className={`shrink-0 min-w-[44px] flex items-center justify-center rounded-md px-1.5 py-1 ${
                      isComplete 
                        ? 'bg-primary/10 text-primary' 
                        : 'bg-muted/60 text-muted-foreground'
                    }`}>
                      <span className="font-mono font-bold text-xs">
                        {packed}/{total}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Signed indicator or Sign button */}
      {isSigned && signedInfo ? (
        <div className="sticky bottom-0 pt-4 pb-2 -mx-1 px-1 bg-gradient-to-t from-background via-background to-transparent">
          <div className="w-full h-12 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center gap-2 text-primary font-semibold">
            <Check className="h-5 w-5" />
            <span className="text-sm">
              Signed by {signedInfo.by}, {new Date(signedInfo.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} {new Date(signedInfo.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      ) : progress.percentage === 100 && (
        <div className="sticky bottom-0 pt-4 pb-2 -mx-1 px-1 bg-gradient-to-t from-background via-background to-transparent">
          <ConfirmationDialog
            title="Sign packing list"
            description={`Have you${staffFirstName ? ` ${staffFirstName}` : ''} verified that everything on the list is packed?`}
            confirmLabel="Yes"
            cancelLabel="No"
            onConfirm={async () => {
              setIsSigning(true);
              const signerName = staffFirstName || 'Unknown';
              const now = new Date().toISOString();
              try {
                await signPacking(packingId, signerName);
                setIsSigning(false);
                setIsSigned(true);
                setSignedInfo({ by: signerName, at: now });
                toast.success('Signing complete!');
              } catch (err) {
                setIsSigning(false);
                console.error('Signing error:', err);
                toast.error('Could not sign the packing list');
              }
            }}
          >
            <Button
              className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 text-white gap-2"
              disabled={isSigning}
            >
              <PenLine className="h-5 w-5" />
              {isSigning ? 'Signing...' : 'Sign'}
            </Button>
          </ConfirmationDialog>
        </div>
      )}
    </div>
  );
};
