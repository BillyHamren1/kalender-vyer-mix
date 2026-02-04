import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { ArrowLeft, Check, RefreshCw, Camera, AlertCircle } from 'lucide-react';
import { fetchPackingListItems, verifyProductBySku, getVerificationProgress, parseScanResult, togglePackingItemManually } from '@/services/scannerService';
import { fetchPacking } from '@/services/packingService';
import { PackingWithBooking } from '@/types/packing';
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

  // Load packing data
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const [packingData, itemsData, progressData] = await Promise.all([
        fetchPacking(packingId),
        fetchPackingListItems(packingId),
        getVerificationProgress(packingId)
      ]);

      setPacking(packingData);
      setItems(itemsData as PackingItem[]);
      setProgress(progressData);
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
      // Refresh data
      loadData();
    } else {
      toast.error(result.error);
    }

    // Close QR scanner after scan
    setIsQRActive(false);
  }, [packingId, verifierName, loadData]);

  // Handle manual checkbox toggle
  const handleManualToggle = useCallback(async (itemId: string, isCurrentlyPacked: boolean, quantityToPack: number) => {
    const result = await togglePackingItemManually(itemId, isCurrentlyPacked, quantityToPack, verifierName);
    
    if (result.success) {
      toast.success(isCurrentlyPacked ? 'Avmarkerad' : 'Markerad som packad');
      loadData();
    } else {
      toast.error(result.error || 'Kunde inte uppdatera');
    }
  }, [verifierName, loadData]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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

      {/* Compact Progress + QR button inline */}
      <div className="flex items-center gap-3 px-1">
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
          className="h-8 px-3 gap-1.5"
        >
          <Camera className="h-3.5 w-3.5" />
          <span className="text-xs">QR</span>
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
            {items.map(item => {
              const rawName = item.booking_products?.name || 'Okänd produkt';
              const trimmedName = rawName.trimStart();
              
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
              
              // Clean name and determine prefix indicator
              const cleanName = cleanProductName(rawName);
              const isPackageComponent = item.booking_products?.is_package_component || trimmedName.startsWith('⦿');
              const prefixIndicator = isChild ? (isPackageComponent ? '⦿ ' : '↳ ') : '';
              
              // Format display name: UPPERCASE for main, Title Case for children
              const displayName = isChild ? formatToTitleCase(cleanName) : cleanName.toUpperCase();
              
              const sku = item.booking_products?.sku;
              const packed = item.quantity_packed || 0;
              const total = item.quantity_to_pack;
              const isComplete = packed >= total;
              const isPartial = packed > 0 && packed < total;
              
              return (
                <button 
                  key={item.id}
                  onClick={() => handleManualToggle(item.id, isComplete, total)}
                  className={`w-full flex items-center gap-2 text-left transition-colors ${
                    isComplete 
                      ? 'bg-green-50/70' 
                      : isPartial 
                        ? 'bg-amber-50/50 hover:bg-amber-50/80' 
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
                  </div>
                  
                  {/* Quantity badge: packed/total */}
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
            })}
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
