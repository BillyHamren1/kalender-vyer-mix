import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { mobileApi, MobileStaff, getToken, getStoredStaff, setAuth, clearAuth } from '@/services/mobileApiService';

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

  // Check existing session on mount
  useEffect(() => {
    const token = getToken();
    const storedStaff = getStoredStaff();

    if (token && storedStaff) {
      setStaff(storedStaff);
      // Verify token is still valid in background
      mobileApi.me().then(res => {
        setStaff(res.staff);
        setAuth(token, res.staff);
      }).catch(() => {
        clearAuth();
        setStaff(null);
      }).finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await mobileApi.login(email, password);
    setAuth(res.token, res.staff);
    setStaff(res.staff);
  }, []);

  const logout = useCallback(() => {
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
