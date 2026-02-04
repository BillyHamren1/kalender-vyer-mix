import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { ArrowLeft, Check, RefreshCw, Camera, AlertCircle, Package, ChevronRight, X } from 'lucide-react';
import { 
  fetchPackingListItems, 
  verifyProductBySku, 
  getVerificationProgress, 
  parseScanResult, 
  togglePackingItemManually,
  createParcel,
  assignItemToParcel,
  getItemParcels
} from '@/services/scannerService';
import { fetchPacking } from '@/services/packingService';
import { PackingWithBooking, PackingParcel } from '@/types/packing';
import { QRScanner } from './QRScanner';

interface VerificationViewProps {
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

// Remove prefix symbols from product names
const cleanProductName = (name: string): string => {
  return name.replace(/^[↳└⦿\s,L]+/, '').trim();
};

// Convert UPPERCASE text to Title Case, preserving abbreviations and measurements
const formatToTitleCase = (text: string): string => {
  // If text is not mostly uppercase, return as-is
  const upperCount = (text.match(/[A-ZÅÄÖ]/g) || []).length;
  const lowerCount = (text.match(/[a-zåäö]/g) || []).length;
  if (lowerCount >= upperCount) return text;
  
  return text.split(' ').map(word => {
    // Preserve short abbreviations (1-3 chars like LM, M, ST)
    if (word.length <= 3 && /^[A-ZÅÄÖ0-9]+$/.test(word)) return word;
    // Preserve measurements/numbers (e.g., 8X15, 3M, 2.5M)
    if (/\d/.test(word)) return word;
    // Title case the word
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');
};

export const VerificationView: React.FC<VerificationViewProps> = ({ 
  packingId, 
  onBack,
  verifierName = 'Scanner' 
}) => {
  const [packing, setPacking] = useState<PackingWithBooking | null>(null);
  const [items, setItems] = useState<PackingItem[]>([]);
  const [progress, setProgress] = useState({ total: 0, verified: 0, percentage: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isQRActive, setIsQRActive] = useState(false);
  const [lastScan, setLastScan] = useState<{ value: string; result: string; success: boolean } | null>(null);
  
  // Kolli mode state
  const [isKolliMode, setIsKolliMode] = useState(false);
  const [activeParcel, setActiveParcel] = useState<PackingParcel | null>(null);
  const [itemParcelMap, setItemParcelMap] = useState<Record<string, number>>({});

  // Load packing data
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
      setItems(itemsData as PackingItem[]);
      setProgress(progressData);
      setItemParcelMap(parcelsData);
    } catch (err) {
      console.error('Error loading packing data:', err);
      toast.error('Kunde inte ladda packlista');
    } finally {
      setIsLoading(false);
    }
  }, [packingId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Start Kolli mode - create first parcel
  const startKolliMode = useCallback(async () => {
    try {
      const parcel = await createParcel(packingId, verifierName);
      setActiveParcel(parcel);
      setIsKolliMode(true);
      toast.success(`Kolli #${parcel.parcel_number} startat`);
    } catch (err) {
      console.error('Error creating parcel:', err);
      toast.error('Kunde inte skapa kolli');
    }
  }, [packingId, verifierName]);

  // Create next parcel
  const nextParcel = useCallback(async () => {
    try {
      const parcel = await createParcel(packingId, verifierName);
      setActiveParcel(parcel);
      toast.success(`Kolli #${parcel.parcel_number} startat`);
      // Refresh to get updated parcel assignments
      const parcelsData = await getItemParcels(packingId);
      setItemParcelMap(parcelsData);
    } catch (err) {
      console.error('Error creating next parcel:', err);
      toast.error('Kunde inte skapa nästa kolli');
    }
  }, [packingId, verifierName]);

  // Exit Kolli mode
  const exitKolliMode = useCallback(async () => {
    setIsKolliMode(false);
    setActiveParcel(null);
    // Refresh data to show final parcel assignments
    await loadData();
    toast.info('Kolli-läge avslutat');
  }, [loadData]);

  // Handle scan result
  const handleScan = useCallback(async (scannedValue: string) => {
    const scanResult = parseScanResult(scannedValue);
    
    if (scanResult.type === 'packing_id') {
      toast.info('QR-kod innehåller packlista-ID');
      return;
    }

    // Try to verify product by SKU
    const result = await verifyProductBySku(packingId, scannedValue, verifierName);
    
    setLastScan({
      value: scannedValue,
      result: result.success ? `✅ ${result.productName}` : result.error || 'Okänt fel',
      success: result.success
    });

    if (result.success) {
      toast.success(`${result.productName} verifierad!`);
      
      // If in Kolli mode, assign scanned item to active parcel
      if (isKolliMode && activeParcel) {
        // Find the item that was just verified
        const itemsData = await fetchPackingListItems(packingId);
        const justVerifiedItem = (itemsData as PackingItem[]).find(
          item => item.booking_products?.sku?.toLowerCase() === scannedValue.toLowerCase()
        );
        if (justVerifiedItem) {
          await assignItemToParcel(justVerifiedItem.id, activeParcel.id);
          setItemParcelMap(prev => ({ ...prev, [justVerifiedItem.id]: activeParcel.parcel_number }));
          toast.info(`Tillagd i Kolli #${activeParcel.parcel_number}`);
        }
      }
      
      // Refresh data
      loadData();
    } else {
      toast.error(result.error);
    }

    // Close QR scanner after scan
    setIsQRActive(false);
  }, [packingId, verifierName, loadData, isKolliMode, activeParcel]);

  // Handle manual checkbox toggle - only for child items
  const handleManualToggle = useCallback(async (itemId: string, isCurrentlyPacked: boolean, quantityToPack: number, isParent: boolean) => {
    if (isParent) {
      toast.info('Huvudprodukter markeras automatiskt när alla delar är packade');
      return;
    }
    
    const result = await togglePackingItemManually(itemId, isCurrentlyPacked, quantityToPack, verifierName);
    
    if (result.success) {
      toast.success(isCurrentlyPacked ? 'Avmarkerad' : 'Markerad som packad');
      
      // If in Kolli mode and we're packing (not unpacking), assign to parcel
      if (isKolliMode && activeParcel && !isCurrentlyPacked) {
        await assignItemToParcel(itemId, activeParcel.id);
        setItemParcelMap(prev => ({ ...prev, [itemId]: activeParcel.parcel_number }));
        toast.info(`Tillagd i Kolli #${activeParcel.parcel_number}`);
      }
      
      loadData();
    } else {
      toast.error(result.error || 'Kunde inte uppdatera');
    }
  }, [verifierName, loadData, isKolliMode, activeParcel]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Kolli Mode UI
  if (isKolliMode && activeParcel) {
    return (
      <div className="space-y-3">
        {/* Kolli Mode Header */}
        <div className="bg-primary text-primary-foreground rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              <span className="font-semibold">KOLLI-LÄGE</span>
            </div>
            <div className="bg-primary-foreground/20 px-3 py-1 rounded-full">
              <span className="font-bold text-lg">#{activeParcel.parcel_number}</span>
            </div>
          </div>
          <p className="text-xs mt-1 opacity-90">Scanna eller klicka på produkter för Kolli #{activeParcel.parcel_number}</p>
        </div>

        {/* QR Button for Kolli mode */}
        <div className="flex gap-2">
          <Button 
            onClick={() => setIsQRActive(true)}
            className="flex-1 gap-2"
          >
            <Camera className="h-4 w-4" />
            Scanna produkt
          </Button>
        </div>

        {/* Product list in Kolli mode */}
        <div className="border rounded-lg overflow-hidden bg-card">
          <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/40">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Produkt</span>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Kolli</span>
          </div>
          
          <div className="divide-y divide-border/30 max-h-[calc(100vh-320px)] overflow-y-auto">
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
              
              // Build parent-children map for this render
              const childrenByParent: Record<string, PackingItem[]> = {};
              items.forEach(i => {
                const parentId = i.booking_products?.parent_product_id;
                if (parentId) {
                  if (!childrenByParent[parentId]) childrenByParent[parentId] = [];
                  childrenByParent[parentId].push(i);
                }
              });
              
              const hasChildren = productId ? (childrenByParent[productId]?.length || 0) > 0 : false;
              const isParent = !isChild && hasChildren;
              
              const packed = item.quantity_packed || 0;
              const total = item.quantity_to_pack;
              const isComplete = packed >= total && total > 0;
              
              const cleanName = cleanProductName(rawName);
              const isPackageComponent = item.booking_products?.is_package_component || trimmedName.startsWith('⦿');
              const prefixIndicator = isChild ? (isPackageComponent ? '⦿ ' : '↳ ') : '';
              const displayName = isChild ? formatToTitleCase(cleanName) : cleanName.toUpperCase();
              
              const parcelNumber = itemParcelMap[item.id];
              
              return (
                <button 
                  key={item.id}
                  onClick={() => handleManualToggle(item.id, isComplete, item.quantity_to_pack, isParent)}
                  disabled={isParent || isComplete}
                  className={`w-full flex items-center gap-2 text-left transition-colors ${
                    isComplete ? 'bg-green-50/70' : ''
                  } ${
                    isParent || isComplete ? 'cursor-default opacity-60' : 'hover:bg-muted/40 active:bg-muted/60'
                  } ${isChild ? 'pl-6 pr-2 py-1.5' : 'px-2 py-2'}`}
                >
                  {/* Status indicator */}
                  <div className={`shrink-0 rounded-full flex items-center justify-center ${
                    isChild ? 'w-4 h-4' : 'w-5 h-5'
                  } ${
                    isComplete ? 'bg-green-500' : 'border-2 border-muted-foreground/40'
                  }`}>
                    {isComplete && <Check className="text-white w-2.5 h-2.5" />}
                  </div>
                  
                  {/* Product name */}
                  <div className="flex-1 min-w-0">
                    <span className={`block truncate ${
                      isChild ? 'text-[11px] font-normal' : 'text-xs font-semibold tracking-wide'
                    } ${isComplete ? 'text-green-700' : isChild ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {isChild && <span className="text-muted-foreground/70">{prefixIndicator}</span>}
                      {displayName}
                    </span>
                  </div>
                  
                  {/* Parcel badge */}
                  {parcelNumber ? (
                    <div className="shrink-0 flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded">
                      <Package className="h-3 w-3" />
                      <span className="text-[10px] font-bold">#{parcelNumber}</span>
                    </div>
                  ) : isComplete ? (
                    <div className="shrink-0 text-[10px] text-muted-foreground">
                      Inget kolli
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Kolli action buttons */}
        <div className="flex gap-2">
          <Button 
            onClick={nextParcel}
            variant="outline"
            className="flex-1 gap-2"
          >
            <ChevronRight className="h-4 w-4" />
            Nästa kolli
          </Button>
          <Button 
            onClick={exitKolliMode}
            variant="secondary"
            className="flex-1 gap-2"
          >
            <X className="h-4 w-4" />
            Avsluta
          </Button>
        </div>

        {/* QR Scanner overlay */}
        <QRScanner 
          isActive={isQRActive}
          onScan={handleScan}
          onClose={() => setIsQRActive(false)}
        />
      </div>
    );
  }

  // Normal verification UI
  return (
    <div className="space-y-3">
      {/* Compact Header */}
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

      {/* Compact Progress + QR + Kolli buttons inline */}
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
        <Button 
          onClick={() => setIsQRActive(true)}
          size="sm"
          className="h-8 px-2.5 gap-1"
        >
          <Camera className="h-3.5 w-3.5" />
          <span className="text-xs">QR</span>
        </Button>
        <Button 
          onClick={startKolliMode}
          size="sm"
          variant="outline"
          className="h-8 px-2.5 gap-1"
        >
          <Package className="h-3.5 w-3.5" />
          <span className="text-xs">Kolli</span>
        </Button>
      </div>

      {/* Last scan result - compact */}
      {lastScan && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs ${
          lastScan.success ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          <span className="font-mono truncate">{lastScan.value}</span>
          <span className="font-medium">{lastScan.result}</span>
        </div>
      )}

      {/* No items warning */}
      {items.length === 0 && (
        <Card className="border-amber-500/50 bg-amber-50">
          <CardContent className="py-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800 text-sm">Inga produkter</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Packlistan har inte genererats ännu.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Product list - always visible, no toggle */}
      {items.length > 0 && (
        <div className="border rounded-lg overflow-hidden bg-card">
          {/* Table header */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/40">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Produkt</span>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Packat</span>
          </div>
          
          <div className="divide-y divide-border/30 max-h-[calc(100vh-220px)] overflow-y-auto">
            {(() => {
              // Build parent-children map for auto-complete logic
              const childrenByParent: Record<string, PackingItem[]> = {};
              items.forEach(item => {
                const parentId = item.booking_products?.parent_product_id;
                if (parentId) {
                  if (!childrenByParent[parentId]) childrenByParent[parentId] = [];
                  childrenByParent[parentId].push(item);
                }
              });

              return items.map(item => {
                const rawName = item.booking_products?.name || 'Okänd produkt';
                const trimmedName = rawName.trimStart();
                const productId = item.booking_products?.id;
                
                // Determine child status via relations first, then prefix fallback
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
                
                // Check if this is a parent with children
                const hasChildren = productId ? (childrenByParent[productId]?.length || 0) > 0 : false;
                const isParent = !isChild && hasChildren;
                
                // For parents: show as 0/1 until ALL children are packed, then 1/1
                let packed = item.quantity_packed || 0;
                let total = item.quantity_to_pack;
                
                if (isParent && productId) {
                  const children = childrenByParent[productId] || [];
                  const childrenPacked = children.filter(c => (c.quantity_packed || 0) >= c.quantity_to_pack).length;
                  const allChildrenPacked = children.length > 0 && childrenPacked === children.length;
                  
                  // Display as single package: 0/1 or 1/1
                  total = 1;
                  packed = allChildrenPacked ? 1 : 0;
                }
                
                // Clean name and determine prefix indicator
                const cleanName = cleanProductName(rawName);
                const isPackageComponent = item.booking_products?.is_package_component || trimmedName.startsWith('⦿');
                const prefixIndicator = isChild ? (isPackageComponent ? '⦿ ' : '↳ ') : '';
                
                // Format display name: UPPERCASE for main, Title Case for children
                const displayName = isChild ? formatToTitleCase(cleanName) : cleanName.toUpperCase();
                
                const isComplete = packed >= total && total > 0;
                const isPartial = packed > 0 && packed < total;
                
                // Get parcel number if assigned
                const parcelNumber = itemParcelMap[item.id];
                
                return (
                  <button 
                    key={item.id}
                    onClick={() => handleManualToggle(item.id, isComplete, item.quantity_to_pack, isParent)}
                    disabled={isParent}
                    className={`w-full flex items-center gap-2 text-left transition-colors ${
                      isComplete 
                        ? 'bg-green-50/70' 
                        : isPartial 
                          ? 'bg-amber-50/50' 
                          : ''
                    } ${
                      isParent 
                        ? 'cursor-default opacity-80' 
                        : 'hover:bg-muted/40 active:bg-muted/60'
                    } ${isChild ? 'pl-6 pr-2 py-1.5' : 'px-2 py-2'}`}
                  >
                    {/* Status indicator circle */}
                    <div className={`shrink-0 rounded-full flex items-center justify-center ${
                      isChild ? 'w-4 h-4' : 'w-5 h-5'
                    } ${
                      isComplete 
                        ? 'bg-green-500' 
                        : isPartial 
                          ? 'bg-amber-500' 
                          : isParent
                            ? 'border-2 border-dashed border-muted-foreground/30'
                            : 'border-2 border-muted-foreground/40'
                    }`}>
                      {isComplete && <Check className="text-white w-2.5 h-2.5" />}
                      {isPartial && <span className="text-white text-[8px] font-bold">{packed}</span>}
                    </div>
                    
                    {/* Product name with prefix indicator */}
                    <div className="flex-1 min-w-0">
                      <span className={`block truncate ${
                        isChild 
                          ? 'text-[11px] font-normal' 
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
                        {isChild && <span className="text-muted-foreground/70">{prefixIndicator}</span>}
                        {displayName}
                      </span>
                      {isParent && (
                        <span className="text-[9px] text-muted-foreground">
                          Markeras när alla delar är packade
                        </span>
                      )}
                    </div>
                    
                    {/* Parcel badge if assigned */}
                    {parcelNumber && (
                      <div className="shrink-0 flex items-center gap-0.5 text-primary">
                        <Package className="h-3 w-3" />
                        <span className="text-[10px] font-bold">#{parcelNumber}</span>
                      </div>
                    )}
                    
                    {/* Quantity badge: packed/total or children progress */}
                    <div className={`shrink-0 min-w-[40px] flex items-center justify-center rounded px-1.5 py-0.5 ${
                      isComplete 
                        ? 'bg-green-100 text-green-700' 
                        : isPartial 
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-muted/60 text-muted-foreground'
                    }`}>
                      <span className={`font-mono font-bold ${isChild ? 'text-[10px]' : 'text-xs'}`}>
                        {packed}/{total}
                      </span>
                    </div>
                  </button>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* QR Scanner overlay */}
      <QRScanner 
        isActive={isQRActive}
        onScan={handleScan}
        onClose={() => setIsQRActive(false)}
      />
    </div>
  );
};