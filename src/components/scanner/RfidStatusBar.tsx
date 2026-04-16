/**
 * RfidStatusBar — Shows RFID reader status and inventory controls
 * Compact bar that sits alongside the existing ScannerModeIndicator
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Radio, Wifi, WifiOff, Loader2, AlertCircle, 
  Play, Square, RotateCcw, Zap, Tag
} from 'lucide-react';
import { RfidConnectionStatus, RfidLastMatch } from '@/hooks/scanner/useRfidManager';

interface RfidStatusBarProps {
  status: RfidConnectionStatus;
  readerModel: string | null;
  error: string | null;
  inventoryActive: boolean;
  totalTagsRead: number;
  uniqueTagsRead: number;
  matchedCount: number;
  unmatchedCount: number;
  lastMatchedProduct: RfidLastMatch | null;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleInventory: () => void;
  onReset: () => void;
}

const STATUS_CONFIG: Record<RfidConnectionStatus, { label: string; className: string; icon: React.ReactNode }> = {
  disconnected: {
    label: 'Disconnected',
    className: 'bg-muted text-muted-foreground',
    icon: <WifiOff className="h-3 w-3" />,
  },
  connecting: {
    label: 'Connecting...',
    className: 'bg-amber-100 text-amber-800 border-amber-300',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  connected: {
    label: 'Connected',
    className: 'bg-green-100 text-green-800 border-green-300',
    icon: <Wifi className="h-3 w-3" />,
  },
  inventory_active: {
    label: 'Inventory',
    className: 'bg-primary/10 text-primary border-primary/30 animate-pulse',
    icon: <Radio className="h-3 w-3" />,
  },
  error: {
    label: 'Error',
    className: 'bg-destructive/10 text-destructive border-destructive/30',
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

export const RfidStatusBar: React.FC<RfidStatusBarProps> = ({
  status,
  readerModel,
  error,
  inventoryActive,
  totalTagsRead,
  uniqueTagsRead,
  matchedCount,
  unmatchedCount,
  lastMatchedProduct,
  onConnect,
  onDisconnect,
  onToggleInventory,
  onReset,
}) => {
  const config = STATUS_CONFIG[status];
  const isConnectedOrActive = status === 'connected' || status === 'inventory_active';

  return (
    <div className="space-y-1.5">
      {/* Status row */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 rounded-md">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`text-[10px] h-5 gap-1 ${config.className}`}>
            {config.icon}
            RFID: {config.label}
          </Badge>
          {readerModel && (
            <span className="text-[10px] text-muted-foreground">{readerModel}</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Connect/Disconnect button */}
          {status === 'disconnected' || status === 'error' ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px] gap-1"
              onClick={onConnect}
            >
              <Zap className="h-3 w-3" />
              Connect
            </Button>
          ) : status === 'connecting' ? null : (
            <>
              {/* Inventory toggle */}
              <Button
                size="sm"
                variant={inventoryActive ? 'destructive' : 'default'}
                className="h-6 px-2 text-[10px] gap-1"
                onClick={onToggleInventory}
              >
                {inventoryActive ? (
                  <>
                    <Square className="h-2.5 w-2.5" />
                    Stop
                  </>
                ) : (
                  <>
                    <Play className="h-2.5 w-2.5" />
                    Start
                  </>
                )}
              </Button>

              {/* Disconnect */}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-1.5 text-[10px]"
                onClick={onDisconnect}
              >
                <WifiOff className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Last matched product */}
      {lastMatchedProduct && (
        <div className="flex items-center gap-2 px-3 py-1 bg-green-50 border border-green-200 rounded text-[11px]">
          <Tag className="h-3 w-3 text-green-600 shrink-0" />
          <span className="font-semibold text-green-800 truncate">{lastMatchedProduct.productName}</span>
          <span className="text-green-600 text-[10px] shrink-0">{lastMatchedProduct.sku}</span>
        </div>
      )}

      {/* Stats row (only when inventory active or has results) */}
      {(inventoryActive || totalTagsRead > 0) && (
        <div className="flex items-center justify-between px-3 py-1 bg-muted/20 rounded text-[10px]">
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground">
              Read: <strong className="text-foreground">{totalTagsRead}</strong>
            </span>
            <span className="text-muted-foreground">
              Unique: <strong className="text-foreground">{uniqueTagsRead}</strong>
            </span>
            {matchedCount > 0 && (
              <span className="text-green-700">
                ✓ {matchedCount}
              </span>
            )}
            {unmatchedCount > 0 && (
              <span className="text-amber-700">
                ? {unmatchedCount}
              </span>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-5 px-1.5 text-[10px] text-muted-foreground"
            onClick={onReset}
          >
            <RotateCcw className="h-2.5 w-2.5" />
          </Button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="px-3 py-1 bg-destructive/10 rounded text-[10px] text-destructive">
          {error}
        </div>
      )}
    </div>
  );
};
