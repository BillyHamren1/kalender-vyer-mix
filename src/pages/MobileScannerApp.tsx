import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { QrCode, Search, Calendar, Package, ClipboardCheck, Camera, Bug, Radio, Loader2, Tag, MapPin, CalendarDays } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { VerificationView } from '@/components/scanner/VerificationView';
import { ManualChecklistView } from '@/components/scanner/ManualChecklistView';
import { QRScanner } from '@/components/scanner/QRScanner';
import { ScannerDebugPanel } from '@/components/scanner/ScannerDebugPanel';
import { ScannerModeIndicator } from '@/components/scanner/ScannerModeIndicator';
import { ProductIdentifyCard } from '@/components/scanner/ProductIdentifyCard';
import { IdentifyScannerOverlay } from '@/components/scanner/IdentifyScannerOverlay';
import { parseScanResult, fetchActivePackings, identifyProduct } from '@/services/scannerService';
import { PackingWithBooking } from '@/types/packing';
import { useScannerController } from '@/hooks/scanner/useScannerController';
import { ScanEvent } from '@/services/scanner/types';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { useScannerRealtime } from '@/hooks/scanner/useScannerRealtime';

type AppState = 'home' | 'verifying' | 'manual';

const REALTIME_TABLES = ['packing_projects', 'packing_list_items', 'bookings'];

