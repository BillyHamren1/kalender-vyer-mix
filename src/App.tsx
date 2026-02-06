import React, { createContext, useState } from 'react';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useBackgroundImport } from "@/hooks/useBackgroundImport";
import { useSsoListener } from "@/hooks/useSsoListener";
import { AuthProvider } from "@/contexts/AuthContext";
import { MobileAuthProvider } from "@/contexts/MobileAuthContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import MobileProtectedRoute from "@/components/mobile-app/MobileProtectedRoute";

// Layouts
import MainSystemLayout from "@/components/layouts/MainSystemLayout";
import WarehouseSystemLayout from "@/components/layouts/WarehouseSystemLayout";
import MobileAppLayout from "@/components/mobile-app/MobileAppLayout";

// Main system pages
import Index from "./pages/Index";
import CustomCalendarPage from "./pages/CustomCalendarPage";
import StaffManagement from "./pages/StaffManagement";
import TimeReportApprovals from "./pages/TimeReportApprovals";
import StaffDetail from "./pages/StaffDetail";
import BookingDetail from "./pages/BookingDetail";
import BookingList from "./pages/BookingList";
import ProjectManagement from "./pages/ProjectManagement";
import ProjectArchive from "./pages/ProjectArchive";
import ProjectDetail from "./pages/ProjectDetail";
import EconomyOverview from "./pages/EconomyOverview";
import ProjectEconomyDetail from "./pages/ProjectEconomyDetail";
import PlanningDashboard from "./pages/PlanningDashboard";
import StaffRevenueOverview from "./pages/StaffRevenueOverview";
import JobDetail from "./pages/JobDetail";
import LargeProjectDetail from "./pages/LargeProjectDetail";
import APIDocumentation from "./pages/APIDocumentation";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import AuthResetPassword from "./pages/AuthResetPassword";

// Logistics pages
import LogisticsPlanning from "./pages/LogisticsPlanning";
import LogisticsVehicles from "./pages/LogisticsVehicles";
import LogisticsRoutes from "./pages/LogisticsRoutes";

// Warehouse system pages
import WarehouseDashboard from "./pages/WarehouseDashboard";
import WarehouseCalendarPage from "./pages/WarehouseCalendarPage";
import PackingManagement from "./pages/PackingManagement";
import PackingDetail from "./pages/PackingDetail";
import PackingVerify from "./pages/PackingVerify";
import WarehouseEconomy from "./pages/WarehouseEconomy";
import WarehouseInventoryPlaceholder from "./pages/WarehouseInventoryPlaceholder";
import WarehouseServicePlaceholder from "./pages/WarehouseServicePlaceholder";
import MobileScannerApp from "./pages/MobileScannerApp";

