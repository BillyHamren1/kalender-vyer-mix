import React, { createContext, lazy, Suspense, useState, useEffect } from 'react';
import { PlannerStoreProvider, usePlannerSync } from '@/stores/plannerStore';
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { useBackgroundImport } from "@/hooks/useBackgroundImport";
import { useSsoListener } from "@/hooks/useSsoListener";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { APP_MODE, getDefaultRoute } from "@/config/appMode";
import { LanguageProvider } from "@/i18n/LanguageContext";
import { lazyWithRecovery } from "@/utils/lazyWithRecovery";



// Main system pages — eager (used immediately after login)
import PlanningDashboard from "./pages/PlanningDashboard";
import MyProjects from "./pages/MyProjects";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import AuthResetPassword from "./pages/AuthResetPassword";
import ProjectLayout from "./pages/project/ProjectLayout";
import LargeProjectLayout from "./pages/project/LargeProjectLayout";
import ProjectViewPage from "./pages/project/ProjectViewPage";
import EstablishmentPage from "./pages/project/EstablishmentPage";
import ProjectEconomyPage from "./pages/project/ProjectEconomyPage";
import LargeProjectViewPage from "./pages/project/LargeProjectViewPage";
import LargeEstablishmentPage from "./pages/project/LargeEstablishmentPage";
import LargeProjectEconomyPage from "./pages/project/LargeProjectEconomyPage";
import LargeCollaborationPage from "./pages/project/LargeCollaborationPage";

// Main system pages — lazy
const InvoicingPage = lazyWithRecovery(() => import("./pages/InvoicingPage"));
const CustomCalendarPage = lazyWithRecovery(() => import("./pages/CustomCalendarPage"));
const StaffManagement = lazyWithRecovery(() => import("./pages/StaffManagement"));
const TimeReportApprovals = lazyWithRecovery(() => import("./pages/TimeReportApprovals"));
const StaffTimeReports = lazyWithRecovery(() => import("./pages/StaffTimeReports"));
const AdminTimeReview = lazyWithRecovery(() => import("./pages/AdminTimeReview"));
const StaffDetail = lazyWithRecovery(() => import("./pages/StaffDetail"));
const BookingDetail = lazyWithRecovery(() => import("./pages/BookingDetail"));
const BookingList = lazyWithRecovery(() => import("./pages/BookingList"));
const ProjectManagement = lazyWithRecovery(() => import("./pages/ProjectManagement"));
const ProjectArchive = lazyWithRecovery(() => import("./pages/ProjectArchive"));
const ProjectClosing = lazyWithRecovery(() => import("./pages/ProjectClosing"));
const EconomyOverview = lazyWithRecovery(() => import("./pages/EconomyOverview"));
const AnalyticsDashboard = lazyWithRecovery(() => import("./pages/AnalyticsDashboard"));
const ProjectEconomyDetail = lazyWithRecovery(() => import("./pages/ProjectEconomyDetail"));
const StaffRevenueOverview = lazyWithRecovery(() => import("./pages/StaffRevenueOverview"));
const JobDetail = lazyWithRecovery(() => import("./pages/JobDetail"));
const APIDocumentation = lazyWithRecovery(() => import("./pages/APIDocumentation"));
const StaffDashboard = lazyWithRecovery(() => import("./pages/StaffDashboard"));
const CommunicationPage = lazyWithRecovery(() => import("./pages/CommunicationPage"));
const OpsControlCenter = lazyWithRecovery(() => import("./pages/OpsControlCenter"));
const SyncReconciliation = lazyWithRecovery(() => import("./pages/SyncReconciliation"));
const StaffLiveDebug = lazyWithRecovery(() => import("./pages/admin/StaffLiveDebug"));
const StaffPresence = lazyWithRecovery(() => import("./pages/admin/StaffPresence"));
const TargetPresence = lazyWithRecovery(() => import("./pages/admin/TargetPresence"));
const PresenceHub = lazyWithRecovery(() => import("./pages/admin/PresenceHub"));
const StaffPresenceDay = lazyWithRecovery(() => import("./pages/admin/StaffPresenceDay"));
const TimeIntelligenceDebug = lazyWithRecovery(() => import("./pages/admin/TimeIntelligenceDebug"));
const LegacyIncomingPackingDebug = lazyWithRecovery(() => import("./pages/admin/LegacyIncomingPackingDebug"));
const WarehouseAssignmentsDebug = lazyWithRecovery(() => import("./pages/admin/WarehouseAssignmentsDebug"));
const TransportResponse = lazyWithRecovery(() => import("./pages/TransportResponse"));
const SuppliersPage = lazyWithRecovery(() => import("./pages/SuppliersPage"));

