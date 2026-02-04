import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bluetooth, BluetoothConnected, BluetoothOff, Loader2, Radio } from 'lucide-react';
import { useBluetoothRFID, BluetoothRFIDState } from '@/hooks/useBluetoothRFID';

interface BluetoothRFIDProps {
  onScan: (value: string) => void;
}

export const BluetoothRFID: React.FC<BluetoothRFIDProps> = ({ onScan }) => {
  const {
    isSupported,
    isConnecting,
    isConnected,
    connectedDevice,
    lastScannedValue,
    error,
    connectToDevice,
    disconnect
  } = useBluetoothRFID(onScan);

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <BluetoothConnected className="h-5 w-5 text-primary" />
            ) : (
              <Bluetooth className="h-5 w-5 text-muted-foreground" />
            )}
            <span>RFID Scanner</span>
          </div>
          <Badge variant={isConnected ? 'default' : 'secondary'}>
            {isConnected ? 'Ansluten' : 'Ej ansluten'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isSupported ? (
          <div className="text-center py-4">
            <BluetoothOff className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Bluetooth stöds inte i denna webbläsare.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              RFID-scannern kan fortfarande fungera i HID-läge (som tangentbord).
            </p>
          </div>
        ) : (
          <>
            {isConnected ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-primary animate-pulse" />
                    <span className="text-sm font-medium">{connectedDevice?.name}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={disconnect}
                  >
                    Koppla från
                  </Button>
                </div>
                
                {lastScannedValue && (
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">Senast skannad:</p>
                    <p className="font-mono text-sm">{lastScannedValue}</p>
                  </div>
                )}

                <p className="text-xs text-center text-muted-foreground">
                  Skannar automatiskt när RFID-taggar läses...
                </p>
              </div>
            ) : (
              <div className="text-center py-4">
                <Button
                  onClick={() => connectToDevice()}
                  disabled={isConnecting}
                  className="w-full"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Söker enheter...
                    </>
                  ) : (
                    <>
                      <Bluetooth className="h-4 w-4 mr-2" />
                      Anslut RFID-scanner
                    </>
                  )}
                </Button>
                
                <p className="text-xs text-muted-foreground mt-3">
                  Tips: Om din scanner fungerar som tangentbord (HID-läge),
                  behöver du inte ansluta via Bluetooth – bara skanna!
                </p>
              </div>
            )}
          </>
        )}

        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
