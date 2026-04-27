import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Check, RefreshCw, AlertCircle, Package, ChevronRight, ChevronDown, X, Plus, Minus, PenLine, QrCode, EyeOff, Eye, Hash } from 'lucide-react';
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
import { computePackingProgress } from '@/lib/packing/progress';

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
  const [isSyncing, setIsSyncing] = useState(false);
  const itemOrderRef = useRef<Record<string, number>>({});
  const [staffFirstName, setStaffFirstName] = useState<string>('');
  const [isSigned, setIsSigned] = useState(false);
  const [signedInfo, setSignedInfo] = useState<{ by: string; at: string } | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualQty, setManualQty] = useState('1');
  const [bookingGroups, setBookingGroups] = useState<BookingGroupInfo[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
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
    const activeItems = updatedItems.filter(i => !i.excluded);
    const parentProductIds = new Set<string>();
    activeItems.forEach(item => {
      const pid = item.booking_products?.parent_product_id;
      if (pid) parentProductIds.add(pid);
    });
    const countable = activeItems.filter(item => {
      const productId = item.booking_products?.id;
      return !productId || !parentProductIds.has(productId);
    });
    const total = countable.reduce((sum, i) => sum + i.quantity_to_pack, 0);
    const verified = countable.reduce((sum, i) => sum + Math.min(i.quantity_packed || 0, i.quantity_to_pack), 0);
    const percentage = total > 0 ? Math.round((verified / total) * 100) : 0;
    setProgress({ total, verified, percentage });
  }, []);

  const autoSync = useCallback(async () => {
    try {
      // Check if items exist
      const { count } = await supabase
        .from('packing_list_items')
        .select('id', { count: 'exact', head: true })
        .eq('packing_id', packingId);

      if ((count || 0) > 0) return false;

      // Get linked bookings
      const { data: links } = await supabase
        .from('packing_project_bookings')
        .select('booking_id')
        .eq('packing_id', packingId);

      let bookingIds: string[] = (links || []).map(l => l.booking_id);

      // Fallback to single booking_id
      if (bookingIds.length === 0) {
        const { data: pp } = await supabase
          .from('packing_projects')
          .select('booking_id')
          .eq('id', packingId)
          .single();
        if (pp?.booking_id) bookingIds = [pp.booking_id];
      }

      if (bookingIds.length === 0) return false;

      // Sync all bookings
      for (const bookingId of bookingIds) {
        const { data: products } = await supabase
          .from('booking_products')
          .select('id, quantity')
          .eq('booking_id', bookingId);

        if (products && products.length > 0) {
          await supabase.from('packing_list_items').insert(
            products.map(p => ({
              packing_id: packingId,
              booking_product_id: p.id,
              quantity_to_pack: p.quantity,
              quantity_packed: 0,
            }))
          );
        }
      }
      return true;
    } catch (err) {
      console.error('Auto-sync error:', err);
      return false;
    }
  }, [packingId]);

  const loadData = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) setIsLoading(true);
      
      // Auto-sync if needed (first load only)
      if (!isBackground) {
        const didSync = await autoSync();
        if (didSync) {
          toast.success('Packlista genererad automatiskt');
        }
      }

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

      // Load booking group info
      const productBookingIds = new Set<string>();
      (itemsData as any[]).forEach(item => {
        const bid = item.booking_products?.booking_id;
        if (bid) productBookingIds.add(bid);
      });

      if (productBookingIds.size > 1) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, client, booking_number')
          .in('id', Array.from(productBookingIds));
        setBookingGroups((bookings || []).map(b => ({
          bookingId: b.id,
          client: b.client,
          bookingNumber: b.booking_number,
        })));
      } else {
        setBookingGroups([]);
      }

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
  }, [packingId, recalcProgress, autoSync]);

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

  const handleExclude = useCallback(async (itemId: string, exclude: boolean) => {
    const { error } = await supabase
      .from('packing_list_items')
      .update({ excluded: exclude })
      .eq('id', itemId);

    if (error) {
      toast.error('Kunde inte uppdatera');
      return;
    }

    setItems(prev => {
      const updated = prev.map(i => i.id === itemId ? { ...i, excluded: exclude } : i);
      recalcProgress(updated);
      return updated;
    });
    toast.success(exclude ? 'Produkt exkluderad' : 'Produkt inkluderad');
  }, [recalcProgress]);

  const handleAddManualRow = useCallback(async () => {
    if (!manualName.trim()) return;
    const qty = parseInt(manualQty) || 1;

    const { error } = await supabase
      .from('packing_list_items')
      .insert({
        packing_id: packingId,
        booking_product_id: null,
        manual_name: manualName.trim(),
        quantity_to_pack: qty,
        quantity_packed: 0,
      });

    if (error) {
      toast.error('Kunde inte lägga till rad');
      return;
    }

    setManualName('');
    setManualQty('1');
    setShowManualForm(false);
    toast.success('Manuell rad tillagd');
    await loadData(false);
  }, [packingId, manualName, manualQty, loadData]);

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };

  // Build parent-children map
  const childrenByParent: Record<string, PackingItem[]> = {};
  items.forEach(item => {
    const parentId = item.booking_products?.parent_product_id;
    if (parentId) {
      if (!childrenByParent[parentId]) childrenByParent[parentId] = [];
      childrenByParent[parentId].push(item);
    }
  });

  const activeItems = items.filter(i => !i.excluded);
  const excludedItems = items.filter(i => i.excluded);
  const manualItems = activeItems.filter(i => !i.booking_product_id && i.manual_name);
  const productItems = activeItems.filter(i => i.booking_product_id || !i.manual_name);

  // Group product items by booking if multi-booking
  const isMultiBooking = bookingGroups.length > 1;
  const groupedItems = isMultiBooking
    ? bookingGroups.map(group => ({
        ...group,
        items: productItems.filter(i => i.booking_products?.booking_id === group.bookingId),
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
    const isManual = !item.booking_product_id && !!item.manual_name;

    return (
      <div
        key={item.id}
        className={`w-full flex items-center gap-3 transition-all ${
          isComplete ? 'bg-primary/5' : isPartial ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''
        } ${isParent ? 'bg-muted border-b border-t border-border' : ''} ${
          isChild ? 'pl-6 pr-4 py-2.5' : 'px-4 py-3'
        } ${isManual ? 'border-l-2 border-l-blue-400' : ''}`}
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

        {/* Exclude button */}
        <button
          onClick={() => handleExclude(item.id, true)}
          className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Exkludera från packlistan"
        >
          <X className="h-3.5 w-3.5" />
        </button>

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
          Bocka av
        </h3>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowQR(!showQR)}>
            <QrCode className="h-4 w-4 mr-2" />
            {showQR ? 'Dölj QR' : 'Visa QR'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => loadData(false)}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Uppdatera
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowManualForm(!showManualForm)}>
            <Plus className="h-4 w-4 mr-2" />
            Lägg till rad
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

      {/* Manual row form */}
      {showManualForm && (
        <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800">
          <CardContent className="py-3 px-4">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Namn</label>
                <Input
                  value={manualName}
                  onChange={e => setManualName(e.target.value)}
                  placeholder="Produktnamn..."
                  className="h-9"
                  onKeyDown={e => e.key === 'Enter' && handleAddManualRow()}
                />
              </div>
              <div className="w-20">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Antal</label>
                <Input
                  value={manualQty}
                  onChange={e => setManualQty(e.target.value)}
                  type="number"
                  min="1"
                  className="h-9"
                />
              </div>
              <Button size="sm" onClick={handleAddManualRow} disabled={!manualName.trim()}>
                <Plus className="h-4 w-4 mr-1" />
                Lägg till
              </Button>
            </div>
          </CardContent>
        </Card>
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
                <p className="text-xs text-amber-700 mt-0.5">Gå till Översikt och generera packlistan först.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Product list grouped by booking */}
      {activeItems.length > 0 && (
        <div className="space-y-3">
          {groupedItems.map(group => {
            const isCollapsed = collapsedGroups.has(group.bookingId);
            const groupProductItems = group.items;

            return (
              <div key={group.bookingId} className="border rounded-lg overflow-hidden bg-card">
                {/* Group header (only for multi-booking) */}
                {isMultiBooking && (
                  <button
                    onClick={() => toggleGroupCollapse(group.bookingId)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/60 border-b hover:bg-muted/80 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      <span className="font-medium text-sm">{group.client}</span>
                      {group.bookingNumber && (
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                          <Hash className="h-3 w-3" />{group.bookingNumber}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{groupProductItems.length} artiklar</span>
                  </button>
                )}

                {/* Column header */}
                {!isCollapsed && (
                  <>
                    {!isMultiBooking && (
                      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/40">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Produkt</span>
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Packat</span>
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

          {/* Manual items section */}
          {manualItems.length > 0 && (
            <div className="border rounded-lg overflow-hidden bg-card border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between px-4 py-2 border-b bg-blue-50/60 dark:bg-blue-950/30">
                <span className="text-xs font-medium text-blue-700 dark:text-blue-400 uppercase tracking-wider">Manuellt tillagda</span>
                <span className="text-xs text-muted-foreground">{manualItems.length} artiklar</span>
              </div>
              <div className="divide-y divide-border/30">
                {manualItems.map(renderItem)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Excluded items */}
      {excludedItems.length > 0 && (
        <Collapsible open={showExcluded} onOpenChange={setShowExcluded}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <EyeOff className="h-3.5 w-3.5" />
                Exkluderade ({excludedItems.length})
              </span>
              {showExcluded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border rounded-lg overflow-hidden bg-muted/20 mt-1">
              <div className="divide-y divide-border/20">
                {excludedItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 opacity-60">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-muted-foreground line-through truncate block">
                        {item.manual_name || item.booking_products?.name || 'Okänd'}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleExclude(item.id, false)}
                    >
                      <Eye className="h-3.5 w-3.5 mr-1" />
                      Inkludera
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
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
