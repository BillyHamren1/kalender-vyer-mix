import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export interface PinnedTab {
  /** Unik nyckel = ursprunglig path (root för tabben) */
  path: string;
  /** Senast besökta path som börjar med `path` — används vid navigation tillbaka */
  lastPath?: string;
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
  /** Hämta navigeringsdestination (lastPath || path) för en tabb */
  resolveTabTarget: (path: string) => string;
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

  const location = useLocation();
  const currentPath = location.pathname + location.search;

  // Spåra senaste path för varje tabb vars root matchar aktuell route
  useEffect(() => {
    setTabs((prev) => {
      let changed = false;
      const next = prev.map((t) => {
        const matches =
          location.pathname === t.path || location.pathname.startsWith(t.path + "/");
        if (matches && t.lastPath !== currentPath) {
          changed = true;
          return { ...t, lastPath: currentPath };
        }
        return t;
      });
      return changed ? next : prev;
    });
  }, [currentPath, location.pathname]);

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
      return [...prev, { ...tab, lastPath: tab.lastPath ?? tab.path }];
    });
  }, []);

  const removeTab = useCallback((path: string) => {
    setTabs((prev) => prev.filter((t) => t.path !== path));
  }, []);

  const hasTab = useCallback((path: string) => tabs.some((t) => t.path === path), [tabs]);

  const resolveTabTarget = useCallback(
    (path: string) => {
      const t = tabs.find((x) => x.path === path);
      return t?.lastPath || path;
    },
    [tabs]
  );

  return (
    <PinnedTabsContext.Provider value={{ tabs, addTab, removeTab, hasTab, resolveTabTarget }}>
      {children}
    </PinnedTabsContext.Provider>
  );
};

export function usePinnedTabs(): PinnedTabsContextValue {
  const ctx = useContext(PinnedTabsContext);
  if (!ctx) {
    return {
      tabs: [],
      addTab: () => {},
      removeTab: () => {},
      hasTab: () => false,
      resolveTabTarget: (p) => p,
    };
  }
  return ctx;
}
