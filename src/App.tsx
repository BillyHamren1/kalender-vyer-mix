import React, { createContext, lazy, Suspense, useState, useEffect } from 'react';
import { PlannerStoreProvider, usePlannerSync } from '@/stores/plannerStore';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useBackgroundImport } from "@/hooks/useBackgroundImport";
import { useSsoListener } from "@/hooks/useSsoListener";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { APP_MODE, getDefaultRoute } from "@/config/appMode";
import { LanguageProvider } from "@/i18n/LanguageContext";



// Main system pages — eager (used immediately after login)
import PlanningDashboard from "./pages/PlanningDashboard";
import MyProjects from "./pages/MyProjects";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import AuthResetPassword from "./pages/AuthResetPassword";
import ProjectLayout from "./pages/project/ProjectLayout";
import LargeProjectLayout from "./pages/project/LargeProjectLayout";

// Main system pages — lazy
const InvoicingPage = lazy(() => import("./pages/InvoicingPage"));
const CustomCalendarPage = lazy(() => import("./pages/CustomCalendarPage"));
const StaffManagement = lazy(() => import("./pages/StaffManagement"));
const TimeReportApprovals = lazy(() => import("./pages/TimeReportApprovals"));
const StaffTimeReports = lazy(() => import("./pages/StaffTimeReports"));
const AdminTimeReview = lazy(() => import("./pages/AdminTimeReview"));
const StaffDetail = lazy(() => import("./pages/StaffDetail"));
const BookingDetail = lazy(() => import("./pages/BookingDetail"));
const BookingList = lazy(() => import("./pages/BookingList"));
const ProjectManagement = lazy(() => import("./pages/ProjectManagement"));
const ProjectArchive = lazy(() => import("./pages/ProjectArchive"));
const ProjectClosing = lazy(() => import("./pages/ProjectClosing"));
const ProjectViewPage = lazy(() => import("./pages/project/ProjectViewPage"));
const EstablishmentPage = lazy(() => import("./pages/project/EstablishmentPage"));
const ProjectEconomyPage = lazy(() => import("./pages/project/ProjectEconomyPage"));
const LargeProjectViewPage = lazy(() => import("./pages/project/LargeProjectViewPage"));
const LargeEstablishmentPage = lazy(() => import("./pages/project/LargeEstablishmentPage"));
const LargeProjectEconomyPage = lazy(() => import("./pages/project/LargeProjectEconomyPage"));
const LargeCollaborationPage = lazy(() => import("./pages/project/LargeCollaborationPage"));
const EconomyOverview = lazy(() => import("./pages/EconomyOverview"));
const AnalyticsDashboard = lazy(() => import("./pages/AnalyticsDashboard"));
const ProjectEconomyDetail = lazy(() => import("./pages/ProjectEconomyDetail"));
const StaffRevenueOverview = lazy(() => import("./pages/StaffRevenueOverview"));
const JobDetail = lazy(() => import("./pages/JobDetail"));
const APIDocumentation = lazy(() => import("./pages/APIDocumentation"));
const StaffDashboard = lazy(() => import("./pages/StaffDashboard"));
const CommunicationPage = lazy(() => import("./pages/CommunicationPage"));
const OpsControlCenter = lazy(() => import("./pages/OpsControlCenter"));
const SyncReconciliation = lazy(() => import("./pages/SyncReconciliation"));
const StaffLiveDebug = lazy(() => import("./pages/admin/StaffLiveDebug"));
const LegacyIncomingPackingDebug = lazy(() => import("./pages/admin/LegacyIncomingPackingDebug"));
const TransportResponse = lazy(() => import("./pages/TransportResponse"));

// Logistics pages
const LogisticsHub = lazy(() => import("./pages/LogisticsHub"));

// Layouts — eager
import MainSystemLayout from "@/components/layouts/MainSystemLayout";
import WarehouseSystemLayout from "@/components/layouts/WarehouseSystemLayout";

// ── App Shells (native-mode wrappers) ──────────────────────────────
import TimeAppShell from "@/shells/TimeAppShell";
import ScannerAppShell from "@/shells/ScannerAppShell";

