import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QrCode, Radio, Package } from 'lucide-react';
import { PackingSelector } from '@/components/scanner/PackingSelector';
import { VerificationView } from '@/components/scanner/VerificationView';
import { QRScanner } from '@/components/scanner/QRScanner';
import { parseScanResult } from '@/services/scannerService';
import { toast } from 'sonner';

type AppState = 'home' | 'selecting' | 'scanning' | 'verifying';

const MobileScannerApp: React.FC = () => {
  const [state, setState] = useState<AppState>('home');
  const [selectedPackingId, setSelectedPackingId] = useState<string | null>(null);
  const [isQRActive, setIsQRActive] = useState(false);

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

  // Handle packing selection
  const handleSelectPacking = (packingId: string) => {
    setSelectedPackingId(packingId);
    setState('verifying');
  };

  // Go back to home
  const goHome = () => {
    setState('home');
    setSelectedPackingId(null);
    setIsQRActive(false);
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

  if (state === 'selecting') {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="mb-4">
          <Button variant="ghost" onClick={goHome}>
            ← Tillbaka
          </Button>
        </div>
        <h1 className="text-xl font-bold mb-4">Välj packlista</h1>
        <PackingSelector onSelect={handleSelectPacking} />
      </div>
    );
  }

  // Home screen
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-primary text-primary-foreground p-4 text-center">
        <h1 className="text-xl font-bold">Lagerscanner</h1>
        <p className="text-sm opacity-80">QR & RFID-verifiering</p>
      </header>

      {/* Main content */}
      <main className="flex-1 p-4 space-y-4">
        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-4">
          <Card 
            className="cursor-pointer hover:bg-accent transition-colors active:scale-[0.98]"
            onClick={() => setIsQRActive(true)}
          >
            <CardContent className="p-6 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <QrCode className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-semibold">Skanna QR</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Öppna packlista via QR-kod
              </p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:bg-accent transition-colors active:scale-[0.98]"
            onClick={() => setState('selecting')}
          >
            <CardContent className="p-6 flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Package className="h-7 w-7 text-primary" />
              </div>
              <h3 className="font-semibold">Välj lista</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Bläddra bland packlistor
              </p>
            </CardContent>
          </Card>
        </div>

        {/* RFID status */}
        <Card className="border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Radio className="h-4 w-4" />
              RFID-scanner
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              RFID-scannern aktiveras automatiskt när du öppnar en packlista.
              Om din scanner fungerar i HID-läge (som tangentbord), börja bara skanna!
            </p>
          </CardContent>
        </Card>

        {/* Info */}
        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <h3 className="font-medium mb-2">Så här fungerar det:</h3>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Skanna QR-koden på packlistan eller välj från listan</li>
              <li>Skanna varje produkt med RFID eller QR</li>
              <li>Produkten markeras automatiskt som verifierad</li>
              <li>Fortsätt tills alla produkter är klara</li>
            </ol>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="p-4 text-center text-sm text-muted-foreground border-t">
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
