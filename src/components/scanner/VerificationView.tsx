import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, Check, Package, RefreshCw, Camera, Bluetooth, Calendar, MapPin, AlertCircle, Barcode } from 'lucide-react';
import { fetchPackingListItems, verifyProductBySku, getVerificationProgress, parseScanResult } from '@/services/scannerService';
import { fetchPacking } from '@/services/packingService';
import { PackingWithBooking } from '@/types/packing';
import { QRScanner } from './QRScanner';
import { BluetoothRFID } from './BluetoothRFID';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

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
  const [showProducts, setShowProducts] = useState(true);

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

  const unverifiedItems = items.filter(item => !item.verified_at);
  const verifiedItems = items.filter(item => item.verified_at);

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
        <Button variant="ghost" size="icon" onClick={loadData}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Booking details card */}
      {packing?.booking && (
        <Card className="bg-muted/30">
          <CardContent className="py-3 space-y-2">
            {packing.booking.eventdate && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Eventdatum:</span>
                <span>{format(new Date(packing.booking.eventdate), 'd MMMM yyyy', { locale: sv })}</span>
              </div>
            )}
            {packing.booking.rigdaydate && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Rigg:</span>
                <span>{format(new Date(packing.booking.rigdaydate), 'd MMMM yyyy', { locale: sv })}</span>
              </div>
            )}
            {packing.booking.deliveryaddress && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="line-clamp-2">{packing.booking.deliveryaddress}</span>
              </div>
            )}
            {packing.booking.booking_number && (
              <div className="flex items-center gap-2 text-sm">
                <Barcode className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono">#{packing.booking.booking_number}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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

      {/* No items warning */}
      {items.length === 0 && (
        <Card className="border-amber-500/50 bg-amber-50">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">Inga produkter i packlistan</p>
                <p className="text-sm text-amber-700 mt-1">
                  Packlistan har inte genererats än. Gå till "Planera packning" i webgränssnittet för att skapa packlistan baserat på bokningens produkter.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scan instructions */}
      {items.length > 0 && unverifiedItems.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-3">
            <div className="flex items-start gap-3">
              <Barcode className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Skanna produkternas SKU</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Skanna streckkoden eller QR-koden på produkten. SKU-numret matchas automatiskt mot listan.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
      {items.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <button 
              onClick={() => setShowProducts(!showProducts)}
              className="flex items-center justify-between w-full"
            >
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4" />
                Packlista
              </CardTitle>
              <Badge variant={progress.verified === progress.total && progress.total > 0 ? "default" : "secondary"}>
                {progress.verified}/{progress.total}
              </Badge>
            </button>
          </CardHeader>
          {showProducts && (
            <CardContent className="p-0">
              {/* Table header */}
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Produkt</span>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Packat</span>
              </div>
              
              <div className="divide-y divide-border/30">
                {/* All items in order */}
                {items.map(item => {
                  const name = item.booking_products?.name || 'Okänd produkt';
                  const isChild = name.startsWith('↳') || name.startsWith('└') || name.startsWith('L,');
                  const sku = item.booking_products?.sku;
                  const packed = item.quantity_packed || 0;
                  const total = item.quantity_to_pack;
                  const isComplete = packed >= total;
                  const isPartial = packed > 0 && packed < total;
                  
                  return (
                    <button 
                      key={item.id}
                      onClick={() => sku && handleScan(sku)}
                      disabled={!sku || isComplete}
                      className={`w-full flex items-center gap-3 text-left transition-colors ${
                        isComplete 
                          ? 'bg-green-50/70' 
                          : isPartial 
                            ? 'bg-amber-50/50 hover:bg-amber-50/80' 
                            : 'hover:bg-muted/40 active:bg-muted/60'
                      } ${isChild ? 'pl-8 pr-3 py-2' : 'px-3 py-3'} ${!sku && !isComplete ? 'opacity-50' : ''}`}
                    >
                      {/* Status indicator circle */}
                      <div className={`shrink-0 rounded-full flex items-center justify-center ${
                        isChild ? 'w-5 h-5' : 'w-6 h-6'
                      } ${
                        isComplete 
                          ? 'bg-green-500' 
                          : isPartial 
                            ? 'bg-amber-500' 
                            : 'border-2 border-muted-foreground/40'
                      }`}>
                        {isComplete && <Check className="text-white w-3 h-3" />}
                        {isPartial && <span className="text-white text-[10px] font-bold">{packed}</span>}
                      </div>
                      
                      {/* Product name */}
                      {/* Product name */}
                      <div className="flex-1 min-w-0">
                        <span className={`block truncate ${
                          isChild 
                            ? 'text-xs' 
                            : 'text-sm font-semibold'
                        } ${
                          isComplete 
                            ? 'text-green-700' 
                            : isPartial 
                              ? 'text-amber-800'
                              : isChild 
                                ? 'text-muted-foreground' 
                                : 'text-foreground'
                        }`}>
                          {isChild 
                            ? name.charAt(0) + name.slice(1).charAt(0) + name.slice(2).toLowerCase()
                            : name.toUpperCase()
                          }
                        </span>
                      </div>
                      
                      {/* Quantity badge: packed/total */}
                      <div className={`shrink-0 min-w-[50px] flex items-center justify-center rounded px-2 py-1 ${
                        isComplete 
                          ? 'bg-green-100 text-green-700' 
                          : isPartial 
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-muted/60 text-muted-foreground'
                      }`}>
                        <span className={`font-mono font-bold ${isChild ? 'text-xs' : 'text-sm'}`}>
                          {packed}/{total}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>
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