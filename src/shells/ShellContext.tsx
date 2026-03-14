import React, { createContext, useContext } from 'react';
import type { AppMode } from '@/config/appMode';

interface ShellContextType {
  mode: AppMode;
  appName: string;
  appTagline: string;
}

const ShellContext = createContext<ShellContextType>({
  mode: 'web',
  appName: 'EventFlow',
  appTagline: '',
});

export const useShell = () => useContext(ShellContext);

export const ShellProvider: React.FC<{
  mode: AppMode;
  appName: string;
  appTagline: string;
  children: React.ReactNode;
}> = ({ mode, appName, appTagline, children }) => (
  <ShellContext.Provider value={{ mode, appName, appTagline }}>
    {children}
  </ShellContext.Provider>
);
