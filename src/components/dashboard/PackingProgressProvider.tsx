import React, { createContext, useContext } from 'react';
import { PackingProgress, usePackingProgressBatch } from '@/hooks/usePackingProgress';
import { DashboardEvent } from '@/hooks/useDashboardEvents';

const PackingProgressContext = createContext<Map<string, PackingProgress>>(new Map());

export const usePackingProgressContext = () => useContext(PackingProgressContext);

interface PackingProgressProviderProps {
  events: DashboardEvent[];
  children: React.ReactNode;
}

/**
 * Wraps dashboard views to batch-fetch packing progress for all visible bookings.
 */
export const PackingProgressProvider: React.FC<PackingProgressProviderProps> = ({ events, children }) => {
  const bookingIds = events
    .filter(e => e.category === 'planning' && e.bookingId)
    .map(e => e.bookingId);

  const { progressMap } = usePackingProgressBatch(bookingIds);

  return (
    <PackingProgressContext.Provider value={progressMap}>
      {children}
    </PackingProgressContext.Provider>
  );
};
