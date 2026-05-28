import React, { createContext, useContext } from 'react';

/**
 * Hindrar att högerklicks-menyn "Konsolidera till nytt stort projekt" /
 * "Lägg till i stort projekt" renderas på event-blocken i kalendern.
 *
 * Sätts till `true` av projektkalendrar (ProjectCalendarView,
 * LargeProjectPlannerCalendarView). Personalkalendern lämnar default
 * (false) så att menyn finns kvar där.
 *
 * Bakgrund: 2026-05-28 råkade en användare trigga consolidate-projects
 * via högerklick inifrån projektkalendern. Hela storprojektet skapades
 * om och dök upp som "Nya bokningar". Menyn hör inte hemma där.
 */
const ConsolidationMenuDisabledContext = createContext<boolean>(false);

export const ConsolidationMenuDisabledProvider: React.FC<{
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ disabled = true, children }) => (
  <ConsolidationMenuDisabledContext.Provider value={disabled}>
    {children}
  </ConsolidationMenuDisabledContext.Provider>
);

export function useConsolidationMenuDisabled(): boolean {
  return useContext(ConsolidationMenuDisabledContext);
}