// Logistics pages
const LogisticsHub = lazyWithRecovery(() => import("./pages/LogisticsHub"));

// Layouts — eager
import MainSystemLayout from "@/components/layouts/MainSystemLayout";
import WarehouseSystemLayout from "@/components/layouts/WarehouseSystemLayout";

// ── App Shells (native-mode wrappers) ──────────────────────────────
import TimeAppShell from "@/shells/TimeAppShell";
import ScannerAppShell from "@/shells/ScannerAppShell";

// Warehouse system pages — lazy
const WarehouseDashboard = lazyWithRecovery(() => import("./pages/WarehouseDashboard"));
const WarehouseCalendarPage = lazyWithRecovery(() => import("./pages/WarehouseCalendarPage"));
const PackingManagement = lazyWithRecovery(() => import("./pages/PackingManagement"));
const PackingDetail = lazyWithRecovery(() => import("./pages/PackingDetail"));
const WarehouseProjectDetail = lazyWithRecovery(() => import("./pages/WarehouseProjectDetail"));
const PackingVerify = lazyWithRecovery(() => import("./pages/PackingVerify"));
const WarehouseEconomy = lazyWithRecovery(() => import("./pages/WarehouseEconomy"));
const WarehouseInventoryPlaceholder = lazyWithRecovery(() => import("./pages/WarehouseInventoryPlaceholder"));
const WarehouseServicePlaceholder = lazyWithRecovery(() => import("./pages/WarehouseServicePlaceholder"));

// Mobile staff app pages (web mode only — native uses shells)
import { MobileAuthProvider } from "@/contexts/MobileAuthContext";
import MobileProtectedRoute from "@/components/mobile-app/MobileProtectedRoute";
import MobileAppLayout from "@/components/mobile-app/MobileAppLayout";
import PlannerOnlyRoute from "@/components/mobile-app/PlannerOnlyRoute";
const MobileLogin = lazyWithRecovery(() => import("./pages/mobile/MobileLogin"));
const MobileJobs = lazyWithRecovery(() => import("./pages/mobile/MobileJobs"));
const MobileJobDetail = lazyWithRecovery(() => import("./pages/mobile/MobileJobDetail"));
const MobileProjectDetail = lazyWithRecovery(() => import("./pages/mobile/MobileProjectDetail"));
const MobileLocationDetail = lazyWithRecovery(() => import("./pages/mobile/MobileLocationDetail"));
const MobileTimeReport = lazyWithRecovery(() => import("./pages/mobile/MobileTimeReport"));
const MobileEditTimeReport = lazyWithRecovery(() => import("./pages/mobile/MobileEditTimeReport"));
const MobileExpenses = lazyWithRecovery(() => import("./pages/mobile/MobileExpenses"));
const MobileProfile = lazyWithRecovery(() => import("./pages/mobile/MobileProfile"));
const MobileTimeHistory = lazyWithRecovery(() => import("./pages/mobile/MobileTimeHistory"));
const MobileInbox = lazyWithRecovery(() => import("./pages/mobile/MobileInbox"));
const MobileMyFlags = lazyWithRecovery(() => import("./pages/mobile/MobileMyFlags"));
const MobileDayReview = lazyWithRecovery(() => import("./pages/mobile/MobileDayReview"));
const MobileCompleteJob = lazyWithRecovery(() => import("./pages/mobile/MobileCompleteJob"));
const MobileOverview = lazyWithRecovery(() => import("./pages/mobile/MobileOverview"));
const MobileScannerApp = lazyWithRecovery(() => import("./pages/MobileScannerApp"));
const ScannerLogin = lazyWithRecovery(() => import("./pages/scanner/ScannerLogin"));
const PersonalkalendernPage = lazyWithRecovery(() => import("./pages/PersonalkalendernPage"));
const PersonalkalendernLogin = lazyWithRecovery(() => import("./pages/PersonalkalendernLogin"));
import ScannerRouteGuard from "./components/scanner/ScannerProtectedRoute";

