import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { RecentScanEntry } from '@/hooks/scanner/useScanProcessor';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { ArrowLeft, Check, RefreshCw, Camera, AlertCircle, Package, ChevronRight, X, Minus, List } from 'lucide-react';
import { getItemParcels } from '@/services/scannerService';
import { QRScanner } from './QRScanner';
import { ScannerModeIndicator } from './ScannerModeIndicator';
import { RfidStatusBar } from './RfidStatusBar';
import { ScanMode } from '@/services/scanner/types';
import { useOptimisticPacking, PackingItem } from '@/hooks/scanner/useOptimisticPacking';
import { usePackingSync } from '@/hooks/scanner/usePackingSync';
import { useScanFeedback } from '@/hooks/scanner/useScanFeedback';
import { useKolliManager } from '@/hooks/scanner/useKolliManager';
import { useScanProcessor } from '@/hooks/scanner/useScanProcessor';
import { useRfidManager } from '@/hooks/scanner/useRfidManager';
import { useScannerRealtime } from '@/hooks/scanner/useScannerRealtime';

interface ScannerStateProps {
  currentMode: ScanMode;
  isBarcodeReady: boolean;
  isRfidReady: boolean;
  isReaderConnected: boolean;
  scanCount: number;
  warning?: string | null;
}

interface RfidControlsProps {
  startInventory: () => Promise<void>;
  stopInventory: () => Promise<void>;
}

interface VerificationViewProps {
  packingId: string;
  onBack: () => void;
  verifierName?: string;
  registerScanHandler?: (handler: (value: string) => void) => void;
  scannerState?: ScannerStateProps;
  rfidControls?: RfidControlsProps;
}

// Remove prefix symbols from product names
const cleanProductName = (name: string): string => {
  return name.replace(/^[↳└⦿\s,L]+/, '').trim();
};

// Convert UPPERCASE text to Title Case, preserving abbreviations and measurements
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

