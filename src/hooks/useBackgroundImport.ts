import { useState, useEffect, useCallback, useRef } from 'react';
import { importBookings } from '@/services/importService';
import { isScannerApp } from '@/config/appMode';
import { getOrganizationId } from '@/hooks/useOrganizationId';

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
const MIN_IMPORT_GAP = 4 * 60 * 1000;       // skydd mot focus-storms
const STORAGE_KEY = 'background_import_state';

const BACKGROUND_IMPORT_ROUTE_PREFIXES = [
  '/dashboard',
  '/calendar',
  '/booking',
  '/booking-list',
  '/projects',
  '/project',
  '/large-project',
  '/my-projects',
];

const isBackgroundImportRoute = () => {
  if (typeof window === 'undefined') return false;
  const pathname = window.location.pathname;
  return BACKGROUND_IMPORT_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
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
    if (!isBackgroundImportRoute()) return;
    // Skip when tab is hidden — sparar databasen från att matas av
    // bortglömda flikar i bakgrunden.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    // Gate on verified auth + org context to prevent cross-tenant import attempts.
    // Uses shared cache (10 min) — no per-tick /auth/user + profiles roundtrip.
    const orgId = await getOrganizationId();
    if (!orgId) return;

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
    // Scanner mode: no background import
    if (isScannerApp) return;

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
