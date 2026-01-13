import React, { createContext, useState } from 'react';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useBackgroundImport } from "@/hooks/useBackgroundImport";
import GlobalTopBar from "@/components/GlobalTopBar";
import Index from "./pages/Index";
import CustomCalendarPage from "./pages/CustomCalendarPage";
import StaffManagement from "./pages/StaffManagement";
import StaffDetail from "./pages/StaffDetail";
import BookingDetail from "./pages/BookingDetail";
import BookingList from "./pages/BookingList";
import ProjectManagement from "./pages/ProjectManagement";
import ProjectDetail from "./pages/ProjectDetail";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Create and export CalendarContext
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

// Inner component that uses the background import hook
const AppContent = () => {
  const [lastViewedDate, setLastViewedDate] = useState(new Date());
  const [lastPath, setLastPath] = useState('');
  
  // Centralized background import - runs once at app level
  useBackgroundImport();

  const contextValue = {
    lastViewedDate,
    setLastViewedDate,
    lastPath,
    setLastPath,
  };

  return (
    <CalendarContext.Provider value={contextValue}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <BrowserRouter>
            <div className="min-h-screen flex flex-col">
              <GlobalTopBar />
              <div className="flex-1">
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/calendar" element={<CustomCalendarPage />} />
                  <Route path="/custom-calendar" element={<CustomCalendarPage />} />
                  <Route path="/staff-management" element={<StaffManagement />} />
                  <Route path="/staff/:staffId" element={<StaffDetail />} />
                  <Route path="/booking/:bookingId" element={<BookingDetail />} />
                  <Route path="/booking-list" element={<BookingList />} />
                  <Route path="/projects" element={<ProjectManagement />} />
                  <Route path="/project/:projectId" element={<ProjectDetail />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </div>
            </div>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </CalendarContext.Provider>
  );
};

// Wrapper component to ensure hooks work correctly
const App = () => {
  return <AppContent />;
};

export default App;
