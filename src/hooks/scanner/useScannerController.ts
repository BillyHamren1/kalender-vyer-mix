/**
 * useScannerController — Central React hook for scanner integration
 * 
 * Provides a unified interface for all scanning operations.
 * Automatically initializes the correct scanner sources based on platform.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ScanEvent, ScanMode, ScannerState, ScannerConfig } from '@/services/scanner/types';
import { initScanner, destroyScanner, setMode, getState, isInitialized } from '@/services/scanner/ScannerService';
import { startRfidInventory, stopRfidInventory, triggerRfidRead } from '@/services/scanner/ZebraRfidBridge';
import { simulateDataWedgeScan } from '@/services/scanner/DataWedgeBridge';
import { simulateRfidTag, simulateReaderStatus } from '@/services/scanner/ZebraRfidBridge';
import { getQueueStats } from '@/services/scanner/ScanQueue';

interface UseScannerControllerOptions {
  /** Called for every new (non-duplicate) scan */
  onScan?: (scan: ScanEvent) => void;
  /** Initial scan mode */
  initialMode?: ScanMode;
  /** Scanner configuration overrides */
  config?: Partial<ScannerConfig>;
  /** Auto-initialize on mount */
  autoInit?: boolean;
}

export function useScannerController(options: UseScannerControllerOptions = {}) {
  const {
    onScan,
    initialMode = 'barcode',
    config,
    autoInit = true,
  } = options;

  const [state, setState] = useState<ScannerState>(getState());
  const [rfidInventoryActive, setRfidInventoryActive] = useState(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  // Refresh state periodically
  const refreshState = useCallback(() => {
    setState(getState());
  }, []);

  // Initialize scanner
  useEffect(() => {
    if (!autoInit) return;

    const handleScan = (scan: ScanEvent) => {
      onScanRef.current?.(scan);
      refreshState();
    };

    initScanner(handleScan, config);
    setMode(initialMode);
    refreshState();

    // Poll state for RFID reader status changes
    const interval = setInterval(refreshState, 2000);

    return () => {
      clearInterval(interval);
      destroyScanner();
    };
  }, [autoInit]); // intentionally stable deps

  // Mode switching
  const switchMode = useCallback((mode: ScanMode) => {
    setMode(mode);
    refreshState();
  }, [refreshState]);

  // RFID inventory controls
  const startInventory = useCallback(async () => {
    await startRfidInventory();
    setRfidInventoryActive(true);
    switchMode('rfid_inventory');
  }, [switchMode]);

  const stopInventory = useCallback(async () => {
    await stopRfidInventory();
    setRfidInventoryActive(false);
    switchMode('barcode');
  }, [switchMode]);

  const singleRfidRead = useCallback(async () => {
    await triggerRfidRead();
  }, []);

  // Manual scan input (from camera or text input)
  const submitManualScan = useCallback((value: string, source: 'camera' | 'manual_input' = 'manual_input') => {
    const scan: ScanEvent = {
      id: `manual_${Date.now()}`,
      type: 'barcode',
      source: source === 'camera' ? 'camera' : 'manual_input',
      value,
      timestamp: Date.now(),
      isDuplicate: false,
    };
    onScanRef.current?.(scan);
    refreshState();
  }, [refreshState]);

  // Simulation helpers (debug only)
  const simulateBarcode = useCallback((barcode: string) => {
    simulateDataWedgeScan(barcode);
  }, []);

  const simulateRfid = useCallback((epc: string, rssi?: number) => {
    simulateRfidTag(epc, rssi);
  }, []);

  const simulateReader = useCallback((connected: boolean) => {
    simulateReaderStatus(connected);
    setTimeout(refreshState, 100);
  }, [refreshState]);

  // Queue stats
  const queueStats = getQueueStats();

  return {
    // State
    ...state,
    rfidInventoryActive,
    queueStats,

    // Actions
    switchMode,
    startInventory,
    stopInventory,
    singleRfidRead,
    submitManualScan,
    refreshState,

    // Debug / simulation
    simulateBarcode,
    simulateRfid,
    simulateReader,
  };
}
