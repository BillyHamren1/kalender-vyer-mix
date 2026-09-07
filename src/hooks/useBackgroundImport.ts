import { useState, useCallback, useRef } from 'react';
import { importBookings } from '@/services/importService';
import { isScannerApp } from '@/config/appMode';

interface BackgroundImportState {
  isRunning: boolean;
  lastImport: Date | null;
  nextImport: Date | null;
  importCount: number;
}

// Throttling: tidigare 30s var alldeles för aggressivt och orsakade att
// `import-bookings` kördes konstant så fort någon stod på /projects, vilket
// tröttade ut databasen och fick UI att kännas "fastlåst" i laddning.
// Bakgrundsimport behövs egentligen bara som mjuk fallback — realtime +
// manuell "Uppdatera"-knapp är primära signaler.
const IMPORT_INTERVAL = 5 * 60 * 1000;      // 5 min mellan auto-importer
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
