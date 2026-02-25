import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { QrCode, Search, Calendar, Package, ClipboardCheck, Camera } from 'lucide-react';
import { VerificationView } from '@/components/scanner/VerificationView';
import { ManualChecklistView } from '@/components/scanner/ManualChecklistView';
import { QRScanner } from '@/components/scanner/QRScanner';
import { parseScanResult, fetchActivePackings } from '@/services/scannerService';
import { PackingWithBooking } from '@/types/packing';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

type AppState = 'home' | 'verifying' | 'manual';

const MobileScannerApp: React.FC = () => {
  const [state, setState] = useState<AppState>('home');
  const [selectedPackingId, setSelectedPackingId] = useState<string | null>(null);
  const [isQRActive, setIsQRActive] = useState(false);
  const [packings, setPackings] = useState<PackingWithBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch packings on mount
  useEffect(() => {
    const loadPackings = async () => {
      try {
        setIsLoading(true);
        const data = await fetchActivePackings();
        setPackings(data);
      } catch (error) {
        console.error('Error loading packings:', error);
        toast.error('Kunde inte ladda packlistor');
      } finally {
        setIsLoading(false);
      }
    };
    loadPackings();
  }, []);

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

  // Group packings: in_progress vs rest
  const { inProgress, upcoming } = useMemo(() => {
    const inProgress = filteredPackings.filter(p => p.status === 'in_progress');
    const upcoming = filteredPackings.filter(p => p.status !== 'in_progress');
    return { inProgress, upcoming };
  }, [filteredPackings]);

  // Handle QR scan from home screen
  const handleHomeScan = useCallback((scannedValue: string) => {
    const result = parseScanResult(scannedValue);
    
    if (result.type === 'packing_id' && result.packingId) {
      setSelectedPackingId(result.packingId);
      setState('verifying');
      setIsQRActive(false);
      toast.success('Packlista hittad!');
    } else {
      toast.error('QR-koden innehåller inte en giltig packlista');
    }
  }, []);

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
    if (status === 'in_progress') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent text-accent-foreground border border-primary/20">
          Pågående
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
        Planering
      </span>
    );
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
            <span className="text-xs">Scanna</span>
          </Button>
          <Button 
            size="sm" 
            variant="outline"
            className="flex-1 gap-1.5 h-9"
            onClick={() => handleSelectPacking(packing.id, 'manual')}
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
            <span className="text-xs">Bocka av</span>
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
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-primary text-primary-foreground p-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Lagerscanner</h1>
          <p className="text-xs opacity-80">QR & RFID-verifiering</p>
        </div>
        <Button 
          variant="secondary" 
          size="sm"
          className="gap-1.5"
          onClick={() => setIsQRActive(true)}
        >
          <QrCode className="h-4 w-4" />
          <span className="text-xs">Skanna</span>
        </Button>
      </header>

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
              {searchQuery ? 'Inga packlistor matchar sökningen' : 'Inga aktiva packlistor'}
            </p>
          </div>
        ) : (
          <>
            {/* In progress section */}
            {inProgress.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Pågående
                </h2>
                <div className="space-y-2">
                  {inProgress.map(renderPackingCard)}
                </div>
              </section>
            )}

            {/* Upcoming section */}
            {upcoming.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  {inProgress.length > 0 ? 'Kommande' : 'Packlistor'}
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
        <p>v1.0.0 • Native Scanner App</p>
      </footer>

      {/* QR Scanner overlay */}
      <QRScanner 
        isActive={isQRActive}
        onScan={handleHomeScan}
        onClose={() => setIsQRActive(false)}
      />
    </div>
  );
};

export default MobileScannerApp;
