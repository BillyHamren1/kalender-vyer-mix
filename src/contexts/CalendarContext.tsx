import React, { createContext, useState, ReactNode } from 'react';

interface CalendarContextType {
  lastViewedDate: Date;
  setLastViewedDate: (date: Date) => void;
  lastPath: string;
  setLastPath: (path: string) => void;
}

export const CalendarContext = createContext<CalendarContextType>({
  lastViewedDate: new Date(),
  setLastViewedDate: () => {},
  lastPath: '',
  setLastPath: () => {},
});

interface CalendarProviderProps {
  children: ReactNode;
}

export const CalendarProvider: React.FC<CalendarProviderProps> = ({ children }) => {
  const [lastViewedDate, setLastViewedDate] = useState(new Date());
  const [lastPath, setLastPath] = useState('');

  const contextValue = {
    lastViewedDate,
    setLastViewedDate,
    lastPath,
    setLastPath,
  };

  return (
    <CalendarContext.Provider value={contextValue}>
      {children}
    </CalendarContext.Provider>
  );
};
