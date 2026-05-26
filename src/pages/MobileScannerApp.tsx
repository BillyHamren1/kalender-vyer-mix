import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { QrCode, Search, Package, Camera, Bug, Loader2, Tag, MapPin, CalendarDays } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { VerificationView } from '@/components/scanner/VerificationView';
import { ManualChecklistView } from '@/components/scanner/ManualChecklistView';
import { ScannerDebugPanel } from '@/components/scanner/ScannerDebugPanel';
import { ScannerModeIndicator } from '@/components/scanner/ScannerModeIndicator';
import { IdentifyScannerOverlay } from '@/components/scanner/IdentifyScannerOverlay';
import { parseScanResult, fetchActivePackings, identifyProduct } from '@/services/scannerService';
import { PackingWithBooking } from '@/types/packing';
import { useScannerController } from '@/hooks/scanner/useScannerController';
import { ScanEvent } from '@/services/scanner/types';
import { toast } from 'sonner';
import { useScannerRealtime } from '@/hooks/scanner/useScannerRealtime';
import CalendarViewToggle, { type CalendarViewMode } from '@/components/mobile-app/calendar/CalendarViewToggle';
import CalendarDateNav from '@/components/mobile-app/calendar/CalendarDateNav';
import PackingDayView from '@/components/scanner/calendar/PackingDayView';
import PackingWeekView from '@/components/scanner/calendar/PackingWeekView';
import PackingMonthView from '@/components/scanner/calendar/PackingMonthView';
import PackingCard from '@/components/scanner/calendar/PackingCard';
import ReturnView from '@/components/scanner/ReturnView';

type AppState = 'home' | 'verifying' | 'manual' | 'returning';
type Flow = 'out' | 'in';

const REALTIME_TABLES = ['packing_projects', 'packing_list_items', 'bookings'];

