/**
 * EditControllerContext — Global edit mutex for Planner
 * 
 * Provides a single useEventEditController instance shared across
 * all CustomEvent components, ensuring only ONE edit dialog/popover
 * is active at a time across the entire calendar view.
 */

import React, { createContext, useContext } from 'react';
import { useEventEditController, type EventEditController } from '@/hooks/useEventEditController';

const EditControllerContext = createContext<EventEditController | null>(null);

export const EditControllerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const controller = useEventEditController();
  return (
    <EditControllerContext.Provider value={controller}>
      {children}
    </EditControllerContext.Provider>
  );
};

/**
 * Hook to access the global edit controller.
 * Falls back to a local instance if no provider is found (backward compat).
 */
export function useGlobalEditController(): EventEditController {
  const ctx = useContext(EditControllerContext);
  if (!ctx) {
    console.warn('[EditControllerContext] No provider found — falling back to local instance. Wrap your calendar in <EditControllerProvider>.');
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useEventEditController();
  }
  return ctx;
}