// Mobile staff app pages
import MobileLogin from "./pages/mobile/MobileLogin";
import MobileJobs from "./pages/mobile/MobileJobs";
import MobileJobDetail from "./pages/mobile/MobileJobDetail";
import MobileTimeReport from "./pages/mobile/MobileTimeReport";
import MobileExpenses from "./pages/mobile/MobileExpenses";
import MobileProfile from "./pages/mobile/MobileProfile";

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
  
  // SSO listener for EventFlow Hub integration
  useSsoListener();

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
                {/* Auth Routes - Not Protected */}
                <Route path="/auth" element={<AuthProvider><Auth /></AuthProvider>} />
                <Route path="/auth/reset" element={<AuthProvider><AuthResetPassword /></AuthProvider>} />

                {/* Mobile Staff App - Completely isolated system (own auth) */}
                <Route path="/m/login" element={<MobileAuthProvider><MobileLogin /></MobileAuthProvider>} />
                <Route path="/m" element={<MobileAuthProvider><MobileProtectedRoute><MobileAppLayout><MobileJobs /></MobileAppLayout></MobileProtectedRoute></MobileAuthProvider>} />
                <Route path="/m/job/:id" element={<MobileAuthProvider><MobileProtectedRoute><MobileAppLayout><MobileJobDetail /></MobileAppLayout></MobileProtectedRoute></MobileAuthProvider>} />
                <Route path="/m/report" element={<MobileAuthProvider><MobileProtectedRoute><MobileAppLayout><MobileTimeReport /></MobileAppLayout></MobileProtectedRoute></MobileAuthProvider>} />
                <Route path="/m/expenses" element={<MobileAuthProvider><MobileProtectedRoute><MobileAppLayout><MobileExpenses /></MobileAppLayout></MobileProtectedRoute></MobileAuthProvider>} />
                <Route path="/m/profile" element={<MobileAuthProvider><MobileProtectedRoute><MobileAppLayout><MobileProfile /></MobileAppLayout></MobileProtectedRoute></MobileAuthProvider>} />

                {/* Main System Routes - Protected (wrapped in AuthProvider) */}
                <Route path="/*" element={
                  <AuthProvider>
                    <Routes>
                      <Route path="/" element={<ProtectedRoute><MainSystemLayout><PlanningDashboard /></MainSystemLayout></ProtectedRoute>} />
                      <Route path="/dashboard" element={<ProtectedRoute><MainSystemLayout><PlanningDashboard /></MainSystemLayout></ProtectedRoute>} />
                      <Route path="/calendar" element={<ProtectedRoute><MainSystemLayout><CustomCalendarPage /></MainSystemLayout></ProtectedRoute>} />
                      <Route path="/staff-management" element={<ProtectedRoute><MainSystemLayout><StaffManagement /></MainSystemLayout></ProtectedRoute>} />
                      <Route path="/staff-management/time-approvals" element={<ProtectedRoute><MainSystemLayout><TimeReportApprovals /></MainSystemLayout></ProtectedRoute>} />
                      <Route path="/staff/:staffId" element={<ProtectedRoute><MainSystemLayout><StaffDetail /></MainSystemLayout></ProtectedRoute>} />
                      <Route path="/booking/:bookingId" element={<ProtectedRoute><MainSystemLayout><BookingDetail /></MainSystemLayout></ProtectedRoute>} />
                      <Route path="/booking-list" element={<ProtectedRoute><MainSystemLayout><BookingList /></MainSystemLayout></ProtectedRoute>} />
                      <Route path="/projects" element={<ProtectedRoute><MainSystemLayout><ProjectManagement /></MainSystemLayout></ProtectedRoute>} />
                      <Route path="/projects/archive" element={<ProtectedRoute><MainSystemLayout><ProjectArchive /></MainSystemLayout></ProtectedRoute>} />
                      <Route path="/project/:projectId" element={<ProtectedRoute><MainSystemLayout><ProjectDetail /></MainSystemLayout></ProtectedRoute>} />
                      <Route path="/economy" element={<ProtectedRoute><MainSystemLayout><EconomyOverview /></MainSystemLayout></ProtectedRoute>} />
                      <Route path="/economy/projects" element={<ProtectedRoute><MainSystemLayout><EconomyOverview view="projects" /></MainSystemLayout></ProtectedRoute>} />
                      <Route path="/economy/staff" element={<ProtectedRoute><MainSystemLayout><EconomyOverview view="staff" /></MainSystemLayout></ProtectedRoute>} />
                      <Route path="/economy/staff-revenue" element={<ProtectedRoute><MainSystemLayout><StaffRevenueOverview /></MainSystemLayout></ProtectedRoute>} />
                      <Route path="/economy/:id" element={<ProtectedRoute><MainSystemLayout><ProjectEconomyDetail /></MainSystemLayout></ProtectedRoute>} />
                      <Route path="/jobs/:id" element={<ProtectedRoute><JobDetail /></ProtectedRoute>} />
                      <Route path="/large-project/:id" element={<ProtectedRoute><LargeProjectDetail /></ProtectedRoute>} />
                      <Route path="/api-docs" element={<ProtectedRoute><MainSystemLayout><APIDocumentation /></MainSystemLayout></ProtectedRoute>} />

                      {/* Logistics Routes */}
                      <Route path="/logistics" element={<ProtectedRoute><MainSystemLayout><LogisticsPlanning /></MainSystemLayout></ProtectedRoute>} />
                      <Route path="/logistics/planning" element={<ProtectedRoute><MainSystemLayout><LogisticsPlanning /></MainSystemLayout></ProtectedRoute>} />
                      <Route path="/logistics/routes" element={<ProtectedRoute><MainSystemLayout><LogisticsRoutes /></MainSystemLayout></ProtectedRoute>} />
                      <Route path="/logistics/vehicles" element={<ProtectedRoute><MainSystemLayout><LogisticsVehicles /></MainSystemLayout></ProtectedRoute>} />

                      {/* Warehouse System Routes */}
                      <Route path="/warehouse" element={<ProtectedRoute><WarehouseSystemLayout><WarehouseDashboard /></WarehouseSystemLayout></ProtectedRoute>} />
                      <Route path="/warehouse/calendar" element={<ProtectedRoute><WarehouseSystemLayout><WarehouseCalendarPage /></WarehouseSystemLayout></ProtectedRoute>} />
                      <Route path="/warehouse/packing" element={<ProtectedRoute><WarehouseSystemLayout><PackingManagement /></WarehouseSystemLayout></ProtectedRoute>} />
                      <Route path="/warehouse/packing/:packingId" element={<ProtectedRoute><WarehouseSystemLayout><PackingDetail /></WarehouseSystemLayout></ProtectedRoute>} />
                      <Route path="/warehouse/packing/:packingId/verify" element={<ProtectedRoute><PackingVerify /></ProtectedRoute>} />
                      <Route path="/warehouse/economy" element={<ProtectedRoute><WarehouseSystemLayout><WarehouseEconomy /></WarehouseSystemLayout></ProtectedRoute>} />
                      <Route path="/warehouse/inventory" element={<ProtectedRoute><WarehouseSystemLayout><WarehouseInventoryPlaceholder /></WarehouseSystemLayout></ProtectedRoute>} />
                      <Route path="/warehouse/service" element={<ProtectedRoute><WarehouseSystemLayout><WarehouseServicePlaceholder /></WarehouseSystemLayout></ProtectedRoute>} />
                      
                      {/* Mobile Scanner App */}
                      <Route path="/scanner" element={<ProtectedRoute><MobileScannerApp /></ProtectedRoute>} />

                      {/* Fallback */}
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AuthProvider>
                } />
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