const MobileScannerApp: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, setState] = useState<AppState>('home');
  const [selectedPackingId, setSelectedPackingId] = useState<string | null>(null);
  const [flow, setFlow] = useState<Flow>('out');
  const [isQRActive, setIsQRActive] = useState(false);
  const [packings, setPackings] = useState<PackingWithBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDebug, setShowDebug] = useState(false);
  const [identifiedProduct, setIdentifiedProduct] = useState<any | null>(null);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [identifyInput, setIdentifyInput] = useState('');
  const [isIdentifyQRActive, setIsIdentifyQRActive] = useState(false);

  // Calendar view state — persisted in localStorage (parity with time app)
  const VIEW_MODE_KEY = 'scanner.calendarView';
  const isViewMode = (v: unknown): v is CalendarViewMode =>
    v === 'day' || v === 'week' || v === 'month';
  const [viewMode, setViewMode] = useState<CalendarViewMode>(() => {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    return isViewMode(stored) ? stored : 'day';
  });
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  // Active scan handler ref — receives the FULL ScanEvent so the active view
  // can distinguish source (RFID vs barcode), symbology, etc.
  const activeScanHandler = useRef<(scan: ScanEvent) => void>(() => {});

  // Central scanner controller — ALWAYS active, single instance for entire app
  const scanner = useScannerController({
    onScan: useCallback((scan: ScanEvent) => {
      if (scan.isDuplicate) return;

      console.log('[SCAN] scanner_event_received', {
        source: scan.source,
        type: scan.type,
        value: scan.value,
        symbology: scan.symbology,
      });

      // Forward the full ScanEvent — preserves source/type/symbology/rawData
      console.log('[SCAN] scanner_event_routed_to_view');
      activeScanHandler.current(scan);
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
      activeScanHandler.current = (scan: ScanEvent) => { handleBarcodeScan(scan.value); };
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

  // Pinned in-progress packings (across all dates) — surfaced above calendar
  // so users don't lose an active job when navigating away from today.
  // Includes both outbound (in_progress) and return (returning) work.
  const inProgressPackings = useMemo(
    () => filteredPackings.filter(p => p.status === 'in_progress' || p.status === 'returning'),
    [filteredPackings],
  );

  // Deep-link from Lager: /m/tools/scanner?packingId=...&mode=out|in
  // Also accepts packlistId (alias) and bookingId (resolved via loaded packings).
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current) return;
    if (isLoading) return;
    if (state !== 'home') return;

    const packingIdParam = searchParams.get('packingId') || searchParams.get('packlistId');
    const bookingIdParam = searchParams.get('bookingId');
    const modeParam = (searchParams.get('mode') || 'out').toLowerCase();
    const flowParam: Flow = modeParam === 'in' ? 'in' : 'out';

    if (!packingIdParam && !bookingIdParam) return;

    deepLinkHandled.current = true;

    let resolvedPackingId: string | null = packingIdParam;
    if (!resolvedPackingId && bookingIdParam) {
      const match = packings.find((p) => p.booking_id === bookingIdParam);
      resolvedPackingId = match?.id ?? null;
    }

    const next = new URLSearchParams(searchParams);
    next.delete('packingId');
    next.delete('packlistId');
    next.delete('bookingId');
    next.delete('mode');
    setSearchParams(next, { replace: true });

    if (!resolvedPackingId) {
      toast.error(
        bookingIdParam && !packingIdParam
          ? 'Packningen kunde inte laddas.'
          : 'Den här lageruppgiften saknar packnings-ID. Öppna packningen från warehouse eller kontakta planering.',
      );
      return;
    }

    setSelectedPackingId(resolvedPackingId);
    setFlow(flowParam);
    setState(flowParam === 'in' ? 'returning' : 'verifying');
  }, [isLoading, packings, searchParams, setSearchParams, state]);

  // Handle packing selection with mode + flow direction
  const handleSelectPacking = (
    packingId: string,
    mode: 'verifying' | 'manual',
    kind: 'out' | 'in' = 'out',
  ) => {
    setSelectedPackingId(packingId);
    setFlow(kind);
    if (kind === 'in') {
      setState('returning');
    } else {
      setState(mode);
    }
  };

  // Go back to home
  const goHome = () => {
    setState('home');
    setSelectedPackingId(null);
    setIsQRActive(false);
    setFlow('out');
  };

  // Render based on state
  if (state === 'verifying' && selectedPackingId) {
    return (
      <div className="h-[100dvh] bg-background overflow-hidden">
        <VerificationView 
          packingId={selectedPackingId}
          onBack={goHome}
          registerScanHandler={(handler) => {
            // VerificationView still consumes scan.value internally — wrap to preserve full event downstream
            activeScanHandler.current = (scan: ScanEvent) => handler(scan.value);
          }}
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
      <div className="min-h-screen bg-background p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <ManualChecklistView 
          packingId={selectedPackingId}
          onBack={goHome}
        />
      </div>
    );
  }

  if (state === 'returning' && selectedPackingId) {
    return (
      <div className="min-h-screen bg-background p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <ReturnView
          packingId={selectedPackingId}
          onBack={goHome}
          registerScanHandler={(handler) => { activeScanHandler.current = handler; }}
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
            placeholder="Sök packlista, kund..."
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
        ) : searchQuery.trim() ? (
          // Search active → flat results, ignore date filter
          <div className="space-y-2">
            {filteredPackings.map(p => (
              <PackingCard key={p.id} packing={p} onSelect={handleSelectPacking} />
            ))}
          </div>
        ) : (
          <>
            {/* Pinned: in-progress jobs across all dates */}
            {inProgressPackings.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Pågående nu
                </h2>
                <div className="space-y-2">
                  {inProgressPackings.map(p => (
                    <PackingCard
                      key={p.id}
                      packing={p}
                      kind={p.status === 'returning' ? 'in' : 'out'}
                      onSelect={handleSelectPacking}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Calendar — Day / Week / Month, parity with time app */}
            <section className="space-y-3">
              <CalendarViewToggle value={viewMode} onChange={setViewMode} />
              <CalendarDateNav
                viewMode={viewMode}
                selectedDate={selectedDate}
                onChange={setSelectedDate}
              />
              {viewMode === 'day' && (
                <PackingDayView
                  date={selectedDate}
                  packings={filteredPackings}
                  onSelect={handleSelectPacking}
                  onShowWeek={() => setViewMode('week')}
                />
              )}
              {viewMode === 'week' && (
                <PackingWeekView
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                  packings={filteredPackings}
                  onSelect={handleSelectPacking}
                />
              )}
              {viewMode === 'month' && (
                <PackingMonthView
                  selectedDate={selectedDate}
                  onSelectDate={(d) => {
                    setSelectedDate(d);
                    setViewMode('day');
                  }}
                  packings={filteredPackings}
                />
              )}
            </section>
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
