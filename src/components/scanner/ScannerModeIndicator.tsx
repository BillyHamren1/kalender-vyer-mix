/**
 * Scanner Mode Indicator — Shows active scan mode and reader status
 * Minimal, non-intrusive bar at the top of scanner views
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Radio, Wifi, WifiOff, BarChart3 } from 'lucide-react';
import { ScanMode } from '@/services/scanner/types';

interface ScannerModeIndicatorProps {
  currentMode: ScanMode;
  isBarcodeReady: boolean;
  isRfidReady: boolean;
  isReaderConnected: boolean;
  scanCount: number;
  warning?: string | null;
}

const MODE_LABELS: Record<ScanMode, string> = {
  barcode: 'Streckkod',
  rfid_inventory: 'RFID Inventering',
  rfid_locate: 'RFID Sök',
  mixed: 'Blandat läge',
};

export const ScannerModeIndicator: React.FC<ScannerModeIndicatorProps> = ({
  currentMode,
  isBarcodeReady,
  isRfidReady,
  isReaderConnected,
  scanCount,
  warning,
}) => {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-muted/60 rounded-md text-[11px]">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-[10px] h-5 gap-1">
          <Radio className="h-3 w-3" />
          {MODE_LABELS[currentMode]}
        </Badge>
        {isReaderConnected ? (
          <span className="flex items-center gap-1 text-primary">
            <Wifi className="h-3 w-3" />
            RFD
          </span>
        ) : isRfidReady ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <WifiOff className="h-3 w-3" />
            Ingen reader
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-1 text-muted-foreground">
        <BarChart3 className="h-3 w-3" />
        <span>{scanCount}</span>
      </div>
    </div>
  );
};
