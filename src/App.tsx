import React, { createContext, useState } from 'react';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useBackgroundImport } from "@/hooks/useBackgroundImport";

// Layouts
import MainSystemLayout from "@/components/layouts/MainSystemLayout";
import WarehouseSystemLayout from "@/components/layouts/WarehouseSystemLayout";

// Main system pages
import Index from "./pages/Index";
import CustomCalendarPage from "./pages/CustomCalendarPage";
import StaffManagement from "./pages/StaffManagement";
import StaffDetail from "./pages/StaffDetail";
import BookingDetail from "./pages/BookingDetail";
import BookingList from "./pages/BookingList";
import ProjectManagement from "./pages/ProjectManagement";
import ProjectDetail from "./pages/ProjectDetail";
import EconomyOverview from "./pages/EconomyOverview";
import ProjectEconomyDetail from "./pages/ProjectEconomyDetail";
import PlanningDashboard from "./pages/PlanningDashboard";
import JobDetail from "./pages/JobDetail";
import APIDocumentation from "./pages/APIDocumentation";
import NotFound from "./pages/NotFound";

// Warehouse system pages
import WarehouseDashboard from "./pages/WarehouseDashboard";
import WarehouseCalendarPage from "./pages/WarehouseCalendarPage";
import PackingManagement from "./pages/PackingManagement";
import PackingDetail from "./pages/PackingDetail";
import WarehouseInventoryPlaceholder from "./pages/WarehouseInventoryPlaceholder";
import WarehouseServicePlaceholder from "./pages/WarehouseServicePlaceholder";

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
            <Routes>
              {/* Main System Routes */}
              <Route path="/" element={<MainSystemLayout><PlanningDashboard /></MainSystemLayout>} />
              <Route path="/dashboard" element={<MainSystemLayout><PlanningDashboard /></MainSystemLayout>} />
              <Route path="/calendar" element={<MainSystemLayout><CustomCalendarPage /></MainSystemLayout>} />
              <Route path="/staff-management" element={<MainSystemLayout><StaffManagement /></MainSystemLayout>} />
              <Route path="/staff/:staffId" element={<MainSystemLayout><StaffDetail /></MainSystemLayout>} />
              <Route path="/booking/:bookingId" element={<MainSystemLayout><BookingDetail /></MainSystemLayout>} />
              <Route path="/booking-list" element={<MainSystemLayout><BookingList /></MainSystemLayout>} />
              <Route path="/projects" element={<MainSystemLayout><ProjectManagement /></MainSystemLayout>} />
              <Route path="/project/:projectId" element={<MainSystemLayout><ProjectDetail /></MainSystemLayout>} />
              <Route path="/economy" element={<MainSystemLayout><EconomyOverview /></MainSystemLayout>} />
              <Route path="/economy/projects" element={<MainSystemLayout><EconomyOverview view="projects" /></MainSystemLayout>} />
              <Route path="/economy/staff" element={<MainSystemLayout><EconomyOverview view="staff" /></MainSystemLayout>} />
              <Route path="/economy/:id" element={<MainSystemLayout><ProjectEconomyDetail /></MainSystemLayout>} />
              <Route path="/jobs/:id" element={<JobDetail />} />
              <Route path="/api-docs" element={<MainSystemLayout><APIDocumentation /></MainSystemLayout>} />

              {/* Warehouse System Routes */}
              <Route path="/warehouse" element={<WarehouseSystemLayout><WarehouseDashboard /></WarehouseSystemLayout>} />
              <Route path="/warehouse/calendar" element={<WarehouseSystemLayout><WarehouseCalendarPage /></WarehouseSystemLayout>} />
              <Route path="/warehouse/packing" element={<WarehouseSystemLayout><PackingManagement /></WarehouseSystemLayout>} />
              <Route path="/warehouse/packing/:packingId" element={<WarehouseSystemLayout><PackingDetail /></WarehouseSystemLayout>} />
              <Route path="/warehouse/inventory" element={<WarehouseSystemLayout><WarehouseInventoryPlaceholder /></WarehouseSystemLayout>} />
              <Route path="/warehouse/service" element={<WarehouseSystemLayout><WarehouseServicePlaceholder /></WarehouseSystemLayout>} />

              {/* Fallback */}
              <Route path="*" element={<NotFound />} />
            </Routes>
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
