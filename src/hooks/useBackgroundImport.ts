import { useState, useCallback, useRef } from 'react';
import { importBookings } from '@/services/importService';
import { isScannerApp } from '@/config/appMode';

interface BackgroundImportState {
  isRunning: boolean;
  lastImport: Date | null;
  nextImport: Date | null;
  importCount: number;
}

const STORAGE_KEY = 'background_import_state';

const BACKGROUND_IMPORT_ROUTE_PREFIXES = [
  '/dashboard',
  '/calendar',
  '/booking',
  '/booking-list',
];

export const isBackgroundImportRoute = (pathname?: string) => {
  if (typeof window === 'undefined') return false;
  const currentPath = pathname ?? window.location.pathname;
  return BACKGROUND_IMPORT_ROUTE_PREFIXES.some((prefix) => currentPath.startsWith(prefix));
};

export const useBackgroundImport = () => {
  const [state, setState] = useState<BackgroundImportState>(() => {
    // Scanner mode: never import bookings
    if (isScannerApp) {
      return { isRunning: false, lastImport: null, nextImport: null, importCount: 0 };
    }
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

  const stateRef = useRef(state);
  stateRef.current = state;

  const saveToStorage = useCallback((lastImport: Date | null, importCount: number) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      lastImport: lastImport?.toISOString() ?? null,
      importCount
    }));
  }, []);

  // Periodisk import ägs ENBART av server-cron (process-sync-jobs).
  // Klienten kör aldrig automatisk import längre — realtime + manuell
  // "Uppdatera" är de enda klientsignalerna.

  const triggerManualImport = useCallback(async () => {
    if (stateRef.current.isRunning) return false;
    if (!isBackgroundImportRoute()) {
      return { success: true, results: { total: 0, imported: 0, failed: 0, calendar_events_created: 0 } };
    }
    setState(prev => ({ ...prev, isRunning: true }));
    try {
      const result = await importBookings({ syncMode: 'incremental' }, false);
      const now = new Date();
      const newCount = stateRef.current.importCount + 1;
      saveToStorage(now, newCount);
      setState({
        isRunning: false,
        lastImport: now,
        nextImport: null,
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
    // Periodisk import ägs av serverns cron. Klienter får aldrig starta egna
    // intervall eftersom varje flik annars blir en separat köproducent.
    startBackgroundImport: () => {},
    stopBackgroundImport: () => {},
    isImporting: state.isRunning,
    lastSyncTime: state.lastImport,
    syncStatus: state.isRunning ? 'running' as const : 'idle' as const,
    performManualRefresh: triggerManualImport
  };
};
