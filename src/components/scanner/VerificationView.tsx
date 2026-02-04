import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, Check, Package, RefreshCw, Camera, Bluetooth } from 'lucide-react';
import { fetchPackingListItems, verifyProductBySku, getVerificationProgress, parseScanResult } from '@/services/scannerService';
import { fetchPacking } from '@/services/packingService';
import { PackingWithBooking } from '@/types/packing';
import { QRScanner } from './QRScanner';
import { BluetoothRFID } from './BluetoothRFID';

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
  } | null;
}

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold line-clamp-1">{packing?.name}</h1>
          {packing?.booking?.client && (
            <p className="text-sm text-muted-foreground">{packing.booking.client}</p>
          )}
        </div>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Verifiering</span>
            <span className="text-sm text-muted-foreground">
              {progress.verified} / {progress.total}
            </span>
          </div>
          <Progress value={progress.percentage} className="h-3" />
          <p className="text-center text-2xl font-bold mt-2 text-primary">
            {progress.percentage}%
          </p>
        </CardContent>
      </Card>

      {/* Scan buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button 
          onClick={() => setIsQRActive(true)}
          className="h-auto py-4 flex-col gap-2"
        >
          <Camera className="h-6 w-6" />
          <span>Skanna QR</span>
        </Button>
        <Button 
          variant="outline"
          className="h-auto py-4 flex-col gap-2"
          disabled
        >
          <Bluetooth className="h-6 w-6" />
          <span>RFID aktiv</span>
        </Button>
      </div>

      {/* Bluetooth RFID panel */}
      <BluetoothRFID onScan={handleScan} />

      {/* Last scan result */}
      {lastScan && (
        <Card className={lastScan.success ? 'border-green-500/50 bg-green-50' : 'border-red-500/50 bg-red-50'}>
          <CardContent className="py-3">
            <p className="text-sm">
              <span className="font-medium">Senast skannad:</span>{' '}
              <span className="font-mono">{lastScan.value}</span>
            </p>
            <p className={`text-sm font-medium ${lastScan.success ? 'text-green-700' : 'text-red-700'}`}>
              {lastScan.result}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Product list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Produkter
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {items.map(item => (
              <div 
                key={item.id}
                className={`p-3 flex items-center gap-3 ${
                  item.verified_at ? 'bg-green-50' : ''
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  item.verified_at 
                    ? 'bg-green-500 text-white' 
                    : 'bg-muted'
                }`}>
                  {item.verified_at ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {item.quantity_packed}/{item.quantity_to_pack}
                    </span>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-sm line-clamp-1 ${
                    item.verified_at ? 'text-green-800' : ''
                  }`}>
                    {item.booking_products?.name || 'Okänd produkt'}
                  </p>
                  {item.booking_products?.sku && (
                    <p className="text-xs text-muted-foreground font-mono">
                      SKU: {item.booking_products.sku}
                    </p>
                  )}
                </div>

                <Badge variant="outline" className="shrink-0">
                  x{item.quantity_to_pack}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* QR Scanner overlay */}
      <QRScanner 
        isActive={isQRActive}
        onScan={handleScan}
        onClose={() => setIsQRActive(false)}
      />
    </div>
  );
};
