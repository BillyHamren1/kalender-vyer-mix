/**
 * useRfidManager — Manages RFID reader state and inventory controls
 * 
 * Provides UI-ready state for RFID connection, inventory sessions,
 * and matched/unmatched tag tracking against a packing list.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  connectRfidReader,
  disconnectRfidReader,
  startRfidInventory,
  stopRfidInventory,
  getRfidReaderStatus,
  clearRecentTags,
  getUniqueTagCount,
  getTagReadCount,
} from '@/services/scanner/ZebraRfidBridge';
import { scanLog } from './scanLog';

export type RfidConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'inventory_active' | 'error';

export interface RfidLastMatch {
  productName: string;
  sku: string;
  timestamp: number;
}

export interface RfidManagerState {
  status: RfidConnectionStatus;
  readerModel: string | null;
  error: string | null;
  inventoryActive: boolean;
  totalTagsRead: number;
  uniqueTagsRead: number;
  matchedCount: number;
  unmatchedCount: number;
  lastMatchedProduct: RfidLastMatch | null;
}

interface UseRfidManagerOptions {
  /** Called when an RFID tag should be processed (routed to scan pipeline) */
  onRfidTag?: (epc: string) => void;
  /** Called when session is reset (e.g. to clear scan dedup) */
  onSessionReset?: () => void;
}

export function useRfidManager(options: UseRfidManagerOptions = {}) {
  const [state, setState] = useState<RfidManagerState>({
    status: 'disconnected',
    readerModel: null,
    error: null,
    inventoryActive: false,
    totalTagsRead: 0,
    uniqueTagsRead: 0,
    matchedCount: 0,
    unmatchedCount: 0,
    lastMatchedProduct: null,
  });

  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Track matched/unmatched EPCs in this session
  const matchedEpcs = useRef(new Set<string>());
  const unmatchedEpcs = useRef(new Set<string>());

  // Connect to RFID reader
  const connect = useCallback(async () => {
    setState(prev => ({ ...prev, status: 'connecting', error: null }));
    scanLog('rfid_connect_start');
    
    try {
      const result = await connectRfidReader();
      if (result.connected) {
        setState(prev => ({
          ...prev,
          status: 'connected',
          readerModel: result.model || null,
          error: null,
        }));
        scanLog('rfid_connected', { model: result.model });
      } else {
        setState(prev => ({ ...prev, status: 'disconnected', error: 'Kunde inte ansluta' }));
      }
    } catch (err: any) {
      scanLog('rfid_connect_error', { error: err.message });
      setState(prev => ({
        ...prev,
        status: 'error',
        error: err.message || 'Anslutningsfel',
      }));
    }
  }, []);

  // Disconnect reader
  const disconnect = useCallback(async () => {
    try {
      if (state.inventoryActive) {
        await stopRfidInventory();
      }
      await disconnectRfidReader();
      setState(prev => ({
        ...prev,
        status: 'disconnected',
        inventoryActive: false,
        readerModel: null,
        error: null,
      }));
      scanLog('rfid_disconnected');
    } catch (err: any) {
      scanLog('rfid_disconnect_error', { error: err.message });
      setState(prev => ({ ...prev, error: err.message }));
    }
  }, [state.inventoryActive]);

  // Start inventory (continuous reading)
  const startInventory = useCallback(async () => {
    try {
      await startRfidInventory();
      setState(prev => ({
        ...prev,
        status: 'inventory_active',
        inventoryActive: true,
        error: null,
      }));
      scanLog('rfid_inventory_started');
    } catch (err: any) {
      scanLog('rfid_inventory_start_error', { error: err.message });
      setState(prev => ({ ...prev, error: err.message }));
    }
  }, []);

  // Stop inventory
  const stopInventory = useCallback(async () => {
    try {
      await stopRfidInventory();
      setState(prev => ({
        ...prev,
        status: 'connected',
        inventoryActive: false,
      }));
      scanLog('rfid_inventory_stopped');
    } catch (err: any) {
      scanLog('rfid_inventory_stop_error', { error: err.message });
      setState(prev => ({ ...prev, error: err.message }));
    }
  }, []);

  // Toggle inventory on/off
  const toggleInventory = useCallback(async () => {
    if (state.inventoryActive) {
      await stopInventory();
    } else {
      await startInventory();
    }
  }, [state.inventoryActive, startInventory, stopInventory]);

  // Record a tag match result (called from scan pipeline callback)
  const recordTagResult = useCallback((epc: string, matched: boolean, productName?: string, sku?: string) => {
    if (matched) {
      matchedEpcs.current.add(epc);
      unmatchedEpcs.current.delete(epc);
    } else {
      if (!matchedEpcs.current.has(epc)) {
        unmatchedEpcs.current.add(epc);
      }
    }
    setState(prev => ({
      ...prev,
      matchedCount: matchedEpcs.current.size,
      unmatchedCount: unmatchedEpcs.current.size,
      lastMatchedProduct: matched && productName
        ? { productName, sku: sku || epc, timestamp: Date.now() }
        : prev.lastMatchedProduct,
    }));
  }, []);

  // Reset session counters
  const resetSession = useCallback(() => {
    matchedEpcs.current.clear();
    unmatchedEpcs.current.clear();
    clearRecentTags();
    setState(prev => ({
      ...prev,
      totalTagsRead: 0,
      uniqueTagsRead: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      lastMatchedProduct: null,
    }));
    // Also clear scan processor dedup
    if (optionsRef.current.onSessionReset) {
      optionsRef.current.onSessionReset();
    }
    scanLog('rfid_session_reset');
  }, []);

  // Poll reader status + tag counts when inventory is active
  useEffect(() => {
    if (!state.inventoryActive) return;

    const interval = setInterval(() => {
      setState(prev => ({
        ...prev,
        totalTagsRead: getTagReadCount(),
        uniqueTagsRead: getUniqueTagCount(),
      }));
    }, 500);

    return () => clearInterval(interval);
  }, [state.inventoryActive]);

  // Check initial reader status on mount
  useEffect(() => {
    getRfidReaderStatus().then(status => {
      if (status.isConnected) {
        setState(prev => ({
          ...prev,
          status: 'connected',
          readerModel: status.readerModel || null,
        }));
      }
    }).catch(() => { /* silent */ });
  }, []);

  // Listen for external status changes (e.g. ScannerService auto-connect)
  useEffect(() => {
    const handleStatusEvent = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail) return;
      
      if (detail.isConnected) {
        setState(prev => ({
          ...prev,
          status: prev.inventoryActive ? 'inventory_active' : 'connected',
          readerModel: detail.readerModel || prev.readerModel,
          error: null,
        }));
        scanLog('rfid_external_connect', { model: detail.readerModel });
      } else {
        setState(prev => ({
          ...prev,
          status: 'disconnected',
          inventoryActive: false,
        }));
        scanLog('rfid_external_disconnect');
      }
    };

    window.addEventListener('zebra-rfid:status', handleStatusEvent);
    return () => window.removeEventListener('zebra-rfid:status', handleStatusEvent);
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    startInventory,
    stopInventory,
    toggleInventory,
    recordTagResult,
    resetSession,
  };
}