// Warehouse system pages — lazy
const WarehouseDashboard = lazy(() => import("./pages/WarehouseDashboard"));
const WarehouseCalendarPage = lazy(() => import("./pages/WarehouseCalendarPage"));
const PackingManagement = lazy(() => import("./pages/PackingManagement"));
const PackingDetail = lazy(() => import("./pages/PackingDetail"));
const WarehouseProjectDetail = lazy(() => import("./pages/WarehouseProjectDetail"));
const PackingVerify = lazy(() => import("./pages/PackingVerify"));
const WarehouseEconomy = lazy(() => import("./pages/WarehouseEconomy"));
const WarehouseInventoryPlaceholder = lazy(() => import("./pages/WarehouseInventoryPlaceholder"));
const WarehouseServicePlaceholder = lazy(() => import("./pages/WarehouseServicePlaceholder"));

// Mobile staff app pages (web mode only — native uses shells)
import { MobileAuthProvider } from "@/contexts/MobileAuthContext";
import MobileProtectedRoute from "@/components/mobile-app/MobileProtectedRoute";
import MobileAppLayout from "@/components/mobile-app/MobileAppLayout";
import PlannerOnlyRoute from "@/components/mobile-app/PlannerOnlyRoute";
const MobileLogin = lazy(() => import("./pages/mobile/MobileLogin"));
const MobileJobs = lazy(() => import("./pages/mobile/MobileJobs"));
const MobileJobDetail = lazy(() => import("./pages/mobile/MobileJobDetail"));
const MobileProjectDetail = lazy(() => import("./pages/mobile/MobileProjectDetail"));
const MobileLocationDetail = lazy(() => import("./pages/mobile/MobileLocationDetail"));
const MobileTimeReport = lazy(() => import("./pages/mobile/MobileTimeReport"));
const MobileEditTimeReport = lazy(() => import("./pages/mobile/MobileEditTimeReport"));
const MobileExpenses = lazy(() => import("./pages/mobile/MobileExpenses"));
const MobileProfile = lazy(() => import("./pages/mobile/MobileProfile"));
const MobileTimeHistory = lazy(() => import("./pages/mobile/MobileTimeHistory"));
const MobileInbox = lazy(() => import("./pages/mobile/MobileInbox"));
const MobileMyFlags = lazy(() => import("./pages/mobile/MobileMyFlags"));
const MobileDayReview = lazy(() => import("./pages/mobile/MobileDayReview"));
const MobileCompleteJob = lazy(() => import("./pages/mobile/MobileCompleteJob"));
const MobileOverview = lazy(() => import("./pages/mobile/MobileOverview"));
const MobileScannerApp = lazy(() => import("./pages/MobileScannerApp"));
const ScannerLogin = lazy(() => import("./pages/scanner/ScannerLogin"));
import ScannerRouteGuard from "./components/scanner/ScannerProtectedRoute";

// EconomyTimeReports (used inside MainSystemLayout pages)
const EconomyTimeReports = lazy(() => import("./pages/EconomyTimeReports"));

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

/**
 * Runs hooks that require auth/org context — only for web & time modes.
 * Scanner mode must boot cleanly without these.
 */
const WebTimeBootstrap: React.FC = () => {
  useBackgroundImport();
  useSsoListener();
  return null;
};

/**
 * Deterministic shell selector — exactly one shell per APP_MODE.
 * Prevents cross-shell redirects (e.g. Time catching /scanner routes).
 */
const ShellEntry: React.FC = () => {
  switch (APP_MODE) {
    case 'scanner':
      return <ScannerAppShell />;
    case 'time':
      return <TimeAppShell />;
    case 'web':
    default:
      return <WebRoutes />;
  }
};

