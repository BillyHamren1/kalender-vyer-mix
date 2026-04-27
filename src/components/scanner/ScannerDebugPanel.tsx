/**
 * ScannerDebugPanel — Diagnostic view for Zebra scanner testing
 * 
 * Shows scanner state, recent events, reader status, and simulation tools.
 * Essential for testing on TC22 + RFD4030 hardware.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Bug, Wifi, WifiOff, Smartphone, Monitor,
  ChevronDown, ChevronUp, Zap, Tag
} from 'lucide-react';
import { ScanEvent, ScannerState, DwCommandResultInfo } from '@/services/scanner/types';
import { getState } from '@/services/scanner/ScannerService';
import { simulateDataWedgeScan } from '@/services/scanner/DataWedgeBridge';
import { simulateRfidTag, simulateReaderStatus } from '@/services/scanner/ZebraRfidBridge';
import { getQueueStats } from '@/services/scanner/ScanQueue';
import { DiagnosticsPanel } from '@/components/diagnostics/DiagnosticsPanel';

interface ScannerDebugPanelProps {
  onClose?: () => void;
}

export const ScannerDebugPanel: React.FC<ScannerDebugPanelProps> = ({ onClose }) => {
  const [state, setState] = useState<ScannerState>(getState());
  const [expanded, setExpanded] = useState(true);
  const [simBarcode, setSimBarcode] = useState('TEST-SKU-001');
  const [simEpc, setSimEpc] = useState('E200001234567890');

  useEffect(() => {
    const interval = setInterval(() => {
      setState(getState());
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const queueStats = getQueueStats();
  const { debugInfo, lastScan, scanCount, recentScans, recentRfidTags } = state;

  const statusColor = (ok: boolean) => ok ? 'bg-green-500' : 'bg-red-500';

  const formatScan = (scan: ScanEvent) => {
    const time = new Date(scan.timestamp).toLocaleTimeString('sv-SE');
    return `${time} | ${scan.source} | ${scan.value}${scan.isDuplicate ? ' (dup)' : ''}`;
  };

  return (
    <Card className="border-amber-500/50 bg-card">
      <CardHeader className="py-2 px-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <CardTitle className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-amber-500" />
            <span>Scanner Debug</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {debugInfo.platform}
            </Badge>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardTitle>
      </CardHeader>

      {expanded && (
        <CardContent className="px-3 pb-3 space-y-3">
          {/* Platform Info */}
          <div className="grid grid-cols-2 gap-1 text-[11px]">
            <div className="flex items-center gap-1.5">
              {debugInfo.isCapacitor ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
              <span>{debugInfo.isCapacitor ? 'Native (Capacitor)' : 'Web Browser'}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>Zebra: {debugInfo.isZebraDevice ? '✅ Yes' : '❌ No'}</span>
            </div>
          </div>

          {/* Status Indicators */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</p>
            <div className="grid grid-cols-2 gap-1 text-[11px]">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${statusColor(debugInfo.dataWedgeListenerActive)}`} />
                <span>DataWedge</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${statusColor(debugInfo.dataWedgeInitSent)}`} />
                <span>DW Init</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${statusColor(debugInfo.rfidListenerActive)}`} />
                <span>RFID Listener</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${statusColor(debugInfo.readerConnectionStatus === 'connected')}`} />
                <span>Reader: {debugInfo.readerConnectionStatus}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${statusColor(debugInfo.cameraAvailable)}`} />
               <span>Camera</span>
              </div>
            </div>
            {debugInfo.readerModel && (
              <p className="text-[10px] text-muted-foreground">Model: {debugInfo.readerModel}</p>
            )}
            {debugInfo.dataWedgeInitErrors.length > 0 && (
              <div className="text-[10px] text-destructive">
                DW errors: {debugInfo.dataWedgeInitErrors.join('; ')}
              </div>
            )}
            {debugInfo.dataWedgeLastScanValue && (
              <p className="text-[10px] text-muted-foreground">
                Last DW: {debugInfo.dataWedgeLastScanValue}
                {debugInfo.dataWedgeLastScanTime && (
                  <> ({new Date(debugInfo.dataWedgeLastScanTime).toLocaleTimeString('sv-SE')})</>
                )}
              </p>
            )}
            {debugInfo.lastError && (
              <p className="text-[10px] text-destructive">Error: {debugInfo.lastError}</p>
            )}
          </div>

          {/* DataWedge Init Results */}
          <DwInitResultsSection results={debugInfo.dataWedgeInitResults} />

          {/* Scan Stats */}
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Session</p>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div className="bg-muted/50 rounded p-1.5 text-center">
                <p className="font-bold text-sm">{scanCount}</p>
                <p className="text-[9px] text-muted-foreground">Scans</p>
              </div>
              <div className="bg-muted/50 rounded p-1.5 text-center">
                <p className="font-bold text-sm">{recentRfidTags.length}</p>
                <p className="text-[9px] text-muted-foreground">RFID tags</p>
              </div>
              <div className="bg-muted/50 rounded p-1.5 text-center">
                <p className="font-bold text-sm">{queueStats.pending}</p>
                <p className="text-[9px] text-muted-foreground">In queue</p>
              </div>
            </div>
          </div>

          {/* Last Scan */}
          {lastScan && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Last scan</p>
              <div className="bg-muted/50 rounded p-2 font-mono text-[10px] break-all">
                <p><strong>Type:</strong> {lastScan.type} ({lastScan.source})</p>
                <p><strong>Value:</strong> {lastScan.value}</p>
                {lastScan.symbology && <p><strong>Symbology:</strong> {lastScan.symbology}</p>}
                {lastScan.rssi !== undefined && <p><strong>RSSI:</strong> {lastScan.rssi} dBm</p>}
                <p><strong>Time:</strong> {new Date(lastScan.timestamp).toLocaleTimeString('en-GB')}</p>
                {lastScan.isDuplicate && <p className="text-amber-600">⚠️ Duplicate</p>}
              </div>
            </div>
          )}

          {/* Recent Scans */}
          {recentScans.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Recent scans ({recentScans.length})
              </p>
              <div className="bg-muted/50 rounded p-2 max-h-24 overflow-y-auto space-y-0.5">
                {recentScans.slice(0, 10).map(s => (
                  <p key={s.id} className={`font-mono text-[9px] ${s.isDuplicate ? 'text-muted-foreground' : ''}`}>
                    {formatScan(s)}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Raw Payload */}
          {debugInfo.lastNativePayload && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Native Payload</p>
              <pre className="bg-muted/50 rounded p-2 text-[9px] font-mono overflow-x-auto max-h-16">
                {debugInfo.lastNativePayload}
              </pre>
            </div>
          )}

          <DiagnosticsPanel />

          {/* Simulation Tools */}
          <div className="space-y-2 border-t pt-2">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              🧪 Simulation (test without hardware)
            </p>
            
            <div className="flex gap-1.5">
              <Input
                value={simBarcode}
                onChange={e => setSimBarcode(e.target.value)}
                placeholder="Barcode..."
                className="h-7 text-xs flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 px-2"
                onClick={() => simulateDataWedgeScan(simBarcode)}
              >
                <Zap className="h-3 w-3" />
                Scan
              </Button>
            </div>

            <div className="flex gap-1.5">
              <Input
                value={simEpc}
                onChange={e => setSimEpc(e.target.value)}
                placeholder="EPC tag ID..."
                className="h-7 text-xs flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 px-2"
                onClick={() => simulateRfidTag(simEpc)}
              >
                <Tag className="h-3 w-3" />
                RFID
              </Button>
            </div>

            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs flex-1"
                onClick={() => simulateReaderStatus(true)}
              >
                <Wifi className="h-3 w-3 mr-1" />
                Reader Connected
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs flex-1"
                onClick={() => simulateReaderStatus(false)}
              >
                <WifiOff className="h-3 w-3 mr-1" />
                Disconnected
              </Button>
            </div>
          </div>

          {onClose && (
            <Button size="sm" variant="ghost" onClick={onClose} className="w-full h-7 text-xs">
              Close debug
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
};

// ── Sub-component: DataWedge Init Results ────────────────────────

const DW_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  success: { label: '✓ OK', className: 'text-green-600' },
  failure: { label: '✗ FAIL', className: 'text-destructive' },
  pending: { label: '⏳ Pending', className: 'text-amber-600' },
  unknown: { label: '? Unknown', className: 'text-muted-foreground' },
};

const DwInitResultsSection: React.FC<{ results: DwCommandResultInfo[] }> = ({ results }) => {
  if (!results || results.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        DW Init results
      </p>
      <div className="bg-muted/50 rounded p-2 space-y-1">
        {results.map((r) => {
          const s = DW_STATUS_LABELS[r.status] || DW_STATUS_LABELS.unknown;
          return (
            <div key={r.commandName} className="text-[10px] font-mono">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{r.commandName}</span>
                <span className={s.className}>{s.label}</span>
              </div>
              {r.resultInfo && r.status !== 'success' && (
                <p className="text-[9px] text-muted-foreground ml-2 break-all">
                  {r.resultInfo}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
