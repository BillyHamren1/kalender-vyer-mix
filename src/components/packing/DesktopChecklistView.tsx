import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Check, RefreshCw, AlertCircle, Package, ChevronRight, X, Plus, Minus, PenLine, QrCode } from 'lucide-react';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { 
  fetchPackingListItemsForDesktop as fetchPackingListItems, 
  togglePackingItemDesktop as togglePackingItemManually,
  decrementPackingItemDesktop as decrementPackingItem,
  createParcelDesktop as createParcel,
  assignItemToParcelDesktop as assignItemToParcel,
  getItemParcelsDesktop as getItemParcels,
  fetchPackingForDesktop as fetchPackingForScanner,
  signPackingDesktop as signPacking
} from '@/services/desktopPackingService';
import { PackingWithBooking, PackingParcel } from '@/types/packing';
import PackingQRCode from './PackingQRCode';

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

const DesktopChecklistView: React.FC<DesktopChecklistViewProps> = ({ packingId, packingName }) => {
  const { user } = useAuth();
  const [packing, setPacking] = useState<PackingWithBooking | null>(null);
  const [items, setItems] = useState<PackingItem[]>([]);
  const [progress, setProgress] = useState({ total: 0, verified: 0, percentage: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const itemOrderRef = useRef<Record<string, number>>({});
  const [staffFirstName, setStaffFirstName] = useState<string>('');
  const [isSigned, setIsSigned] = useState(false);
  const [signedInfo, setSignedInfo] = useState<{ by: string; at: string } | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const verifierName = 'Desktop';

  // Kolli state
  const [isKolliMode, setIsKolliMode] = useState(false);
  const [activeParcel, setActiveParcel] = useState<PackingParcel | null>(null);
  const [itemParcelMap, setItemParcelMap] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!user?.email) return;
    supabase.from('staff_members').select('name').eq('email', user.email).maybeSingle()
      .then(({ data }) => {
        if (data?.name) setStaffFirstName(data.name.split(' ')[0]);
      });
  }, [user?.email]);

  const recalcProgress = useCallback((updatedItems: PackingItem[]) => {
    const parentProductIds = new Set<string>();
    updatedItems.forEach(item => {
      const pid = item.booking_products?.parent_product_id;
      if (pid) parentProductIds.add(pid);
    });
    const countable = updatedItems.filter(item => {
      const productId = item.booking_products?.id;
      return !productId || !parentProductIds.has(productId);
    });
    const total = countable.reduce((sum, i) => sum + i.quantity_to_pack, 0);
    const verified = countable.reduce((sum, i) => sum + Math.min(i.quantity_packed || 0, i.quantity_to_pack), 0);
    const percentage = total > 0 ? Math.round((verified / total) * 100) : 0;
    setProgress({ total, verified, percentage });
  }, []);

  const loadData = useCallback(async (isBackground = false) => {
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
      if (!isBackground) toast.error('Kunde inte ladda packlista');
    } finally {
      if (!isBackground) setIsLoading(false);
    }
  }, [packingId, recalcProgress]);

  useEffect(() => { loadData(false); }, [loadData]);

  const startKolliMode = useCallback(async () => {
    try {
      const parcel = await createParcel(packingId, verifierName);
      setActiveParcel(parcel);
      setIsKolliMode(true);
      toast.success(`Kolli #${parcel.parcel_number} startat`);
    } catch { toast.error('Kunde inte skapa kolli'); }
  }, [packingId]);

  const nextParcel = useCallback(async () => {
    try {
      const parcel = await createParcel(packingId, verifierName);
      setActiveParcel(parcel);
      toast.success(`Kolli #${parcel.parcel_number} startat`);
      const parcelsData = await getItemParcels(packingId);
      setItemParcelMap(parcelsData);
    } catch { toast.error('Kunde inte skapa nästa kolli'); }
  }, [packingId]);

  const exitKolliMode = useCallback(async () => {
    setIsKolliMode(false);
    setActiveParcel(null);
    await loadData(false);
    toast.info('Kolli-läge avslutat');
  }, [loadData]);

  const handleIncrement = useCallback(async (itemId: string, quantityToPack: number, isParent: boolean) => {
    if (isParent) return;
    const result = await togglePackingItemManually(itemId, false, quantityToPack, verifierName);
    if (result.success) {
      if (isKolliMode && activeParcel) {
        await assignItemToParcel(itemId, activeParcel.id);
        setItemParcelMap(prev => ({ ...prev, [itemId]: activeParcel.parcel_number }));
      }
      setItems(prev => {
        const updated = prev.map(i =>
          i.id === itemId ? { ...i, quantity_packed: Math.min((i.quantity_packed || 0) + 1, i.quantity_to_pack) } : i
        );
        recalcProgress(updated);
        return updated;
      });
    } else {
      toast.error(result.error || 'Kunde inte uppdatera');
    }
  }, [isKolliMode, activeParcel, recalcProgress]);

  const handleDecrement = useCallback(async (itemId: string, isParent: boolean) => {
    if (isParent) return;
    const result = await decrementPackingItem(itemId);
    if (result.success) {
      setItems(prev => {
        const updated = prev.map(i =>
          i.id === itemId ? { ...i, quantity_packed: Math.max((i.quantity_packed || 0) - 1, 0) } : i
        );
        recalcProgress(updated);
        return updated;
      });
    } else {
      toast.error(result.error || 'Kunde inte uppdatera');
    }
  }, [recalcProgress]);

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
          Bocka av
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowQR(!showQR)}>
            <QrCode className="h-4 w-4 mr-2" />
            {showQR ? 'Dölj QR' : 'Visa QR'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => loadData(false)}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Uppdatera
          </Button>
          {!isKolliMode && (
            <Button onClick={startKolliMode} size="sm" variant="outline">
              <Package className="h-4 w-4 mr-2" />
              Kolli
            </Button>
          )}
        </div>
      </div>

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
        <span className="text-sm font-bold text-primary">
          {progress.percentage}%
        </span>
      </div>

      {/* Kolli banner */}
      {isKolliMode && activeParcel && (
        <div className="bg-primary text-primary-foreground rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            <span className="font-semibold text-sm">KOLLI #{activeParcel.parcel_number}</span>
          </div>
          <div className="flex gap-2">
            <Button onClick={nextParcel} size="sm" variant="secondary" className="h-7 text-xs gap-1">
              <ChevronRight className="h-3 w-3" /> Nästa
            </Button>
            <Button onClick={exitKolliMode} size="sm" variant="secondary" className="h-7 text-xs gap-1">
              <X className="h-3 w-3" /> Avsluta
            </Button>
          </div>
        </div>
      )}

      {/* No items */}
      {items.length === 0 && (
        <Card className="border-amber-500/50 bg-amber-50">
          <CardContent className="py-4">
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

      {/* Product list */}
      {items.length > 0 && (
        <div className="border rounded-lg overflow-hidden bg-card">
          <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/40">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Produkt</span>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Packat</span>
          </div>
          
          <div className="divide-y divide-border/30 max-h-[60vh] overflow-y-auto">
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
                trimmedName.startsWith('↳') || trimmedName.startsWith('└') || 
                trimmedName.startsWith('L,') || trimmedName.startsWith('⦿')
              );
              const isChild = isChildByRelation || isChildByPrefix;
              const hasChildren = productId ? (childrenByParent[productId]?.length || 0) > 0 : false;
              const isParent = !isChild && hasChildren;
              
              let packed = item.quantity_packed || 0;
              let total = item.quantity_to_pack;
              
              if (isParent && productId) {
                const children = childrenByParent[productId] || [];
                const allChildrenPacked = children.length > 0 && children.every(c => (c.quantity_packed || 0) >= c.quantity_to_pack);
                total = 1;
                packed = allChildrenPacked ? 1 : 0;
              }
              
              const cleanName = cleanProductName(rawName);
              const displayName = isChild ? formatToTitleCase(cleanName) : cleanName.toUpperCase();
              const isComplete = packed >= total && total > 0;
              const isPartial = packed > 0 && packed < total;
              const parcelNumber = itemParcelMap[item.id];
              
              return (
                <div 
                  key={item.id}
                  className={`w-full flex items-center gap-3 transition-all ${
                    isComplete ? 'bg-primary/5' : isPartial ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''
                  } ${isParent ? 'bg-muted border-b border-t border-border' : ''} ${
                    isChild ? 'pl-6 pr-4 py-2.5' : 'px-4 py-3'
                  }`}
                >
                  {/* Status circle */}
                  <div className={`shrink-0 rounded-full flex items-center justify-center ${
                    isChild ? 'w-6 h-6' : 'w-7 h-7'
                  } ${
                    isComplete ? 'bg-primary' : isPartial ? 'bg-amber-500' 
                      : isParent ? 'border-2 border-dashed border-muted-foreground/30' : 'border-2 border-muted-foreground/40'
                  }`}>
                    {isComplete && <Check className="text-white w-3.5 h-3.5" />}
                    {isPartial && <span className="text-white text-[11px] font-bold">{packed}</span>}
                  </div>

                  {/* Product name */}
                  <div className="flex-1 min-w-0">
                    <span className={`block truncate ${
                      isChild ? 'text-sm font-normal' : 'text-sm font-semibold tracking-wide'
                    } ${
                      isComplete ? 'text-primary line-through' : isPartial ? 'text-amber-800 dark:text-amber-400'
                        : isChild ? 'text-muted-foreground' : 'text-foreground'
                    }`}>
                      {displayName}
                    </span>
                    {item.booking_products?.sku && (
                      <span className="text-[11px] text-muted-foreground font-mono">[{item.booking_products.sku}]</span>
                    )}
                    {isParent && (
                      <span className="text-[11px] text-muted-foreground block">Auto vid alla delar packade</span>
                    )}
                  </div>

                  {/* Parcel badge */}
                  {parcelNumber && (
                    <div className="shrink-0 flex items-center gap-0.5 text-primary">
                      <Package className="h-3.5 w-3.5" />
                      <span className="text-xs font-bold">#{parcelNumber}</span>
                    </div>
                  )}
                  
                  {/* +/- controls */}
                  {!isParent ? (
                    <div className="shrink-0 flex items-center gap-1.5">
                      <button
                        onClick={() => handleDecrement(item.id, false)}
                        disabled={packed === 0}
                        className={`w-8 h-8 rounded-md flex items-center justify-center border transition-colors ${
                          packed === 0 
                            ? 'border-muted text-muted-foreground/30 cursor-not-allowed' 
                            : 'border-border text-foreground hover:bg-muted/60 active:bg-muted'
                        }`}
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <div className={`min-w-[52px] flex items-center justify-center rounded-md px-2 py-1 ${
                        isComplete ? 'bg-primary/10 text-primary' 
                          : isPartial ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                            : 'bg-muted/60 text-muted-foreground'
                      }`}>
                        <span className="font-mono font-bold text-sm">{packed}/{total}</span>
                      </div>
                      <button
                        onClick={() => handleIncrement(item.id, item.quantity_to_pack, false)}
                        disabled={isComplete}
                        className={`w-8 h-8 rounded-md flex items-center justify-center border transition-colors ${
                          isComplete 
                            ? 'border-muted text-muted-foreground/30 cursor-not-allowed' 
                            : 'border-primary bg-primary/10 text-primary hover:bg-primary/15 active:bg-primary/20'
                        }`}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className={`shrink-0 min-w-[52px] flex items-center justify-center rounded-md px-2 py-1 ${
                      isComplete ? 'bg-primary/10 text-primary' : 'bg-muted/60 text-muted-foreground'
                    }`}>
                      <span className="font-mono font-bold text-sm">{packed}/{total}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sign section */}
      {isSigned && signedInfo ? (
        <div className="w-full h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center gap-2 text-primary font-semibold">
          <Check className="h-5 w-5" />
          <span className="text-sm">
            Signerad av {signedInfo.by}, {new Date(signedInfo.at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} {new Date(signedInfo.at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      ) : progress.percentage === 100 && (
        <ConfirmationDialog
          title="Signera packlista"
          description={`Har du${staffFirstName ? ` ${staffFirstName}` : ''} säkerställt att allt i listan är packat?`}
          confirmLabel="Ja"
          cancelLabel="Nej"
          onConfirm={async () => {
            setIsSigning(true);
            const signerName = staffFirstName || 'Okänd';
            const now = new Date().toISOString();
            try {
              await signPacking(packingId, signerName);
              setIsSigning(false);
              setIsSigned(true);
              setSignedInfo({ by: signerName, at: now });
              toast.success('Signering klar!');
            } catch (err) {
              setIsSigning(false);
              console.error('Signing error:', err);
              toast.error('Kunde inte signera packlistan');
            }
          }}
        >
          <Button className="w-full h-12 text-base font-semibold bg-primary hover:bg-primary/90 text-primary-foreground gap-2" disabled={isSigning}>
            <PenLine className="h-5 w-5" />
            {isSigning ? 'Signerar...' : 'Signera'}
          </Button>
        </ConfirmationDialog>
      )}
    </div>
  );
};

export default DesktopChecklistView;
