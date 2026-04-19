import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { mobileApi, MobileStaff, getToken, getStoredStaff, setAuth, clearAuth } from '@/services/mobileApiService';
import { isScannerApp } from '@/config/appMode';
import { clearTimerSyncQueue } from '@/services/timerSyncQueue';
import { clearLocalTimerSession } from '@/hooks/useGeofencing';

interface MobileAuthContextType {
  staff: MobileStaff | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const MobileAuthContext = createContext<MobileAuthContextType>({
  staff: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  logout: () => {},
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

    if (token && storedStaff) {
      setStaff(storedStaff);
      // Verify token is still valid in background with timeout
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 8000)
      );
      Promise.race([mobileApi.me(), timeoutPromise])
        .then((res: any) => {
          setStaff(res.staff);
          setAuth(token, res.staff);
        })
        .catch((err) => {
          // Only clear auth on explicit 401 (Session expired) — keep user
          // logged in through network errors, timeouts, etc.
          if (err.message === 'Session expired') {
            console.warn('[MobileAuth] Token rejected (401), logging out');
            clearAuth();
            setStaff(null);
          } else {
            console.warn('[MobileAuth] Session verify failed (keeping session):', err.message);
          }
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
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
    clearAuth();
    setStaff(null);
  }, []);

  return (
    <MobileAuthContext.Provider value={{
      staff,
      isAuthenticated: !!staff,
      isLoading,
      login,
      logout,
    }}>
      {children}
    </MobileAuthContext.Provider>
  );
};
