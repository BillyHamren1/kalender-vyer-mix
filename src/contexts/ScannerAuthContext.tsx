import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  clearAuth,
  getStoredStaff,
  getToken,
  mobileApi,
  setAuth,
  type MobileStaff,
} from '@/services/mobileApiService';

interface ScannerAuthContextValue {
  staff: MobileStaff | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const ScannerAuthContext = createContext<ScannerAuthContextValue>({
  staff: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  logout: () => {},
});

export const useScannerAuth = (): ScannerAuthContextValue => useContext(ScannerAuthContext);

/** Scanner-only auth. It intentionally has no Time queues, location, push or impersonation. */
export const ScannerAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [staff, setStaff] = useState<MobileStaff | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    const storedStaff = getStoredStaff();
    if (!token || !storedStaff) {
      setIsLoading(false);
      return;
    }

    setStaff(storedStaff);
    setIsLoading(false);
    mobileApi.me()
      .then((response: { staff: MobileStaff }) => {
        setAuth(getToken() ?? token, response.staff);
        setStaff(response.staff);
      })
      .catch((error: { code?: string; message?: string }) => {
        if (error?.code === 'SESSION_EXPIRED' || error?.message === 'Session expired') {
          clearAuth();
          setStaff(null);
        }
      });
  }, []);

  useEffect(() => {
    const invalidate = () => {
      clearAuth();
      setStaff(null);
      setIsLoading(false);
    };
    window.addEventListener('mobile-session-expired', invalidate);
    window.addEventListener('mobile-session-invalid', invalidate);
    window.addEventListener('mobile-session-revoked', invalidate);
    return () => {
      window.removeEventListener('mobile-session-expired', invalidate);
      window.removeEventListener('mobile-session-invalid', invalidate);
      window.removeEventListener('mobile-session-revoked', invalidate);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await mobileApi.login(email, password);
    setAuth(response.token, response.staff);
    setStaff(response.staff);
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setStaff(null);
  }, []);

  return (
    <ScannerAuthContext.Provider value={{
      staff,
      isAuthenticated: Boolean(staff),
      isLoading,
      login,
      logout,
    }}>
      {children}
    </ScannerAuthContext.Provider>
  );
};