// Inner component that uses the background import hook
const AppContent = () => {
  const [lastViewedDate, setLastViewedDate] = useState(new Date());
  const [lastPath, setLastPath] = useState('');

  const contextValue = {
    lastViewedDate,
    setLastViewedDate,
    lastPath,
    setLastPath,
  };

  return (
    <PlannerStoreProvider>
      <CalendarContext.Provider value={contextValue}>
        {/* Bridge: sync legacy CalendarContext state into PlannerStore */}
        <LegacyStateBridge lastViewedDate={lastViewedDate} lastPath={lastPath} />
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            {APP_MODE !== 'scanner' && <WebTimeBootstrap />}
            <BrowserRouter>
              <ShellEntry />
            </BrowserRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </CalendarContext.Provider>
    </PlannerStoreProvider>
  );
};

/**
 * WebRoutes — the full web application with all routes.
 * Only rendered when APP_MODE === 'web'.
 */
const WebRoutes: React.FC = () => {
  const defaultRoute = getDefaultRoute();

  const routeFallback = (
    <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
      Laddar…
    </div>
  );

  return (
    <Suspense fallback={routeFallback}>
    <Routes>
      <Route path="/auth" element={<AuthProvider><Auth /></AuthProvider>} />
      <Route path="/auth/reset" element={<AuthProvider><AuthResetPassword /></AuthProvider>} />

      {/* Public transport partner response page - no auth */}
      <Route path="/transport-svar" element={<TransportResponse />} />

      {/* Mobile Staff App (accessible via web too) */}
      <Route path="/m/login" element={<LanguageProvider><MobileAuthProvider><MobileLogin /></MobileAuthProvider></LanguageProvider>} />
      <Route path="/m" element={<LanguageProvider><MobileAuthProvider><MobileProtectedRoute><MobileAppLayout><MobileJobs /></MobileAppLayout></MobileProtectedRoute></MobileAuthProvider></LanguageProvider>} />
      <Route path="/m/job/:id" element={<LanguageProvider><MobileAuthProvider><MobileProtectedRoute><MobileAppLayout><MobileJobDetail /></MobileAppLayout></MobileProtectedRoute></MobileAuthProvider></LanguageProvider>} />
      <Route path="/m/job/:id/complete" element={<LanguageProvider><MobileAuthProvider><MobileProtectedRoute><MobileAppLayout><MobileCompleteJob /></MobileAppLayout></MobileProtectedRoute></MobileAuthProvider></LanguageProvider>} />
      <Route path="/m/project/:projectId" element={<LanguageProvider><MobileAuthProvider><MobileProtectedRoute><MobileAppLayout><MobileProjectDetail /></MobileAppLayout></MobileProtectedRoute></MobileAuthProvider></LanguageProvider>} />
      <Route path="/m/location/:id" element={<LanguageProvider><MobileAuthProvider><MobileProtectedRoute><MobileAppLayout><MobileLocationDetail /></MobileAppLayout></MobileProtectedRoute></MobileAuthProvider></LanguageProvider>} />
      <Route path="/m/report" element={<LanguageProvider><MobileAuthProvider><MobileProtectedRoute><MobileAppLayout><MobileTimeReport /></MobileAppLayout></MobileProtectedRoute></MobileAuthProvider></LanguageProvider>} />
      <Route path="/m/report/:id/edit" element={<LanguageProvider><MobileAuthProvider><MobileProtectedRoute><MobileAppLayout><MobileEditTimeReport /></MobileAppLayout></MobileProtectedRoute></MobileAuthProvider></LanguageProvider>} />
      <Route path="/m/expenses" element={<LanguageProvider><MobileAuthProvider><MobileProtectedRoute><MobileAppLayout><MobileExpenses /></MobileAppLayout></MobileProtectedRoute></MobileAuthProvider></LanguageProvider>} />
      <Route path="/m/profile" element={<LanguageProvider><MobileAuthProvider><MobileProtectedRoute><MobileAppLayout><MobileProfile /></MobileAppLayout></MobileProtectedRoute></MobileAuthProvider></LanguageProvider>} />
      <Route path="/m/time-history" element={<LanguageProvider><MobileAuthProvider><MobileProtectedRoute><MobileAppLayout><MobileTimeHistory /></MobileAppLayout></MobileProtectedRoute></MobileAuthProvider></LanguageProvider>} />
      <Route path="/m/inbox" element={<LanguageProvider><MobileAuthProvider><MobileProtectedRoute><MobileAppLayout><MobileInbox /></MobileAppLayout></MobileProtectedRoute></MobileAuthProvider></LanguageProvider>} />
      <Route path="/m/overview" element={<LanguageProvider><MobileAuthProvider><MobileProtectedRoute><PlannerOnlyRoute><MobileAppLayout><MobileOverview /></MobileAppLayout></PlannerOnlyRoute></MobileProtectedRoute></MobileAuthProvider></LanguageProvider>} />
      <Route path="/m/my-flags" element={<LanguageProvider><MobileAuthProvider><MobileProtectedRoute><MobileAppLayout><MobileMyFlags /></MobileAppLayout></MobileProtectedRoute></MobileAuthProvider></LanguageProvider>} />
      <Route path="/m/day-review" element={<LanguageProvider><MobileAuthProvider><MobileProtectedRoute><MobileAppLayout><MobileDayReview /></MobileAppLayout></MobileProtectedRoute></MobileAuthProvider></LanguageProvider>} />

      {/* Main System Routes - Protected (wrapped in AuthProvider) */}
      <Route path="/*" element={
        <AuthProvider>
          <Routes>
            <Route path="/" element={
              <ProtectedRoute>
                <Navigate to={defaultRoute} replace />
              </ProtectedRoute>
            } />
            <Route path="/dashboard" element={<ProtectedRoute><MainSystemLayout><PlanningDashboard /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/my-projects" element={<ProtectedRoute><MainSystemLayout><MyProjects /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/calendar" element={<ProtectedRoute><MainSystemLayout><CustomCalendarPage /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/staff-management" element={<ProtectedRoute><MainSystemLayout><StaffManagement /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/staff-dashboard" element={<ProtectedRoute><MainSystemLayout><StaffDashboard /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/communication" element={<ProtectedRoute><MainSystemLayout><CommunicationPage /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/ops-control" element={<ProtectedRoute><MainSystemLayout><OpsControlCenter /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/staff-management/time-approvals" element={<ProtectedRoute><MainSystemLayout><TimeReportApprovals /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/staff-management/time-reports" element={<ProtectedRoute><MainSystemLayout><StaffTimeReports /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/admin/time-review" element={<ProtectedRoute><MainSystemLayout><AdminTimeReview /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/staff/:staffId" element={<ProtectedRoute><MainSystemLayout><StaffDetail /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/booking/:bookingId" element={<ProtectedRoute><MainSystemLayout><BookingDetail /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/booking-list" element={<ProtectedRoute><MainSystemLayout><BookingList /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/projects" element={<ProtectedRoute><MainSystemLayout><ProjectManagement /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/projects/archive" element={<ProtectedRoute><MainSystemLayout><ProjectArchive /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/projects/closing" element={<ProtectedRoute><MainSystemLayout><ProjectClosing /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/project/:projectId" element={<ProtectedRoute><MainSystemLayout><ProjectLayout /></MainSystemLayout></ProtectedRoute>}>
              <Route index element={<ProjectViewPage />} />
              <Route path="execution" element={<EstablishmentPage />} />
              <Route path="establishment" element={<EstablishmentPage />} />
              <Route path="economy" element={<ProjectEconomyPage />} />
            </Route>
            <Route path="/economy" element={<ProtectedRoute><MainSystemLayout><EconomyOverview /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/economy/:id" element={<ProtectedRoute><MainSystemLayout><ProjectEconomyDetail /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/analytics" element={<ProtectedRoute><MainSystemLayout><AnalyticsDashboard /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/jobs/:id" element={<ProtectedRoute><JobDetail /></ProtectedRoute>} />
            <Route path="/large-project/:id" element={<ProtectedRoute><MainSystemLayout><LargeProjectLayout /></MainSystemLayout></ProtectedRoute>}>
              <Route index element={<LargeProjectViewPage />} />
              <Route path="establishment" element={<LargeEstablishmentPage />} />
              <Route path="collaboration" element={<LargeCollaborationPage />} />
              <Route path="economy" element={<LargeProjectEconomyPage />} />
            </Route>
            <Route path="/invoicing" element={<ProtectedRoute><MainSystemLayout><InvoicingPage /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/api-docs" element={<ProtectedRoute><MainSystemLayout><APIDocumentation /></MainSystemLayout></ProtectedRoute>} />

            {/* Logistics Routes */}
            <Route path="/logistics" element={<ProtectedRoute><MainSystemLayout><LogisticsHub /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/logistics/planning" element={<ProtectedRoute><MainSystemLayout><LogisticsHub /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/logistics/routes" element={<ProtectedRoute><MainSystemLayout><LogisticsHub /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/logistics/vehicles" element={<ProtectedRoute><MainSystemLayout><LogisticsHub /></MainSystemLayout></ProtectedRoute>} />

            {/* Warehouse System Routes */}
            <Route path="/warehouse" element={<ProtectedRoute><WarehouseSystemLayout><WarehouseDashboard /></WarehouseSystemLayout></ProtectedRoute>} />
            <Route path="/warehouse/calendar" element={<ProtectedRoute><WarehouseSystemLayout><WarehouseCalendarPage /></WarehouseSystemLayout></ProtectedRoute>} />
            <Route path="/warehouse/packing" element={<ProtectedRoute><WarehouseSystemLayout><PackingManagement /></WarehouseSystemLayout></ProtectedRoute>} />
            <Route path="/warehouse/packing/:packingId" element={<ProtectedRoute><WarehouseSystemLayout><PackingDetail /></WarehouseSystemLayout></ProtectedRoute>} />
            <Route path="/warehouse/packing/:packingId/verify" element={<ProtectedRoute><PackingVerify /></ProtectedRoute>} />
            <Route path="/warehouse/projects/:warehouseProjectId" element={<ProtectedRoute><WarehouseSystemLayout><WarehouseProjectDetail /></WarehouseSystemLayout></ProtectedRoute>} />
            <Route path="/warehouse/economy" element={<ProtectedRoute><WarehouseSystemLayout><WarehouseEconomy /></WarehouseSystemLayout></ProtectedRoute>} />
            <Route path="/warehouse/inventory" element={<ProtectedRoute><WarehouseSystemLayout><WarehouseInventoryPlaceholder /></WarehouseSystemLayout></ProtectedRoute>} />
            <Route path="/warehouse/service" element={<ProtectedRoute><WarehouseSystemLayout><WarehouseServicePlaceholder /></WarehouseSystemLayout></ProtectedRoute>} />
            
            {/* Scanner App (accessible via web) */}
            <Route path="/scanner" element={<MobileAuthProvider><ScannerRouteGuard><MobileScannerApp /></ScannerRouteGuard></MobileAuthProvider>} />
            <Route path="/scanner/login" element={<MobileAuthProvider><ScannerLogin /></MobileAuthProvider>} />

            {/* Hidden admin sync tool */}
            <Route path="/admin/sync" element={<ProtectedRoute><MainSystemLayout><SyncReconciliation /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/admin/staff-live" element={<ProtectedRoute><MainSystemLayout><StaffLiveDebug /></MainSystemLayout></ProtectedRoute>} />
            <Route path="/admin/legacy-incoming-packing" element={<ProtectedRoute><MainSystemLayout><LegacyIncomingPackingDebug /></MainSystemLayout></ProtectedRoute>} />

            {/* Fallback */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      } />
    </Routes>
    </Suspense>
  );
};

/**
 * Bridge component: syncs legacy CalendarContext state into PlannerStore.
 * LEGACY — remove once CalendarContext is fully replaced by PlannerStore.
 */
const LegacyStateBridge: React.FC<{ lastViewedDate: Date; lastPath: string }> = ({ lastViewedDate, lastPath }) => {
  const syncToStore = usePlannerSync();
  
  useEffect(() => {
    syncToStore({ selectedDate: lastViewedDate, lastPath });
  }, [lastViewedDate, lastPath, syncToStore]);
  
  return null;
};

// Wrapper component to ensure hooks work correctly
const App = () => {
  return <AppContent />;
};

export default App;
