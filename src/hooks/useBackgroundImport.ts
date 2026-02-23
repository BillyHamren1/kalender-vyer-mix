import { useState, useEffect, useCallback, useRef } from 'react';
import { importBookings } from '@/services/importService';

interface BackgroundImportState {
  isRunning: boolean;
  lastImport: Date | null;
  nextImport: Date | null;
  importCount: number;
}

const IMPORT_INTERVAL = 30 * 1000;
const MIN_IMPORT_GAP = 25 * 1000;
const STORAGE_KEY = 'background_import_state';

export const useBackgroundImport = () => {
  const [state, setState] = useState<BackgroundImportState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          isRunning: false,
          lastImport: parsed.lastImport ? new Date(parsed.lastImport) : null,
          nextImport: null,
          importCount: parsed.importCount || 0
        };
      } catch { /* ignore */ }
    }
    return { isRunning: false, lastImport: null, nextImport: null, importCount: 0 };
  });

  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const stateRef = useRef(state);
  stateRef.current = state;

  const saveToStorage = useCallback((lastImport: Date | null, importCount: number) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      lastImport: lastImport?.toISOString() ?? null,
      importCount
    }));
  }, []);

  const performImport = useCallback(async () => {
    const s = stateRef.current;
    if (s.isRunning) return;
    if (s.lastImport && Date.now() - s.lastImport.getTime() < MIN_IMPORT_GAP) return;

    setState(prev => ({ ...prev, isRunning: true }));

    try {
      await importBookings({ syncMode: 'incremental' }, true);
      const now = new Date();
      const newCount = stateRef.current.importCount + 1;
      saveToStorage(now, newCount);
      setState({
        isRunning: false,
        lastImport: now,
        nextImport: new Date(now.getTime() + IMPORT_INTERVAL),
        importCount: newCount
      });
    } catch (error) {
      console.error('❌ Background import failed:', error);
      setState(prev => ({
        ...prev,
        isRunning: false,
        nextImport: new Date(Date.now() + IMPORT_INTERVAL)
      }));
    }
  }, [saveToStorage]);

  // Single stable effect for the interval — no dependency on callbacks that change
  useEffect(() => {
    const timer = setTimeout(() => performImport(), 1000);
    const interval = setInterval(() => performImport(), IMPORT_INTERVAL);
    intervalRef.current = interval;

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerManualImport = useCallback(async () => {
    if (stateRef.current.isRunning) return false;
    setState(prev => ({ ...prev, isRunning: true }));
    try {
      const result = await importBookings({ syncMode: 'incremental' }, false);
      const now = new Date();
      const newCount = stateRef.current.importCount + 1;
      saveToStorage(now, newCount);
      setState({
        isRunning: false,
        lastImport: now,
        nextImport: new Date(now.getTime() + IMPORT_INTERVAL),
        importCount: newCount
      });
      return result;
    } catch (error) {
      setState(prev => ({ ...prev, isRunning: false }));
      throw error;
    }
  }, [saveToStorage]);

  return {
    state,
    triggerManualImport,
    startBackgroundImport: () => {},
    stopBackgroundImport: () => {},
    isImporting: state.isRunning,
    lastSyncTime: state.lastImport,
    syncStatus: state.isRunning ? 'running' as const : 'idle' as const,
    performManualRefresh: triggerManualImport
  };
};
