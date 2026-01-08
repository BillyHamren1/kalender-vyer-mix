import { useState, useEffect, useCallback, useRef } from 'react';
import { importBookings } from '@/services/importService';

interface BackgroundImportState {
  isRunning: boolean;
  lastImport: Date | null;
  nextImport: Date | null;
  importCount: number;
}

const IMPORT_INTERVAL = 30 * 1000; // 30 seconds
const MIN_IMPORT_GAP = 25 * 1000; // 25 seconds minimum between imports
const STORAGE_KEY = 'background_import_state';

export const useBackgroundImport = () => {
  const [state, setState] = useState<BackgroundImportState>({
    isRunning: false,
    lastImport: null,
    nextImport: null,
    importCount: 0
  });
  
  const intervalRef = useRef<NodeJS.Timeout>();
  const isActiveRef = useRef(true);

  // Load state from localStorage
  useEffect(() => {
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        setState(prev => ({
          ...prev,
          lastImport: parsed.lastImport ? new Date(parsed.lastImport) : null,
          importCount: parsed.importCount || 0
        }));
      } catch (error) {
        console.warn('Failed to parse background import state:', error);
      }
    }
  }, []);

  // Save state to localStorage
  const saveState = useCallback((newState: Partial<BackgroundImportState>) => {
    setState(prev => {
      const updated = { ...prev, ...newState };
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        lastImport: updated.lastImport?.toISOString(),
        importCount: updated.importCount
      }));
      return updated;
    });
  }, []);

  // Check if enough time has passed since last import
  const canImport = useCallback(() => {
    if (!state.lastImport) return true;
    const timeSinceLastImport = Date.now() - state.lastImport.getTime();
    return timeSinceLastImport >= MIN_IMPORT_GAP;
  }, [state.lastImport]);

  // Perform background import (silent, no UI feedback)
  const performBackgroundImport = useCallback(async () => {
    if (!isActiveRef.current || !canImport() || state.isRunning) {
      return;
    }

    console.log('🔄 Background import starting (30s interval)...');
    
    saveState({ 
      isRunning: true,
      nextImport: new Date(Date.now() + IMPORT_INTERVAL)
    });

    try {
      // Silent import - no user feedback (silent = true)
      await importBookings({ syncMode: 'incremental' }, true);
      
      const now = new Date();
      saveState({
        isRunning: false,
        lastImport: now,
        nextImport: new Date(now.getTime() + IMPORT_INTERVAL),
        importCount: state.importCount + 1
      });
      
      console.log('✅ Background import completed successfully (30s interval)');
    } catch (error) {
      console.error('❌ Background import failed:', error);
      saveState({ 
        isRunning: false,
        nextImport: new Date(Date.now() + IMPORT_INTERVAL)
      });
    }
  }, [canImport, state.isRunning, state.importCount, saveState]);

  // Start background import service
  const startBackgroundImport = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Run first import immediately if enough time has passed
    if (canImport()) {
      setTimeout(performBackgroundImport, 1000); // Small delay to avoid conflicts
    }

    // Set up periodic imports every 30 seconds
    intervalRef.current = setInterval(() => {
      if (isActiveRef.current) {
        performBackgroundImport();
      }
    }, IMPORT_INTERVAL);

    console.log('🚀 Background import service started (30s interval)');
  }, [canImport, performBackgroundImport]);

  // Stop background import service
  const stopBackgroundImport = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
    console.log('🛑 Background import service stopped');
  }, []);

  // Manual import with user feedback (for manual refresh button)
  const triggerManualImport = useCallback(async () => {
    if (state.isRunning) return false;

    try {
      setState(prev => ({ ...prev, isRunning: true }));
      // Manual import - show feedback (silent = false)
      const result = await importBookings({ syncMode: 'incremental' }, false);
      
      const now = new Date();
      saveState({
        isRunning: false,
        lastImport: now,
        nextImport: new Date(now.getTime() + IMPORT_INTERVAL),
        importCount: state.importCount + 1
      });
      
      return result;
    } catch (error) {
      setState(prev => ({ ...prev, isRunning: false }));
      throw error;
    }
  }, [state.isRunning, state.importCount, saveState]);

  // Initialize on mount
  useEffect(() => {
    isActiveRef.current = true;
    startBackgroundImport();

    return () => {
      isActiveRef.current = false;
      stopBackgroundImport();
    };
  }, [startBackgroundImport, stopBackgroundImport]);

  // Backward compatibility properties
  const isImporting = state.isRunning;
  const lastSyncTime = state.lastImport;
  const syncStatus = state.isRunning ? 'running' : 'idle';
  const performManualRefresh = triggerManualImport;

  return {
    state,
    triggerManualImport,
    startBackgroundImport,
    stopBackgroundImport,
    // Backward compatibility
    isImporting,
    lastSyncTime,
    syncStatus,
    performManualRefresh
  };
};
