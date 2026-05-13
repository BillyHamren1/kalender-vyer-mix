import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { mobileApi, MobileStaff, getToken, getStoredStaff, setAuth, clearAuth } from '@/services/mobileApiService';
import { isScannerApp } from '@/config/appMode';
import { clearTimerSyncQueue } from '@/services/timerSyncQueue';
import { clearLocalTimerSession } from '@/hooks/useGeofencing';
import { getViewAs, setViewAs as persistViewAs, type ViewAsRecord } from '@/services/viewAsStorage';

interface MobileAuthContextType {
  staff: MobileStaff | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** True om current user har admin-roll (kan slå på "Visa som"). */
  isAdmin: boolean;
  /** Aktiv impersonering — null om av. */
  viewAs: ViewAsRecord | null;
  /** Effektiv staff-id som READ-hooks bör fråga efter. Skrivs ALDRIG av writes. */
  effectiveStaffId: string | null;
  /** True om viewAs är aktivt. */
  isViewingAs: boolean;
  /** Sätt/rensa viewAs (admin-only). */
  setViewAs: (rec: { id: string; name: string } | null) => void;
}

const MobileAuthContext = createContext<MobileAuthContextType>({
  staff: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  logout: () => {},
  isAdmin: false,
  viewAs: null,
  effectiveStaffId: null,
  isViewingAs: false,
  setViewAs: () => {},
});

export const useMobileAuth = () => useContext(MobileAuthContext);

export const MobileAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [staff, setStaff] = useState<MobileStaff | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initializedPushForStaffIdRef = useRef<string | null>(null);
  const pushInitTimeoutRef = useRef<number | null>(null);

  // Check existing session on mount
  useEffect(() => {
    const token = getToken();
    const storedStaff = getStoredStaff();

    console.log('[ScannerStartup] MobileAuth loading start', { hasToken: !!token, hasStoredStaff: !!storedStaff });
    if (token && storedStaff) {
      setStaff(storedStaff);
      // Restore session optimistically so the UI is usable immediately.
      // Verify token in background — never block the UI on the `me` call,
      // which can hang on cold starts or flaky mobile networks.
      setIsLoading(false);
      console.log('[ScannerStartup] MobileAuth loading done (restored from storage)');
      mobileApi.me()
        .then((res: any) => {
          setStaff(res.staff);
          setAuth(getToken() ?? token, res.staff);
          console.log('[ScannerStartup] MobileAuth background verify ok');
        })
        .catch((err) => {
          // Only clear auth on explicit 401 (Session expired). Network
          // errors, timeouts, cold starts, etc. → keep the session.
          if (err?.message === 'Session expired' || err?.code === 'SESSION_EXPIRED') {
            console.warn('[MobileAuth] Token rejected (401), logging out');
            clearAuth();
            setStaff(null);
          } else {
            console.warn('[MobileAuth] Session verify failed (keeping session):', err?.message);
          }
        });
    } else {
      setIsLoading(false);
      console.log('[ScannerStartup] MobileAuth loading done (no stored session)');
    }
  }, []);

  // Push notifications — disabled for scanner app
  useEffect(() => {
    if (isScannerApp) return;
    if (!staff?.id) return;
    if (initializedPushForStaffIdRef.current === staff.id) return;

    if (pushInitTimeoutRef.current !== null) {
      window.clearTimeout(pushInitTimeoutRef.current);
    }

    // Lazy-load push module only for non-scanner apps
    pushInitTimeoutRef.current = window.setTimeout(async () => {
      if (initializedPushForStaffIdRef.current === staff.id) return;
      initializedPushForStaffIdRef.current = staff.id;
      const { initPushNotifications } = await import('@/services/pushNotificationService');
      initPushNotifications(staff.id);
      pushInitTimeoutRef.current = null;
    }, 800);

    return () => {
      if (pushInitTimeoutRef.current !== null) {
        window.clearTimeout(pushInitTimeoutRef.current);
        pushInitTimeoutRef.current = null;
      }
    };
  }, [staff?.id]);

  const login = useCallback(async (email: string, password: string) => {
    // ROBUSTHET: defensive cleanup innan vi byter user. Om förra sessionen
    // lämnade kvar timers eller pending starts i localStorage får de absolut
    // inte attribuera sig till den nya användaren.
    clearTimerSyncQueue();
    clearLocalTimerSession();

    const res = await mobileApi.login(email, password);
    setAuth(res.token, res.staff);
    setStaff(res.staff);
  }, []);

  const logout = useCallback(async () => {
    if (pushInitTimeoutRef.current !== null) {
      window.clearTimeout(pushInitTimeoutRef.current);
      pushInitTimeoutRef.current = null;
    }
    initializedPushForStaffIdRef.current = null;
    if (!isScannerApp) {
      const { unregisterPushNotifications } = await import('@/services/pushNotificationService');
      unregisterPushNotifications();
    }
    // ROBUSTHET: töm timer-state INNAN vi rensar auth, så att en pågående
    // sync-flush mot servern inte hinner skapa en orphaned entry tagged till
    // den utloggande användaren med en stale token.
    clearTimerSyncQueue();
    clearLocalTimerSession();
    clearAuth();
    persistViewAs(null);
    setViewAsState(null);
    setStaff(null);
  }, []);

  // === viewAs (admin-only impersonering, read-only) ===
  const isAdmin = !!staff?.app_roles?.includes('admin');
  const [viewAsState, setViewAsState] = useState<ViewAsRecord | null>(() => getViewAs());

  // Rensa viewAs om current user inte är admin (eller logout).
  useEffect(() => {
    if (!staff) return;
    if (!isAdmin && viewAsState) {
      console.warn('[MobileAuth] Rensar viewAs — current user är inte admin');
      persistViewAs(null);
      setViewAsState(null);
    }
  }, [staff, isAdmin, viewAsState]);

  // Sync mellan tabs.
  useEffect(() => {
    const onChange = () => setViewAsState(getViewAs());
    window.addEventListener('view-as-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('view-as-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const setViewAs = useCallback((rec: { id: string; name: string } | null) => {
    if (rec && !isAdmin) {
      console.warn('[MobileAuth] setViewAs blockerat — current user är inte admin');
      return;
    }
    if (rec && rec.id === staff?.id) {
      // "Visa som mig själv" = av
      persistViewAs(null);
      setViewAsState(null);
      return;
    }
    persistViewAs(rec);
    setViewAsState(rec ? { id: rec.id, name: rec.name, setAt: Date.now() } : null);
    console.info('[MobileAuth] viewAs', rec ? `→ ${rec.name} (${rec.id})` : '→ av');
  }, [isAdmin, staff?.id]);

  const effectiveStaffId = viewAsState?.id ?? staff?.id ?? null;
  const isViewingAs = !!viewAsState && viewAsState.id !== staff?.id;

  return (
    <MobileAuthContext.Provider value={{
      staff,
      isAuthenticated: !!staff,
      isLoading,
      login,
      logout,
      isAdmin,
      viewAs: viewAsState,
      effectiveStaffId,
      isViewingAs,
      setViewAs,
    }}>
      {children}
    </MobileAuthContext.Provider>
  );
};
