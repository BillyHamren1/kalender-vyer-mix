import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { ArrowLeft, Check, RefreshCw, AlertCircle, Package, ChevronRight, X, Plus, Minus } from 'lucide-react';
import { 
  fetchPackingListItems, 
  getVerificationProgress, 
  togglePackingItemManually,
  decrementPackingItem,
  createParcel,
  assignItemToParcel,
  getItemParcels
} from '@/services/scannerService';
import { fetchPacking } from '@/services/packingService';
import { PackingWithBooking, PackingParcel } from '@/types/packing';

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
  const [packing, setPacking] = useState<PackingWithBooking | null>(null);
  const [items, setItems] = useState<PackingItem[]>([]);
  const [progress, setProgress] = useState({ total: 0, verified: 0, percentage: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [itemOrder, setItemOrder] = useState<Record<string, number>>({});
  const [tappedItemId, setTappedItemId] = useState<string | null>(null);

  // Kolli mode state
  const [isKolliMode, setIsKolliMode] = useState(false);
  const [activeParcel, setActiveParcel] = useState<PackingParcel | null>(null);
  const [itemParcelMap, setItemParcelMap] = useState<Record<string, number>>({});

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [packingData, itemsData, progressData, parcelsData] = await Promise.all([
        fetchPacking(packingId),
        fetchPackingListItems(packingId),
        getVerificationProgress(packingId),
        getItemParcels(packingId)
      ]);

      setPacking(packingData);
      const typedItems = itemsData as PackingItem[];
      if (Object.keys(itemOrder).length === 0) {
        const order: Record<string, number> = {};
        typedItems.forEach((item, idx) => { order[item.id] = idx; });
        setItemOrder(order);
        setItems(typedItems);
      } else {
        const stableSorted = [...typedItems].sort(
          (a, b) => (itemOrder[a.id] ?? 9999) - (itemOrder[b.id] ?? 9999)
        );
        setItems(stableSorted);
      }
      setProgress(progressData);
      setItemParcelMap(parcelsData);
    } catch (err) {
      console.error('Error loading packing data:', err);
      toast.error('Kunde inte ladda packlista');
    } finally {
      setIsLoading(false);
    }
  }, [packingId]);

  useEffect(() => { loadData(); }, [loadData]);

  const startKolliMode = useCallback(async () => {
    try {
      const parcel = await createParcel(packingId, verifierName);
      setActiveParcel(parcel);
      setIsKolliMode(true);
      toast.success(`Kolli #${parcel.parcel_number} startat`);
    } catch (err) {
      toast.error('Kunde inte skapa kolli');
    }
  }, [packingId, verifierName]);

  const nextParcel = useCallback(async () => {
    try {
      const parcel = await createParcel(packingId, verifierName);
      setActiveParcel(parcel);
      toast.success(`Kolli #${parcel.parcel_number} startat`);
      const parcelsData = await getItemParcels(packingId);
      setItemParcelMap(parcelsData);
    } catch (err) {
      toast.error('Kunde inte skapa nästa kolli');
    }
  }, [packingId, verifierName]);

  const exitKolliMode = useCallback(async () => {
    setIsKolliMode(false);
    setActiveParcel(null);
    await loadData();
    toast.info('Kolli-läge avslutat');
  }, [loadData]);

  // Recalculate progress locally from items array
  const recalcProgress = useCallback((updatedItems: PackingItem[]) => {
    const total = updatedItems.reduce((sum, i) => sum + i.quantity_to_pack, 0);
    const verified = updatedItems.reduce((sum, i) => sum + Math.min(i.quantity_packed || 0, i.quantity_to_pack), 0);
    const percentage = total > 0 ? Math.round((verified / total) * 100) : 0;
    setProgress({ total, verified, percentage });
  }, []);

  // Handle increment
  const handleIncrement = useCallback(async (itemId: string, quantityToPack: number, isParent: boolean) => {
    if (isParent) return;
    setTappedItemId(itemId);
    setTimeout(() => setTappedItemId(null), 200);

    const result = await togglePackingItemManually(itemId, false, quantityToPack, verifierName);
    if (result.success) {
      if (isKolliMode && activeParcel) {
        await assignItemToParcel(itemId, activeParcel.id);
        setItemParcelMap(prev => ({ ...prev, [itemId]: activeParcel.parcel_number }));
      }
      // Optimistic local update
      setItems(prev => {
        const updated = prev.map(i =>
          i.id === itemId
            ? { ...i, quantity_packed: Math.min((i.quantity_packed || 0) + 1, i.quantity_to_pack) }
            : i
        );
        recalcProgress(updated);
        return updated;
      });
    } else {
      toast.error(result.error || 'Kunde inte uppdatera');
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
      toast.error(result.error || 'Kunde inte uppdatera');
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
        <Button variant="ghost" size="icon" onClick={loadData} className="shrink-0 h-8 w-8">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Progress + Kolli button */}
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
            <span className="text-xs">Kolli</span>
          </Button>
        )}
      </div>

      {/* Kolli mode banner */}
      {isKolliMode && activeParcel && (
        <div className="bg-primary text-primary-foreground rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              <span className="font-semibold text-sm">KOLLI #{activeParcel.parcel_number}</span>
            </div>
            <div className="flex gap-2">
              <Button onClick={nextParcel} size="sm" variant="secondary" className="h-7 text-xs gap-1">
                <ChevronRight className="h-3 w-3" />
                Nästa
              </Button>
              <Button onClick={exitKolliMode} size="sm" variant="secondary" className="h-7 text-xs gap-1">
                <X className="h-3 w-3" />
                Avsluta
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Hint */}
      <p className="text-[10px] text-muted-foreground px-1">
        Använd + och − för att räkna upp/ner varje komponent
      </p>

      {/* No items */}
      {items.length === 0 && (
        <Card className="border-amber-500/50 bg-amber-50">
          <CardContent className="py-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800 text-sm">Inga produkter</p>
                <p className="text-xs text-amber-700 mt-0.5">Packlistan har inte genererats ännu.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Product list — large touch targets */}
      {items.length > 0 && (
        <div className="border rounded-lg overflow-hidden bg-card">
          <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/40">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Produkt</span>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Packat</span>
          </div>
          
          <div className="divide-y divide-border/30 max-h-[calc(100vh-280px)] overflow-y-auto">
            {items.map(item => {
              const rawName = item.booking_products?.name || 'Okänd produkt';
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
                      ? 'bg-green-50/70' 
                      : isPartial 
                        ? 'bg-amber-50/50' 
                        : ''
                  } ${
                    isTapped ? 'bg-primary/10' : ''
                  } ${isChild ? 'pl-3 pr-2 py-2' : 'px-3 py-2.5'}`}
                >
                  {/* Status circle */}
                  <div className={`shrink-0 rounded-full flex items-center justify-center ${
                    isChild ? 'w-5 h-5' : 'w-6 h-6'
                  } ${
                    isComplete 
                      ? 'bg-green-500' 
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
                        ? 'text-green-700' 
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
                        Auto vid alla delar packade
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
                          ? 'bg-green-100 text-green-700' 
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
                        ? 'bg-green-100 text-green-700' 
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
    </div>
  );
};