export const VerificationView: React.FC<VerificationViewProps> = ({ 
  packingId, 
  onBack,
  verifierName = 'Scanner',
  registerScanHandler,
  scannerState,
  rfidControls,
}) => {
  const [isQRActive, setIsQRActive] = useState(false);
  const [isMinusMode, setIsMinusMode] = useState(false);
  const isMinusModeRef = useRef(isMinusMode);
  isMinusModeRef.current = isMinusMode;

  // --- Hooks ---
  const {
    packing, items, progress, isLoading, loadData,
    recalcProgress, applyOptimisticIncrement, applyOptimisticDecrement, setItems,
  } = useOptimisticPacking(packingId);

  const {
    isKolliMode, activeParcel, itemParcelMap,
    startKolli, nextKolli, exitKolli, assignToKolli, setParcelMap,
  } = useKolliManager(packingId);

  const { lastScanResult, highlightedItemId, setScanResult, highlightRow, cleanup: cleanupFeedback } = useScanFeedback();

  const { triggerSync } = usePackingSync({
    packingId,
    loadData,
    onParcelsLoaded: setParcelMap,
  });

  const itemsRef = useRef(items);
  itemsRef.current = items;

  // RFID manager — provides status UI and inventory controls
  const rfid = useRfidManager();
  const [showKolliConfirm, setShowKolliConfirm] = useState(false);
  const { enqueueScan, handleManualToggle, recentScans, clearSessionDedup } = useScanProcessor({
    packingId,
    verifierName,
    getItems: () => itemsRef.current,
    getIsMinusMode: () => isMinusModeRef.current,
    onScanResult: setScanResult,
    onHighlight: highlightRow,
    onOptimisticIncrement: applyOptimisticIncrement,
    onOptimisticDecrement: applyOptimisticDecrement,
    onAssignToKolli: assignToKolli,
    getIsKolliMode: () => isKolliMode,
    onTriggerSync: triggerSync,
    onRfidTagResult: rfid.recordTagResult,
  });

  // Override rfid to also clear scan dedup on session reset
  const rfidWithReset = useMemo(() => ({
    ...rfid,
    resetSession: () => {
      rfid.resetSession();
      clearSessionDedup();
    },
  }), [rfid, clearSessionDedup]);

  const [showRecentScans, setShowRecentScans] = useState(false);

  // Realtime sync: refetch when packing_list_items or packing_projects change
  const realtimeTables = useMemo(() => ['packing_list_items', 'packing_projects'], []);
  useScannerRealtime({
    tables: realtimeTables,
    onChanged: useCallback(() => loadData(true), [loadData]),
    pollingInterval: 30000,
  });

  // Load initial data + parcels
  useEffect(() => {
    const init = async () => {
      await loadData(false);
      try {
        const parcels = await getItemParcels(packingId);
        setParcelMap(parcels);
      } catch { /* silent */ }
    };
    init();
  }, [loadData, packingId, setParcelMap]);

  // Cleanup
  useEffect(() => () => cleanupFeedback(), [cleanupFeedback]);

  // Register scan handler with parent
  useEffect(() => {
    if (registerScanHandler) {
      console.log('[VerificationView] Registering scan handler');
      registerScanHandler(enqueueScan);
    }
  }, [enqueueScan, registerScanHandler]);

  // Handle exit kolli with data reload
  const handleExitKolli = useCallback(async () => {
    exitKolli();
    await loadData(false);
  }, [exitKolli, loadData]);

  // --- Rendering helpers ---
  const buildChildrenMap = (itemsList: PackingItem[]) => {
    const map: Record<string, PackingItem[]> = {};
    itemsList.forEach(i => {
      const parentId = i.booking_products?.parent_product_id;
      if (parentId) {
        if (!map[parentId]) map[parentId] = [];
        map[parentId].push(i);
      }
    });
    return map;
  };

  const getItemDisplayInfo = (item: PackingItem, childrenByParent: Record<string, PackingItem[]>) => {
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
      const allPacked = children.length > 0 && children.every(c => (c.quantity_packed || 0) >= c.quantity_to_pack);
      total = 1;
      packed = allPacked ? 1 : 0;
    }
    
    const cleanName = cleanProductName(rawName);
    const isPackageComponent = item.booking_products?.is_package_component || trimmedName.startsWith('⦿');
    const prefixIndicator = isChild ? (isPackageComponent ? '⦿ ' : '↳ ') : '';
    const displayName = isChild ? formatToTitleCase(cleanName) : cleanName.toUpperCase();
    
    const isOverscan = packed > total && total > 0;
    const isComplete = packed >= total && total > 0 && !isOverscan;
    const isPartial = packed > 0 && packed < total;
    
    return { isChild, isParent, packed, total, displayName, prefixIndicator, isOverscan, isComplete, isPartial, isPackageComponent };
  };

  // --- Loading state ---
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const childrenByParent = buildChildrenMap(items);

  // --- Render item row ---
  const renderItemRow = (item: PackingItem, showParcelColumn = false) => {
    const info = getItemDisplayInfo(item, childrenByParent);
    const parcelNumber = itemParcelMap[item.id];

    return (
      <button 
        key={item.id}
        onClick={() => handleManualToggle(item.id, info.isComplete, item.quantity_to_pack, info.isParent)}
        disabled={info.isParent || (showParcelColumn && info.isComplete)}
        className={`w-full flex items-center gap-2 text-left transition-all duration-300 ${
          highlightedItemId === item.id
            ? 'bg-green-200 ring-2 ring-green-400 scale-[1.01]'
            : info.isOverscan
              ? 'bg-red-100/80 border-l-4 border-red-500'
              : info.isComplete 
                ? 'bg-green-50/70' 
                : info.isPartial 
                  ? 'bg-amber-50/50' 
                  : ''
        } ${
          info.isParent || (showParcelColumn && info.isComplete)
            ? 'cursor-default opacity-60' 
            : 'hover:bg-muted/40 active:bg-muted/60'
        } ${info.isChild ? 'pl-6 pr-2 py-1.5' : 'px-2 py-2'}`}
      >
        <div className={`shrink-0 rounded-full flex items-center justify-center ${
          info.isChild ? 'w-4 h-4' : 'w-5 h-5'
        } ${
          info.isOverscan ? 'bg-red-500 animate-pulse'
            : info.isComplete ? 'bg-green-500' 
            : info.isPartial ? 'bg-amber-500' 
            : info.isParent ? 'border-2 border-dashed border-muted-foreground/30'
            : 'border-2 border-muted-foreground/40'
        }`}>
          {info.isOverscan && <AlertCircle className="text-white w-2.5 h-2.5" />}
          {info.isComplete && !info.isOverscan && <Check className="text-white w-2.5 h-2.5" />}
          {info.isPartial && <span className="text-white text-[8px] font-bold">{info.packed}</span>}
        </div>
        
        <div className="flex-1 min-w-0">
          <span className={`block truncate ${
            info.isChild ? 'text-[11px] font-normal' : 'text-xs font-semibold tracking-wide'
          } ${
            info.isOverscan ? 'text-red-700 font-bold'
              : info.isComplete ? 'text-green-700' 
              : info.isPartial ? 'text-amber-800'
              : info.isChild ? 'text-muted-foreground' 
              : 'text-foreground'
          }`}>
            {info.isChild && <span className="text-muted-foreground/70">{info.prefixIndicator}</span>}
            {info.displayName}
          </span>
          {info.isParent && (
            <span className="text-[9px] text-muted-foreground">
              Markeras när alla delar är packade
            </span>
          )}
        </div>
        
        {/* Parcel badge */}
        {showParcelColumn ? (
          parcelNumber ? (
            <div className="shrink-0 flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded">
              <Package className="h-3 w-3" />
              <span className="text-[10px] font-bold">#{parcelNumber}</span>
            </div>
          ) : info.isComplete ? (
            <div className="shrink-0 text-[10px] text-muted-foreground">Inget kolli</div>
          ) : null
        ) : (
          <>
            {parcelNumber && (
              <div className="shrink-0 flex items-center gap-0.5 text-primary">
                <Package className="h-3 w-3" />
                <span className="text-[10px] font-bold">#{parcelNumber}</span>
              </div>
            )}
          </>
        )}
        
        {/* Quantity badge */}
        {!showParcelColumn && (
          <div className={`shrink-0 min-w-[40px] flex items-center justify-center rounded px-1.5 py-0.5 ${
            info.isOverscan ? 'bg-red-200 text-red-800'
              : info.isComplete ? 'bg-green-100 text-green-700' 
              : info.isPartial ? 'bg-amber-100 text-amber-700'
              : 'bg-muted/60 text-muted-foreground'
          }`}>
            <span className={`font-mono font-bold ${info.isChild ? 'text-[10px]' : 'text-xs'}`}>
              {info.packed}/{info.total}
            </span>
          </div>
        )}
      </button>
    );
  };

  // --- Kolli Mode UI ---
  if (isKolliMode && activeParcel) {
    return (
      <div className="space-y-3">
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

        {lastScanResult && (
          <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
            lastScanResult.isMinusScan
              ? 'bg-orange-100 text-orange-800 border border-orange-300'
              : lastScanResult.success 
                ? 'bg-green-100 text-green-800 border border-green-300' 
                : 'bg-red-100 text-red-800 border border-red-300'
          }`}>
            <span className="text-lg">{lastScanResult.isMinusScan ? '➖' : lastScanResult.success ? '✅' : '❌'}</span>
            <div className="flex-1 min-w-0">
              <span className="block truncate font-semibold">{lastScanResult.productName || lastScanResult.value}</span>
              <span className="text-xs opacity-80">{lastScanResult.result}</span>
            </div>
            <button
              onClick={() => setScanResult(null)}
              className="shrink-0 p-1 rounded-full hover:bg-black/10 transition-colors"
              aria-label="Stäng"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={() => setIsQRActive(true)} className="flex-1 gap-2">
            <Camera className="h-4 w-4" />
            Scanna produkt
          </Button>
        </div>

        <div className="border rounded-lg overflow-hidden bg-card">
          <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/40">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Produkt</span>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Kolli</span>
          </div>
          <div className="divide-y divide-border/30 max-h-[calc(100vh-320px)] overflow-y-auto">
            {items.map(item => renderItemRow(item, true))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => nextKolli(verifierName)} variant="outline" className="flex-1 gap-2">
            <ChevronRight className="h-4 w-4" />
            Nästa kolli
          </Button>
          <Button onClick={handleExitKolli} variant="secondary" className="flex-1 gap-2">
            <X className="h-4 w-4" />
            Avsluta
          </Button>
        </div>

        <QRScanner isActive={isQRActive} onScan={enqueueScan} onClose={() => setIsQRActive(false)} skipCamera={false} />
      </div>
    );
  }

  // --- Normal verification UI ---
  return (
    <div className="space-y-3">
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

      {scannerState && (
        <ScannerModeIndicator
          currentMode={scannerState.currentMode}
          isBarcodeReady={scannerState.isBarcodeReady}
          isRfidReady={scannerState.isRfidReady}
          isReaderConnected={scannerState.isReaderConnected}
          scanCount={scannerState.scanCount}
        />
      )}

      {/* RFID Status & Controls */}
      <RfidStatusBar
        status={rfid.status}
        readerModel={rfid.readerModel}
        error={rfid.error}
        inventoryActive={rfid.inventoryActive}
        totalTagsRead={rfid.totalTagsRead}
        uniqueTagsRead={rfid.uniqueTagsRead}
        matchedCount={rfid.matchedCount}
        unmatchedCount={rfid.unmatchedCount}
        lastMatchedProduct={rfid.lastMatchedProduct}
        onConnect={rfid.connect}
        onDisconnect={rfid.disconnect}
        onToggleInventory={rfid.toggleInventory}
        onReset={rfidWithReset.resetSession}
      />

      {isMinusMode && (
        <div className="bg-destructive text-destructive-foreground rounded-lg px-3 py-2 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-2">
            <Minus className="h-5 w-5" />
            <span className="font-bold text-sm">MINUS-LÄGE AKTIVT</span>
          </div>
          <span className="text-xs opacity-90">Scan tar bort 1 st</span>
        </div>
      )}

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
          onClick={() => setIsMinusMode(prev => {
            if (prev) clearSessionDedup(); // Clear dedup when exiting minus mode
            return !prev;
          })}
          size="sm"
          variant={isMinusMode ? "destructive" : "outline"}
          className="h-8 px-2.5 gap-1"
        >
          <Minus className="h-3.5 w-3.5" />
          <span className="text-xs">−</span>
        </Button>
        <Button onClick={() => setIsQRActive(true)} size="sm" className="h-8 px-2.5 gap-1">
          <Camera className="h-3.5 w-3.5" />
          <span className="text-xs">Kamera</span>
        </Button>
        <Button onClick={() => setShowKolliConfirm(true)} size="sm" variant="secondary" className="h-8 px-3 gap-1.5 border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 font-semibold">
          <Package className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs text-primary">Kolli</span>
          {Object.keys(itemParcelMap).length > 0 && (
            <span className="bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {new Set(Object.values(itemParcelMap)).size}
            </span>
          )}
        </Button>
        <Button onClick={() => setShowRecentScans(prev => !prev)} size="sm" variant={showRecentScans ? "secondary" : "outline"} className="h-8 px-2.5 gap-1 relative">
          <List className="h-3.5 w-3.5" />
          <span className="text-xs">Logg</span>
          {recentScans.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {recentScans.length > 99 ? '99' : recentScans.length}
            </span>
          )}
        </Button>
      </div>

      {showRecentScans && recentScans.length > 0 && (
        <div className="border rounded-lg overflow-hidden bg-card">
          <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/40">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Senaste scanningar</span>
            <button onClick={() => setShowRecentScans(false)} className="p-0.5 rounded hover:bg-muted">
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
          <div className="divide-y divide-border/30 max-h-[200px] overflow-y-auto">
            {recentScans.map((scan, i) => (
              <div key={`${scan.timestamp}-${i}`} className="flex items-center gap-2 px-3 py-1.5">
                <span className="text-xs">{scan.success ? '✅' : '❌'}</span>
                <span className="flex-1 text-xs font-medium truncate">{scan.productName}</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {new Date(scan.timestamp).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {lastScanResult && (
        <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
          lastScanResult.isMinusScan
            ? 'bg-orange-100 text-orange-800 border border-orange-300'
            : lastScanResult.success 
              ? 'bg-green-100 text-green-800 border border-green-300' 
              : 'bg-red-100 text-red-800 border border-red-300'
        }`}>
          <span className="text-lg">{lastScanResult.isMinusScan ? '➖' : lastScanResult.success ? '✅' : '❌'}</span>
          <div className="flex-1 min-w-0">
            <span className="block truncate font-semibold">{lastScanResult.productName || lastScanResult.value}</span>
            <span className="text-xs opacity-80">{lastScanResult.result}</span>
          </div>
          <button
            onClick={() => setScanResult(null)}
            className="shrink-0 p-1 rounded-full hover:bg-black/10 transition-colors"
            aria-label="Stäng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

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

      {items.length > 0 && (
        <div className="border rounded-lg overflow-hidden bg-card">
          <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/40">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Produkt</span>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Packat</span>
          </div>
          <div className="divide-y divide-border/30 max-h-[calc(100vh-220px)] overflow-y-auto">
            {items.map(item => renderItemRow(item, false))}
          </div>
        </div>
      )}

      <QRScanner isActive={isQRActive} onScan={enqueueScan} onClose={() => setIsQRActive(false)} skipCamera={false} />

      {/* Kolli confirmation dialog */}
      <AlertDialog open={showKolliConfirm} onOpenChange={setShowKolliConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Starta nytt kolli?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {Object.keys(itemParcelMap).length > 0
                ? `Du har redan ${new Set(Object.values(itemParcelMap)).size} kolli. Ett nytt kolli skapas och scannade produkter tilldelas dit.`
                : 'Ett nytt kolli skapas. Produkter du scannar eller klickar på tilldelas automatiskt till detta kolli.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setShowKolliConfirm(false);
              startKolli(verifierName);
            }}>
              Starta kolli
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
