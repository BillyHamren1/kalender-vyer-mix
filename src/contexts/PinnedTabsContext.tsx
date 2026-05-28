import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface PinnedTab {
  /** Unik nyckel = path */
  path: string;
  /** Visningsnamn */
  title: string;
  /** Valfri undertext (t.ex. bokningsnummer eller sökväg) */
  subtitle?: string;
}

interface PinnedTabsContextValue {
  tabs: PinnedTab[];
  addTab: (tab: PinnedTab) => void;
  removeTab: (path: string) => void;
  hasTab: (path: string) => boolean;
}

const STORAGE_KEY = "pinned-tabs-v1";

const PinnedTabsContext = createContext<PinnedTabsContextValue | null>(null);

export const PinnedTabsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tabs, setTabs] = useState<PinnedTab[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
    } catch {
      /* ignore */
    }
  }, [tabs]);

  const addTab = useCallback((tab: PinnedTab) => {
    setTabs((prev) => {
      if (prev.some((t) => t.path === tab.path)) return prev;
      return [...prev, tab];
    });
  }, []);

  const removeTab = useCallback((path: string) => {
    setTabs((prev) => prev.filter((t) => t.path !== path));
  }, []);

  const hasTab = useCallback((path: string) => tabs.some((t) => t.path === path), [tabs]);

  return (
    <PinnedTabsContext.Provider value={{ tabs, addTab, removeTab, hasTab }}>
      {children}
    </PinnedTabsContext.Provider>
  );
};

export function usePinnedTabs(): PinnedTabsContextValue {
  const ctx = useContext(PinnedTabsContext);
  if (!ctx) {
    // Fallback no-op så att komponenter inte kraschar om provider saknas
    return {
      tabs: [],
      addTab: () => {},
      removeTab: () => {},
      hasTab: () => false,
    };
  }
  return ctx;
}
