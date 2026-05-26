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
import { ArrowLeft, Check, RefreshCw, Camera, AlertCircle, Package, ChevronRight, X, Minus, List, QrCode } from 'lucide-react';
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
import { useScanTimeline } from '@/hooks/scanner/useScanTimeline';
import { clearScanTimeline } from '@/hooks/scanner/scanTimeline';
import { LiveScanStatusBar } from './LiveScanStatusBar';
import { useRfidManager } from '@/hooks/scanner/useRfidManager';
import { useScannerRealtime } from '@/hooks/scanner/useScannerRealtime';
import { useReservationAllocations } from '@/hooks/scanner/useReservationAllocations';
import { getDisplayedProgressForRow } from '@/lib/packing/progress';
import { AddUnknownProductDialog } from './AddUnknownProductDialog';
import { QrParcelManager } from './QrParcelManager';
import { PackingPreflightPanel } from './PackingPreflightPanel';

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
    isKolliMode, activeParcel, itemParcelMap, itemAllocations,
    startKolli, nextKolli, exitKolli, assignToKolli, setParcelMap,
  } = useKolliManager(packingId);

  const activeParcelRef = useRef(activeParcel);
  activeParcelRef.current = activeParcel;

  const { lastScanResult, highlightedItemId, setScanResult, highlightRow, cleanup: cleanupFeedback } = useScanFeedback();

  // Nonce that increments on every new scan result, used to drive the camera
  // overlay's flash/beep regardless of whether the message string changes.
  const scanNonceRef = useRef(0);
  const [scannerFeedback, setScannerFeedback] = useState<{ nonce: number; success: boolean; message?: string; subMessage?: string } | null>(null);
  useEffect(() => {
    if (!lastScanResult) return;
    scanNonceRef.current += 1;
    setScannerFeedback({
      nonce: scanNonceRef.current,
      success: !!lastScanResult.success && !lastScanResult.isMinusScan,
      message: lastScanResult.productName || lastScanResult.value,
      subMessage: lastScanResult.result,
    });
  }, [lastScanResult]);

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
  const [showQrParcels, setShowQrParcels] = useState(false);
  const {
    enqueueScan,
    handleManualToggle,
    recentScans,
    clearSessionDedup,
    pendingUnknownProduct,
    confirmAddUnknown,
    dismissUnknown,
  } = useScanProcessor({
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
    getActiveParcelId: () => activeParcelRef.current?.id ?? null,
    onTriggerSync: triggerSync,
    onRfidTagResult: rfid.recordTagResult,
  });

  // After adding an unknown product, reload data so the new row appears
  const handleConfirmUnknown = useCallback(async (name: string, quantity: number) => {
    const ok = await confirmAddUnknown(name, quantity);
    if (ok) {
      await loadData(true);
    }
  }, [confirmAddUnknown, loadData]);

  // Override rfid to also clear scan dedup on session reset
  const rfidWithReset = useMemo(() => ({
    ...rfid,
    resetSession: () => {
      rfid.resetSession();
      clearSessionDedup();
    },
  }), [rfid, clearSessionDedup]);

  const [showRecentScans, setShowRecentScans] = useState(false);
  const [showScanDebug, setShowScanDebug] = useState(false);
  const scanTimeline = useScanTimeline();

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
    const rawName = item.booking_products?.name || 'Unknown product';
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
    
    // Use shared rule for parent-row collapse so VerificationView, the
    // checklists and the scanner-api status flow agree on what "packed" means.
    // See src/lib/packing/progress.ts.
    const display = getDisplayedProgressForRow(item, items);
    let packed = display.displayedPacked;
    let total = display.displayedTotal;
    
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
              Marked when all parts are packed
            </span>
          )}
        </div>
        
        {/* Parcel allocation badges (multi-parcel aware) */}
        {(() => {
          const allocs = itemAllocations[item.id];
          if (allocs && allocs.length > 0) {
            const totalAllocated = allocs.reduce((s, a) => s + a.quantity, 0);
            const remaining = Math.max(0, info.packed - totalAllocated);
            return (
              <div className="shrink-0 flex items-center gap-1 flex-wrap justify-end max-w-[55%]">
                {allocs.map((a) => (
                  <div key={a.parcelId} className="flex items-center gap-0.5 bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    <Package className="h-3 w-3" />
                    <span className="text-[10px] font-bold">#{a.parcelNumber}</span>
                    {a.quantity > 1 && <span className="text-[9px] font-semibold">×{a.quantity}</span>}
                  </div>
                ))}
                {remaining > 0 && (
                  <div className="flex items-center gap-0.5 bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                    <span className="text-[9px] font-semibold">Inget kolli ×{remaining}</span>
                  </div>
                )}
              </div>
            );
          }
          // Fallback to legacy single badge
          if (showParcelColumn) {
            return parcelNumber ? (
              <div className="shrink-0 flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded">
                <Package className="h-3 w-3" />
                <span className="text-[10px] font-bold">#{parcelNumber}</span>
              </div>
            ) : info.isComplete ? (
              <div className="shrink-0 text-[10px] text-muted-foreground">Inget kolli</div>
            ) : null;
          }
          return parcelNumber ? (
            <div className="shrink-0 flex items-center gap-0.5 text-primary">
              <Package className="h-3 w-3" />
              <span className="text-[10px] font-bold">#{parcelNumber}</span>
            </div>
          ) : null;
        })()}
        
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
          <p className="text-xs mt-1 opacity-90">Skanna eller tryck på produkter för kolli #{activeParcel.parcel_number}</p>
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
            Scan product
          </Button>
        </div>

        <div className="border rounded-lg overflow-hidden bg-card">
          <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/40">
             <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Product</span>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Parcel</span>
          </div>
          <div className="divide-y divide-border/30 max-h-[calc(100vh-320px)] overflow-y-auto">
            {items.map(item => renderItemRow(item, true))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => nextKolli(verifierName)} variant="outline" className="flex-1 gap-2">
            <ChevronRight className="h-4 w-4" />
            Next parcel
          </Button>
          <Button onClick={handleExitKolli} variant="secondary" className="flex-1 gap-2">
            <X className="h-4 w-4" />
            End
          </Button>
        </div>

        <QRScanner isActive={isQRActive} onScan={enqueueScan} onClose={() => setIsQRActive(false)} feedback={scannerFeedback} />

        <AddUnknownProductDialog
          pending={pendingUnknownProduct}
          onConfirm={handleConfirmUnknown}
          onDismiss={dismissUnknown}
        />
      </div>
    );
  }

  // --- Normal verification UI (fixed app shell: header + camera + status + scrollable list) ---
  // Force minus mode = camera always visible (parent shell), no toggle needed.
  // Layout:
  //   ┌ header (shrink-0) ──────────────────────┐
  //   │ status/action row (shrink-0)            │
  //   │ camera tight (shrink-0)                 │
  //   │ live scan status (shrink-0)             │
  //   │ packing list (flex-1, scrolls)          │
  //   │ manual input (shrink-0)                 │
  //   └─────────────────────────────────────────┘
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-card border-b safe-area-top">
        <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold truncate">{packing?.name}</h1>
          {packing?.booking?.client && (
            <p className="text-[11px] text-muted-foreground truncate">{packing.booking.client}</p>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={() => loadData(false)} className="shrink-0 h-8 w-8">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* WMS preflight check (run before scanning) */}
      <div className="shrink-0 px-2 pt-2">
        <PackingPreflightPanel
          packingId={packingId}
          bookingNumber={packing?.booking?.booking_number ?? null}
        />
      </div>
      <div className="shrink-0 px-2 py-1.5 bg-card border-b space-y-1">
        {scannerState && (
          <ScannerModeIndicator
            currentMode={scannerState.currentMode}
            isBarcodeReady={scannerState.isBarcodeReady}
            isRfidReady={scannerState.isRfidReady}
            isReaderConnected={scannerState.isReaderConnected}
            scanCount={scannerState.scanCount}
          />
        )}

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

        {/* Progress + actions on a single line */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <Progress value={progress.percentage} className="h-2 flex-1" />
            <span className="text-[10px] font-mono font-semibold text-muted-foreground whitespace-nowrap">
              {progress.verified}/{progress.total}
            </span>
            <span className="text-[10px] font-bold text-primary whitespace-nowrap">
              {progress.percentage}%
            </span>
          </div>
          <Button
            onClick={() => setIsMinusMode(prev => {
              if (prev) clearSessionDedup();
              return !prev;
            })}
            size="sm"
            variant={isMinusMode ? 'destructive' : 'outline'}
            className="h-7 px-2 gap-1"
            title={isMinusMode ? 'Avsluta minusläge' : 'Aktivera minusläge'}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button
            onClick={() => setShowKolliConfirm(true)}
            size="sm"
            variant="secondary"
            className="h-7 px-2 gap-1 border border-primary/30"
            title="Kolli"
          >
            <Package className="h-3.5 w-3.5 text-primary" />
            {Object.keys(itemParcelMap).length > 0 && (
              <span className="bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {new Set(Object.values(itemParcelMap)).size}
              </span>
            )}
          </Button>
          <Button onClick={() => setShowQrParcels(true)} size="sm" variant="outline" className="h-7 px-2" title="QR-kollin">
            <QrCode className="h-3.5 w-3.5" />
          </Button>
          <Button
            onClick={() => setShowRecentScans(prev => !prev)}
            size="sm"
            variant={showRecentScans ? 'secondary' : 'outline'}
            className="h-7 px-2 relative"
            title="Logg"
          >
            <List className="h-3.5 w-3.5" />
            {recentScans.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {recentScans.length > 99 ? '99' : recentScans.length}
              </span>
            )}
          </Button>
          <Button
            onClick={() => setShowScanDebug(prev => !prev)}
            size="sm"
            variant={showScanDebug ? 'secondary' : 'outline'}
            className="h-7 px-2 text-[10px] font-mono"
            title="Scan debug — visa tider"
          >
            ⏱
          </Button>
        </div>

        {isMinusMode && (
          <div className="bg-destructive text-destructive-foreground rounded px-2 py-1 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5">
              <Minus className="h-3.5 w-3.5" />
              <span className="font-bold">MINUSLÄGE AKTIVT</span>
            </div>
            <span className="opacity-90">Skanning tar bort 1 st</span>
          </div>
        )}
      </div>

      {/* Camera (always mounted, tight crop) */}
      <div className="shrink-0 bg-black border-b">
        <QRScanner
          isActive={true}
          onScan={enqueueScan}
          onClose={() => { /* never closes — always mounted */ }}
          compact
          tight
          cameraHeight="34dvh"
          feedback={scannerFeedback}
        />
      </div>

      {/* Live scan status — derived from scanTimeline (single source, anti-flicker) */}
      <LiveScanStatusBar showTiming={showScanDebug} />

      {/* Scan debug — timing for last 10 scans */}
      {showScanDebug && (
        <div className="shrink-0 border-b bg-card max-h-[40vh] overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/40 sticky top-0">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Scan debug ({scanTimeline.length})
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => clearScanTimeline()} className="text-[10px] px-2 py-0.5 rounded hover:bg-muted text-muted-foreground">
                Rensa
              </button>
              <button onClick={() => setShowScanDebug(false)} className="p-0.5 rounded hover:bg-muted">
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          </div>
          <div className="px-3 py-1.5 text-[9px] font-mono text-muted-foreground border-b grid grid-cols-12 gap-1">
            <span className="col-span-3">Kod</span>
            <span className="col-span-2">Källa</span>
            <span className="col-span-2">Status</span>
            <span className="col-span-1 text-right">cam→proc</span>
            <span className="col-span-2 text-right">api</span>
            <span className="col-span-2 text-right">total</span>
          </div>
          <div className="divide-y divide-border/30">
            {scanTimeline.slice(0, 10).map((e) => {
              const tail = e.value.length > 12 ? `…${e.value.slice(-10)}` : e.value;
              const fmt = (n?: number) => (typeof n === 'number' ? `${Math.round(n)}` : '–');
              const statusColor =
                e.status === 'success' ? 'text-emerald-600'
                : e.status === 'duplicate' ? 'text-amber-600'
                : e.status === 'detected' || e.status === 'queued' || e.status === 'sent_to_backend' ? 'text-sky-600'
                : 'text-red-600';
              return (
                <div key={e.id} className="px-3 py-1 grid grid-cols-12 gap-1 text-[10px] font-mono items-center">
                  <span className="col-span-3 truncate" title={e.value}>{tail}</span>
                  <span className="col-span-2 truncate text-muted-foreground">{e.source}</span>
                  <span className={`col-span-2 truncate ${statusColor}`}>{e.status}</span>
                  <span className="col-span-1 text-right tabular-nums">{fmt(e.cameraToProcessorMs)}</span>
                  <span className="col-span-2 text-right tabular-nums">{fmt(e.apiRoundtripMs)}</span>
                  <span className="col-span-2 text-right tabular-nums font-semibold">{fmt(e.totalScanMs)}</span>
                </div>
              );
            })}
            {scanTimeline.length === 0 && (
              <div className="px-3 py-3 text-[11px] text-muted-foreground text-center">
                Inga scans ännu — gör en skanning för att se tider.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recent scans (collapsible, doesn't push list) */}
      {showRecentScans && recentScans.length > 0 && (
        <div className="shrink-0 border-b bg-card max-h-[28vh] overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/40 sticky top-0">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Senaste skanningar</span>
            <button onClick={() => setShowRecentScans(false)} className="p-0.5 rounded hover:bg-muted">
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          </div>
          <div className="divide-y divide-border/30">
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

      {/* Packing list — the only scrollable region */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-card">
        {items.length === 0 ? (
          <div className="p-3">
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
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/40 sticky top-0 z-10">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Produkt</span>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Packat</span>
            </div>
            <div className="divide-y divide-border/30">
              {items.map(item => renderItemRow(item, false))}
            </div>
          </>
        )}
      </div>

      {/* Manual input (always available, slim) */}
      <div className="shrink-0 border-t bg-card px-2 py-2 safe-area-bottom">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget as HTMLFormElement);
            const v = String(fd.get('manual') || '').trim();
            if (v) {
              enqueueScan(v);
              (e.currentTarget as HTMLFormElement).reset();
            }
          }}
          className="flex gap-1.5"
        >
          <input
            name="manual"
            type="text"
            inputMode="text"
            placeholder="Manuell kod…"
            className="flex-1 min-w-0 px-2.5 py-1.5 rounded border bg-background text-sm focus:outline-none focus:border-primary"
          />
          <Button type="submit" size="sm" className="h-8 px-3 text-xs">
            Skicka
          </Button>
        </form>
      </div>

      {/* Unknown product dialog — pauses the scan queue until user responds */}
      <AddUnknownProductDialog
        pending={pendingUnknownProduct}
        onConfirm={handleConfirmUnknown}
        onDismiss={dismissUnknown}
      />

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
                ? `Du har redan ${new Set(Object.values(itemParcelMap)).size} kollin. Ett nytt kolli skapas och skannade produkter tilldelas det.`
                : 'Ett nytt kolli skapas. Produkter du skannar eller trycker på tilldelas detta kolli automatiskt.'}
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

      <QrParcelManager
        open={showQrParcels}
        onOpenChange={setShowQrParcels}
        packingId={packingId}
        verifierName={verifierName}
      />
    </div>
  );
};
