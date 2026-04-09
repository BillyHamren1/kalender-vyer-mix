/**
 * Scanner Mode Indicator — Shows active scan mode and reader status
 * Supports interactive mode switching when onModeChange is provided
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Radio, Wifi, WifiOff, BarChart3, Scan } from 'lucide-react';
import { ScanMode } from '@/services/scanner/types';

interface ScannerModeIndicatorProps {
  currentMode: ScanMode;
  isBarcodeReady: boolean;
  isRfidReady: boolean;
  isReaderConnected: boolean;
  scanCount: number;
  warning?: string | null;
  onModeChange?: (mode: ScanMode) => void;
}

export const ScannerModeIndicator: React.FC<ScannerModeIndicatorProps> = ({
  currentMode,
  isBarcodeReady,
  isRfidReady,
  isReaderConnected,
  scanCount,
  warning,
  onModeChange,
}) => {
  const isBarcodeActive = currentMode === 'barcode' || currentMode === 'mixed';
  const isRfidActive = currentMode === 'rfid_inventory' || currentMode === 'rfid_locate';

  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-muted/60 rounded-md text-[11px]">
      <div className="flex items-center gap-1.5">
        {onModeChange ? (
          <>
            <button
              onClick={() => onModeChange('barcode')}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-colors ${
                isBarcodeActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
              }`}
            >
              <Scan className="h-3 w-3" />
              Streckkod
            </button>
            {isRfidReady && (
              <button
                onClick={() => onModeChange('rfid_inventory')}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold transition-colors ${
                  isRfidActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
                }`}
              >
                <Radio className="h-3 w-3" />
                RFID
              </button>
            )}
          </>
        ) : (
          <Badge variant="secondary" className="text-[10px] h-5 gap-1">
            <Radio className="h-3 w-3" />
            {currentMode === 'barcode' ? 'Streckkod' : currentMode === 'rfid_inventory' ? 'RFID Inventering' : currentMode === 'rfid_locate' ? 'RFID Sök' : 'Blandat läge'}
          </Badge>
        )}
        {isRfidReady && (
          isReaderConnected ? (
            <span className="flex items-center gap-1 text-primary">
              <Wifi className="h-3 w-3" />
              RFD
            </span>
          ) : (
            <span className="flex items-center gap-1 text-destructive">
              <WifiOff className="h-3 w-3" />
              Ej ansluten
            </span>
          )
        )}
      </div>
      <div className="flex items-center gap-1 text-muted-foreground">
        <BarChart3 className="h-3 w-3" />
        <span>{scanCount}</span>
      </div>
    </div>
  );
};
