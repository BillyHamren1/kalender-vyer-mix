import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { MobileAuthProvider } from '@/contexts/MobileAuthContext';
import MobileProtectedRoute from '@/components/mobile-app/MobileProtectedRoute';
import { ShellProvider } from './ShellContext';
import { LanguageProvider } from '@/i18n/LanguageContext';
import TimeAppLayout from './time/TimeAppLayout';

// Time app pages
import MobileLogin from '@/pages/mobile/MobileLogin';
import MobileJobs from '@/pages/mobile/MobileJobs';
import MobileJobDetail from '@/pages/mobile/MobileJobDetail';
import MobileProjectDetail from '@/pages/mobile/MobileProjectDetail';
import MobileLocationDetail from '@/pages/mobile/MobileLocationDetail';
import MobileLagerPage from '@/pages/mobile/MobileLagerPage';
import MobileTimeReport from '@/pages/mobile/MobileTimeReport';
import MobileEditTimeReport from '@/pages/mobile/MobileEditTimeReport';
import MobileExpenses from '@/pages/mobile/MobileExpenses';
import MobileProfile from '@/pages/mobile/MobileProfile';
import MobileTimeHistory from '@/pages/mobile/MobileTimeHistory';
import MobileInbox from '@/pages/mobile/MobileInbox';
import MobileCompleteJob from '@/pages/mobile/MobileCompleteJob';
import MobileScannerApp from '@/pages/MobileScannerApp';
import MobileToolsHub from '@/pages/mobile/MobileToolsHub';
import MobileOverview from '@/pages/mobile/MobileOverview';
import PlannerOnlyRoute from '@/components/mobile-app/PlannerOnlyRoute';
import MobileMeasure from '@/pages/mobile/MobileMeasure';
import MobileCameraCapture from '@/pages/mobile/MobileCameraCapture';
import NativeMeasureLauncher from '@/features/site-scans/pages/NativeMeasureLauncher';
import SiteScanDetailPage from '@/features/site-scans/pages/ScanDetail';

const LegacyScanRedirect: React.FC = () => {
  const params = (window.location.pathname.match(/\/scans\/([^/]+)/) || [])[1];
  return <Navigate to={params ? `/m/tools/measure/${params}` : '/m/tools/measure'} replace />;
};

const TimeAppShell: React.FC = () => {
  return (
    <ShellProvider mode="time" appName="EventFlow Time" appTagline="Tidrapportering för fältpersonal">
      <LanguageProvider>
      <MobileAuthProvider>
        <Routes>
          <Route path="/m/login" element={<MobileLogin />} />
          <Route path="/m" element={<MobileProtectedRoute><TimeAppLayout><MobileJobs /></TimeAppLayout></MobileProtectedRoute>} />
          <Route path="/m/job/:id" element={<MobileProtectedRoute><TimeAppLayout><MobileJobDetail /></TimeAppLayout></MobileProtectedRoute>} />
          <Route path="/m/job/:id/complete" element={<MobileProtectedRoute><TimeAppLayout><MobileCompleteJob /></TimeAppLayout></MobileProtectedRoute>} />
          <Route path="/m/project/:projectId" element={<MobileProtectedRoute><TimeAppLayout><MobileProjectDetail /></TimeAppLayout></MobileProtectedRoute>} />
          <Route path="/m/location/:id" element={<MobileProtectedRoute><TimeAppLayout><MobileLocationDetail /></TimeAppLayout></MobileProtectedRoute>} />
          <Route path="/m/lager" element={<MobileProtectedRoute><TimeAppLayout><MobileLagerPage /></TimeAppLayout></MobileProtectedRoute>} />
          <Route path="/m/report" element={<MobileProtectedRoute><TimeAppLayout><MobileTimeReport /></TimeAppLayout></MobileProtectedRoute>} />
          <Route path="/m/report/:id/edit" element={<Navigate to="/m/report" replace />} />
          <Route path="/m/expenses" element={<MobileProtectedRoute><TimeAppLayout><MobileExpenses /></TimeAppLayout></MobileProtectedRoute>} />
          <Route path="/m/profile" element={<MobileProtectedRoute><TimeAppLayout><MobileProfile /></TimeAppLayout></MobileProtectedRoute>} />
          <Route path="/m/time-history" element={<Navigate to="/m/report" replace />} />
          <Route path="/m/day-review" element={<Navigate to="/m/report" replace />} />
          <Route path="/m/inbox" element={<MobileProtectedRoute><TimeAppLayout><MobileInbox /></TimeAppLayout></MobileProtectedRoute>} />
          <Route path="/m/overview" element={<MobileProtectedRoute><PlannerOnlyRoute><TimeAppLayout><MobileOverview /></TimeAppLayout></PlannerOnlyRoute></MobileProtectedRoute>} />
          {/* Tools hub: Camera, Scanner, Measure */}
          <Route path="/m/tools" element={<MobileProtectedRoute><TimeAppLayout><MobileToolsHub /></TimeAppLayout></MobileProtectedRoute>} />
          <Route path="/m/tools/camera" element={<MobileProtectedRoute><TimeAppLayout><MobileCameraCapture /></TimeAppLayout></MobileProtectedRoute>} />
          <Route path="/m/tools/scanner" element={<MobileProtectedRoute><TimeAppLayout><MobileScannerApp /></TimeAppLayout></MobileProtectedRoute>} />
          <Route path="/m/tools/measure" element={<MobileProtectedRoute><TimeAppLayout><MobileMeasure /></TimeAppLayout></MobileProtectedRoute>} />
          <Route path="/m/tools/measure/new" element={<MobileProtectedRoute><NativeMeasureLauncher /></MobileProtectedRoute>} />
          <Route path="/m/tools/measure/:id" element={<MobileProtectedRoute><TimeAppLayout><SiteScanDetailPage /></TimeAppLayout></MobileProtectedRoute>} />
          {/* Legacy SiteScan paths */}
          <Route path="/scans" element={<Navigate to="/m/tools/measure" replace />} />
          <Route path="/scans/:id" element={<LegacyScanRedirect />} />
          {/* Legacy redirect */}
          <Route path="/m/scan" element={<Navigate to="/m/tools" replace />} />
          
          {/* Redirect scanner routes to time app */}
          <Route path="/scanner" element={<Navigate to="/m" replace />} />
          <Route path="/scanner/login" element={<Navigate to="/m/login" replace />} />
          
          {/* Default route */}
          <Route path="/" element={<Navigate to="/m" replace />} />
          <Route path="*" element={<Navigate to="/m" replace />} />
        </Routes>
      </MobileAuthProvider>
      </LanguageProvider>
    </ShellProvider>
  );
};

export default TimeAppShell;
