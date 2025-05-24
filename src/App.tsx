import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { createContext, useState, useEffect } from "react";
import Index from "./pages/Index";
import ResourceView from "./pages/ResourceView";
import DayView from "./pages/DayView";
import BookingList from "./pages/BookingList";
import JobsList from "./pages/JobsList";
import BookingDetail from "./pages/BookingDetail";
import APITester from "./pages/APITester";
import NotFound from "./pages/NotFound";
import StaffEndpoint from "./pages/StaffEndpoint";
import LogisticsMap from "./pages/LogisticsMap";
import WeeklyResourceView from "./pages/WeeklyResourceView";
import MonthlyResourceView from "./pages/MonthlyResourceView";
import TestMonthlyView from "./pages/TestMonthlyView";
import MonthlyBookingSchedulePage from "./pages/MonthlyBookingSchedule";

// Create context to share calendar date across components
export const CalendarContext = createContext<{
  lastViewedDate: Date | null;
  setLastViewedDate: (date: Date) => void;
  lastPath: string | null;
  setLastPath: (path: string) => void;
}>({
  lastViewedDate: null,
  setLastViewedDate: () => {},
  lastPath: null,
  setLastPath: () => {}
});

const queryClient = new QueryClient();

const AppContent = () => {
  const [lastViewedDate, setLastViewedDate] = useState<Date | null>(() => {
    const stored = sessionStorage.getItem('calendarDate');
    return stored ? new Date(stored) : null;
  });
  
  const [lastPath, setLastPath] = useState<string | null>(null);
  const location = useLocation();
  
  // Keep track of the last path before navigating to booking detail
  useEffect(() => {
    if (!location.pathname.includes('/booking/')) {
      setLastPath(location.pathname);
    }
  }, [location.pathname]);
  
  return (
    <CalendarContext.Provider value={{ lastViewedDate, setLastViewedDate, lastPath, setLastPath }}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <div className="min-h-screen bg-gray-50">
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/resource-view" element={<ResourceView />} />
            <Route path="/day-view" element={<DayView />} />
            <Route path="/booking-list" element={<BookingList />} />
            <Route path="/jobs-list" element={<JobsList />} />
            <Route path="/booking/:id" element={<BookingDetail />} />
            <Route path="/api-tester" element={<APITester />} />
            <Route path="/staff/:staffId" element={<StaffEndpoint />} />
            <Route path="/logistics-map" element={<LogisticsMap />} />
            <Route path="/weekly-view" element={<WeeklyResourceView />} />
            <Route path="/monthly-view" element={<MonthlyResourceView />} />
            <Route path="/test-monthly-view" element={<TestMonthlyView />} />
            <Route path="/monthly-booking-schedule" element={<MonthlyBookingSchedulePage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </TooltipProvider>
    </CalendarContext.Provider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