const MobileScannerApp: React.FC = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<AppState>('home');
  const [selectedPackingId, setSelectedPackingId] = useState<string | null>(null);
  const [isQRActive, setIsQRActive] = useState(false);
  const [packings, setPackings] = useState<PackingWithBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [identifiedProduct, setIdentifiedProduct] = useState<any | null>(null);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [identifyInput, setIdentifyInput] = useState('');
  const [isIdentifyQRActive, setIsIdentifyQRActive] = useState(false);

  // Active scan handler ref — points to the correct handler based on current state
  const activeScanHandler = useRef<(value: string) => void>(() => {});

  // Central scanner controller — ALWAYS active, single instance for entire app
  const scanner = useScannerController({
    onScan: useCallback((scan: ScanEvent) => {
      if (scan.isDuplicate) return;
      
      console.log('[MobileScannerApp] Scan received:', scan.source, scan.value);
      
      // Both barcode AND RFID tags go through the same handler pipeline
      activeScanHandler.current(scan.value);
    }, []),
    initialMode: 'barcode',
    autoInit: true, // Always active — no race conditions
  });

  // Play a short beep for scan feedback
  const playBeep = useCallback((success: boolean) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = success ? 1200 : 400;
      osc.type = 'square';
      gain.gain.value = 0.15;
      osc.start();
      osc.stop(ctx.currentTime + (success ? 0.1 : 0.25));
    } catch {}
  }, []);

  // Flash state for visual feedback
  const [scanFlash, setScanFlash] = useState<'success' | 'error' | null>(null);

  const flashScan = useCallback((type: 'success' | 'error') => {
    setScanFlash(type);
    setTimeout(() => setScanFlash(null), 600);
  }, []);

  // Identify a product by scanned value
  const doIdentify = useCallback(async (scannedValue: string) => {
    if (isIdentifying || !scannedValue.trim()) return;
    setIdentifyInput(scannedValue.trim());
    setIsIdentifying(true);
    setIdentifiedProduct(null);
    playBeep(true);
    flashScan('success');
    toast.loading('Searching...', { id: 'identify' });
    try {
      const productResult = await identifyProduct(scannedValue.trim());
      toast.dismiss('identify');
      if (productResult.found) {
        setIdentifiedProduct(productResult);
        toast.success(`Found: ${productResult.name}`);
      } else {
        playBeep(false);
        flashScan('error');
        toast.error(productResult.error || `Product "${scannedValue}" not found`);
      }
    } catch (err: any) {
      toast.dismiss('identify');
      playBeep(false);
      flashScan('error');
      toast.error(err.message || 'Could not identify product');
    } finally {
      setIsIdentifying(false);
    }
  }, [isIdentifying, playBeep, flashScan]);

  // Handle barcode scan on home screen — navigates to packing or identifies product
  const handleBarcodeScan = useCallback(async (scannedValue: string) => {
    const result = parseScanResult(scannedValue);
    
    if (result.type === 'packing_id' && result.packingId) {
      setSelectedPackingId(result.packingId);
      setState('verifying');
      setIsQRActive(false);
      toast.success('Packing list found!');
    } else {
      doIdentify(scannedValue);
    }
  }, [doIdentify]);
  // Update active scan handler when state changes
  useEffect(() => {
    if (state === 'home') {
      activeScanHandler.current = handleBarcodeScan;
    }
  }, [state, handleBarcodeScan]);

  // Load packings
  const loadPackings = useCallback(async () => {
    try {
      const data = await fetchActivePackings();
      setPackings(data);
    } catch (error) {
      console.error('Error loading packings:', error);
    }
  }, []);

  // Fetch packings on mount
  useEffect(() => {
    const init = async () => {
      try {
        setIsLoading(true);
        await loadPackings();
      } catch (error) {
        toast.error('Could not load packing lists');
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [loadPackings]);

  // Realtime subscription + 30s polling fallback (only on home screen)
  useScannerRealtime({
    tables: REALTIME_TABLES,
    onChanged: loadPackings,
    pollingInterval: 30000,
    enabled: state === 'home',
  });

  // Filter packings by search query
  const filteredPackings = useMemo(() => {
    if (!searchQuery.trim()) return packings;
    const query = searchQuery.toLowerCase();
    return packings.filter(p => 
      p.name.toLowerCase().includes(query) ||
      p.booking?.client?.toLowerCase().includes(query) ||
      p.booking?.booking_number?.toLowerCase().includes(query)
    );
  }, [packings, searchQuery]);

  // Group packings: in_progress first, then packed, then planning
  const { inProgress, packed, upcoming } = useMemo(() => {
    const inProgress = filteredPackings.filter(p => p.status === 'in_progress');
    const packed = filteredPackings.filter(p => p.status === 'packed');
    const upcoming = filteredPackings.filter(p => p.status === 'planning');
    return { inProgress, packed, upcoming };
  }, [filteredPackings]);

  // Handle QR scan from camera
  const handleHomeScan = useCallback((scannedValue: string) => {
    // Close the camera overlay so the user can see results
    setIsQRActive(false);
    // Camera scans go through the same flow
    scanner.submitManualScan(scannedValue, 'camera');
    handleBarcodeScan(scannedValue);
  }, [scanner, handleBarcodeScan]);

  // Handle packing selection with mode
  const handleSelectPacking = (packingId: string, mode: 'verifying' | 'manual') => {
    setSelectedPackingId(packingId);
    setState(mode);
  };

  // Go back to home
  const goHome = () => {
    setState('home');
    setSelectedPackingId(null);
    setIsQRActive(false);
  };

  // Format date nicely
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return null;
    try {
      return format(new Date(dateString), 'd MMM', { locale: sv });
    } catch {
      return null;
    }
  };

  // Get status badge style
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'in_progress':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent text-accent-foreground border border-primary/20">
            In progress
          </span>
        );
      case 'packed':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/15 text-primary border border-primary/30">
            Packed ✓
          </span>
        );
      case 'delivered':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
            Delivered
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
            Planning
          </span>
        );
    }
  };

  // Render packing card
  const renderPackingCard = (packing: PackingWithBooking) => {
    const displayDate = formatDate(packing.booking?.rigdaydate) || formatDate(packing.booking?.eventdate);
    
    return (
      <Card 
        key={packing.id}
        className="p-3 transition-all"
      >
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="font-medium text-sm truncate">{packing.name}</span>
            </div>
            {packing.booking?.client && (
              <p className="text-xs text-muted-foreground truncate pl-5">
                {packing.booking.client}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {getStatusBadge(packing.status)}
            {displayDate && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {displayDate}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            size="sm" 
            className="flex-1 gap-1.5 h-9"
            onClick={() => handleSelectPacking(packing.id, 'verifying')}
          >
            <Camera className="h-3.5 w-3.5" />
            <span className="text-xs">Scan</span>
          </Button>
          <Button 
            size="sm" 
            variant="outline"
            className="flex-1 gap-1.5 h-9"
            onClick={() => handleSelectPacking(packing.id, 'manual')}
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            <span className="text-xs">Check off</span>
          </Button>
        </div>
      </Card>
    );
  };

  // Render based on state
  if (state === 'verifying' && selectedPackingId) {
    return (
      <div className="min-h-screen bg-background p-4">
        <VerificationView 
          packingId={selectedPackingId}
          onBack={goHome}
          registerScanHandler={(handler) => { activeScanHandler.current = handler; }}
          scannerState={{
            currentMode: scanner.currentMode,
            isBarcodeReady: scanner.isBarcodeReady,
            isRfidReady: scanner.isRfidReady,
            isReaderConnected: scanner.isReaderConnected,
            scanCount: scanner.scanCount,
            warning: scanner.warning,
          }}
          rfidControls={{
            startInventory: scanner.startInventory,
            stopInventory: scanner.stopInventory,
          }}
        />
      </div>
    );
  }

  if (state === 'manual' && selectedPackingId) {
    return (
      <div className="min-h-screen bg-background p-4">
        <ManualChecklistView 
          packingId={selectedPackingId}
          onBack={goHome}
        />
      </div>
    );
  }

  // Home screen with packing list
  return (
    <div className="min-h-screen bg-background flex flex-col relative">
      {/* Scan flash overlay */}
      {scanFlash && (
        <div className={`absolute inset-0 z-[60] pointer-events-none transition-opacity duration-300 ${
          scanFlash === 'success' ? 'bg-green-500/15' : 'bg-red-500/15'
        } animate-in fade-in-0 fade-out-0`} />
      )}
      {/* Header */}
      <header className="bg-primary text-primary-foreground p-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Warehouse Scanner</h1>
          <p className="text-xs opacity-80">Zebra TC22 • Barcode & RFID</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon"
            className="text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 h-8 w-8"
            onClick={() => setShowDebug(!showDebug)}
          >
            <Bug className="h-4 w-4" />
          </Button>
          <Button 
            variant="secondary" 
            size="sm"
            className="gap-1.5"
            onClick={() => setIsIdentifyQRActive(true)}
          >
            <QrCode className="h-4 w-4" />
            <span className="text-xs">Scan</span>
          </Button>
        </div>
      </header>

      {/* Scanner mode indicator */}
      <div className="px-3 pt-2">
        <ScannerModeIndicator
          currentMode={scanner.currentMode}
          isBarcodeReady={scanner.isBarcodeReady}
          isRfidReady={scanner.isRfidReady}
          isReaderConnected={scanner.isReaderConnected}
          scanCount={scanner.scanCount}
          warning={scanner.warning}
          onModeChange={scanner.switchMode}
        />
      </div>

      {/* Warning banner */}
      {scanner.warning && (
        <div className="mx-3 mt-2 px-3 py-1.5 bg-amber-100 text-amber-800 rounded-md text-[11px]">
          {scanner.warning}
        </div>
      )}

      {/* Debug Panel */}
      {showDebug && (
        <div className="px-3 pt-2">
          <ScannerDebugPanel onClose={() => setShowDebug(false)} />
        </div>
      )}

      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search packing list, client..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* Identify Product */}
      <div className="px-3 pt-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Identify product</span>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Scan or type barcode / SKU..."
              value={identifyInput}
              onChange={(e) => setIdentifyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doIdentify(identifyInput)}
              className="h-9 flex-1"
            />
            <Button
              size="sm"
              className="h-9 gap-1"
              onClick={() => setIsIdentifyQRActive(true)}
            >
              <Camera className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              className="h-9"
              disabled={isIdentifying || !identifyInput.trim()}
              onClick={() => doIdentify(identifyInput)}
            >
              {isIdentifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {/* Inline result */}
          {identifiedProduct && (
            <div className="mt-3 pt-3 border-t space-y-1.5">
              <div className="flex items-start justify-between">
                <p className="font-medium text-sm">{identifiedProduct.name}</p>
                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => setIdentifiedProduct(null)}>✕</Button>
              </div>
              {identifiedProduct.sku && (
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <Tag className="h-3 w-3" />
                  <span className="font-mono">{identifiedProduct.sku}</span>
                </div>
              )}
              {identifiedProduct.status && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  identifiedProduct.status === 'available' ? 'bg-green-100 text-green-800' :
                  identifiedProduct.status === 'allocated' ? 'bg-blue-100 text-blue-800' :
                  identifiedProduct.status === 'damaged' ? 'bg-red-100 text-red-800' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {identifiedProduct.status === 'available' ? 'Available' :
                   identifiedProduct.status === 'allocated' ? 'Allocated' :
                   identifiedProduct.status === 'reserved' ? 'Reserved' :
                   identifiedProduct.status === 'damaged' ? 'Damaged' :
                   identifiedProduct.status}
                </span>
              )}
              {identifiedProduct.currentBooking && (
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <CalendarDays className="h-3 w-3" />
                  <span>Booking: {identifiedProduct.currentBooking}{identifiedProduct.client ? ` (${identifiedProduct.client})` : ''}</span>
                </div>
              )}
              {identifiedProduct.location && (
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <MapPin className="h-3 w-3" />
                  <span>{identifiedProduct.location}</span>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-3 space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filteredPackings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {searchQuery ? 'No packing lists match the search' : 'No active packing lists'}
            </p>
          </div>
        ) : (
          <>
            {inProgress.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  In progress
                </h2>
                <div className="space-y-2">
                  {inProgress.map(renderPackingCard)}
                </div>
              </section>
            )}

            {packed.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Packed
                </h2>
                <div className="space-y-2">
                  {packed.map(renderPackingCard)}
                </div>
              </section>
            )}

            {upcoming.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  {(inProgress.length > 0 || packed.length > 0) ? 'Upcoming' : 'Packing lists'}
                </h2>
                <div className="space-y-2">
                  {upcoming.map(renderPackingCard)}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="p-3 text-center text-xs text-muted-foreground border-t">
        <p>v2.0.0 • Zebra Enterprise Scanner</p>
      </footer>

      {/* Identify Scanner overlay — keeps camera open across multiple scans.
          Also handles packing labels: navigates to verifying when detected. */}
      <IdentifyScannerOverlay
        isActive={isIdentifyQRActive}
        onClose={() => setIsIdentifyQRActive(false)}
        onPackingDetected={(packingId) => {
          setIsIdentifyQRActive(false);
          setSelectedPackingId(packingId);
          setState('verifying');
        }}
      />
    </div>
  );
};

export default MobileScannerApp;