// EconomyTimeReports (used inside MainSystemLayout pages)
const EconomyTimeReports = lazyWithRecovery(() => import("./pages/EconomyTimeReports"));

// Global cache strategy: show cached data instantly, refresh quietly in background.
// - staleTime 60s: most navigations within a minute reuse cache without refetching.
// - gcTime 30min: keep data warm so back/forward navigation is instant.
// - refetchOnWindowFocus false: avoid storms when the user tab-switches.
// - refetchOnReconnect true: still recover after network drops.
// - retry 1: fail fast on bad endpoints instead of stalling the UI.
// Hooks that need fresher/staler data override these locally (staleTime/refetchInterval).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      // refetchOnMount default = true: stale data refreshes silently in background while cache shows instantly
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

// Pause all polling/refetching while the tab is hidden. Resume on visibility.
// This stops dashboards (planning/ops/warehouse) from hammering the network in the background
// and dramatically reduces idle CPU/memory across the app.
if (typeof document !== "undefined") {
  focusManager.setEventListener((handleFocus) => {
    const onVisibility = () => handleFocus(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  });
}

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

  // Soft fallback: a tiny top-of-screen indicator instead of blanking the entire app
  // while a lazy chunk loads. Keeps the previous view feeling persistent.
  const routeFallback = (
    <div className="fixed top-0 left-0 right-0 z-[60] h-0.5 bg-primary/30 overflow-hidden">
      <div className="h-full w-1/3 bg-primary animate-pulse" />
    </div>
  );

  // Persistent wrappers — kept as their own components so React Router
  // does NOT unmount AuthProvider / ProtectedRoute / Layout when navigating
  // between sibling child routes.
  const ProtectedMainLayout: React.FC = () => (
    <ProtectedRoute>
      <MainSystemLayout>
        <Outlet />
      </MainSystemLayout>
    </ProtectedRoute>
  );

  const ProtectedWarehouseLayout: React.FC = () => (
    <ProtectedRoute>
      <WarehouseSystemLayout>
        <Outlet />
      </WarehouseSystemLayout>
    </ProtectedRoute>
  );

  const ProtectedBare: React.FC = () => (
    <ProtectedRoute>
      <Outlet />
    </ProtectedRoute>
  );

  return (
    <Suspense fallback={routeFallback}>
    <Routes>
      <Route path="/auth" element={<AuthProvider><Auth /></AuthProvider>} />
      <Route path="/auth/reset" element={<AuthProvider><AuthResetPassword /></AuthProvider>} />

      {/* Public transport partner response page - no auth */}
      <Route path="/transport-svar" element={<TransportResponse />} />

      {/* Personalkalendern — publik, read-only spegling med dual auth */}
      <Route path="/personalkalendern" element={<PersonalkalendernPage />} />
      <Route path="/personalkalendern/login" element={<PersonalkalendernLogin />} />

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
            {/* Persistent main-system layout: AuthProvider + ProtectedRoute + Sidebar/FloatingInbox
                stay mounted across navigation between these children. */}
            <Route element={<ProtectedMainLayout />}>
              <Route path="/" element={<Navigate to={defaultRoute} replace />} />
              <Route path="/dashboard" element={<PlanningDashboard />} />
              <Route path="/my-projects" element={<MyProjects />} />
              <Route path="/calendar" element={<CustomCalendarPage />} />
              <Route path="/staff-management" element={<StaffManagement />} />
              <Route path="/staff-dashboard" element={<StaffDashboard />} />
              <Route path="/communication" element={<CommunicationPage />} />
              <Route path="/ops-control" element={<OpsControlCenter />} />
              <Route path="/staff-management/time-approvals" element={<TimeReportApprovals />} />
              <Route path="/staff-management/time-reports" element={<StaffTimeReports />} />
              <Route path="/admin/time-review" element={<AdminTimeReview />} />
              <Route path="/staff/:staffId" element={<StaffDetail />} />
              <Route path="/booking/:bookingId" element={<BookingDetail />} />
              <Route path="/booking-list" element={<BookingList />} />
              <Route path="/projects" element={<ProjectManagement />} />
              <Route path="/projects/archive" element={<ProjectArchive />} />
              <Route path="/projects/closing" element={<ProjectClosing />} />
              <Route path="/project/:projectId" element={<ProjectLayout />}>
                <Route index element={<ProjectViewPage />} />
                <Route path="execution" element={<EstablishmentPage />} />
                <Route path="establishment" element={<EstablishmentPage />} />
                <Route path="economy" element={<ProjectEconomyPage />} />
              </Route>
              <Route path="/economy" element={<EconomyOverview />} />
              <Route path="/economy/:id" element={<ProjectEconomyDetail />} />
              <Route path="/analytics" element={<AnalyticsDashboard />} />
              <Route path="/large-project/:id" element={<LargeProjectLayout />}>
                <Route index element={<LargeProjectViewPage />} />
                <Route path="establishment" element={<LargeEstablishmentPage />} />
                <Route path="collaboration" element={<LargeCollaborationPage />} />
                <Route path="economy" element={<LargeProjectEconomyPage />} />
              </Route>
              <Route path="/invoicing" element={<InvoicingPage />} />
              <Route path="/suppliers" element={<SuppliersPage />} />
              <Route path="/api-docs" element={<APIDocumentation />} />

              {/* Logistics Routes */}
              <Route path="/logistics" element={<LogisticsHub />} />
              <Route path="/logistics/planning" element={<LogisticsHub />} />
              <Route path="/logistics/routes" element={<LogisticsHub />} />
              <Route path="/logistics/vehicles" element={<LogisticsHub />} />

              {/* Hidden admin sync tools */}
              <Route path="/admin/sync" element={<SyncReconciliation />} />
              <Route path="/admin/staff-live" element={<StaffLiveDebug />} />
              <Route path="/admin/presence" element={<PresenceHub />} />
              <Route path="/admin/presence/day-overview" element={<PresenceHub initialTab="day" />} />
              <Route path="/admin/staff-presence" element={<Navigate to="/admin/presence" replace />} />
              <Route path="/admin/presence/:targetType/:targetId" element={<TargetPresence />} />
              <Route path="/admin/presence/staff/:staffId" element={<StaffPresenceDay />} />
              <Route path="/admin/time-intelligence-debug" element={<TimeIntelligenceDebug />} />
              <Route path="/admin/time-debug" element={<TimeIntelligenceDebug />} />
              <Route path="/admin/legacy-incoming-packing" element={<LegacyIncomingPackingDebug />} />
              <Route path="/admin/warehouse-assignments-debug" element={<WarehouseAssignmentsDebug />} />
            </Route>

            {/* Bare protected routes (no sidebar layout) */}
            <Route element={<ProtectedBare />}>
              <Route path="/jobs/:id" element={<JobDetail />} />
              <Route path="/warehouse/packing/:packingId/verify" element={<PackingVerify />} />
            </Route>

            {/* Persistent warehouse layout */}
            <Route element={<ProtectedWarehouseLayout />}>
              <Route path="/warehouse" element={<WarehouseDashboard />} />
              <Route path="/warehouse/calendar" element={<WarehouseCalendarPage />} />
              <Route path="/warehouse/packing" element={<PackingManagement />} />
              <Route path="/warehouse/packing/:packingId" element={<PackingDetail />} />
              <Route path="/warehouse/projects/:warehouseProjectId" element={<WarehouseProjectDetail />} />
              <Route path="/warehouse/economy" element={<WarehouseEconomy />} />
              <Route path="/warehouse/inventory" element={<WarehouseInventoryPlaceholder />} />
              <Route path="/warehouse/service" element={<WarehouseServicePlaceholder />} />
            </Route>

            {/* Scanner App (accessible via web) */}
            <Route path="/scanner" element={<MobileAuthProvider><ScannerRouteGuard><MobileScannerApp /></ScannerRouteGuard></MobileAuthProvider>} />
            <Route path="/scanner/login" element={<MobileAuthProvider><ScannerLogin /></MobileAuthProvider>} />

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
