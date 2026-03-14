import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { MobileAuthProvider } from '@/contexts/MobileAuthContext';
import MobileProtectedRoute from '@/components/mobile-app/MobileProtectedRoute';
import { ShellProvider } from './ShellContext';
import TimeAppLayout from './time/TimeAppLayout';

// Time app pages
import MobileLogin from '@/pages/mobile/MobileLogin';
import MobileJobs from '@/pages/mobile/MobileJobs';
import MobileJobDetail from '@/pages/mobile/MobileJobDetail';
import MobileTimeReport from '@/pages/mobile/MobileTimeReport';
import MobileExpenses from '@/pages/mobile/MobileExpenses';
import MobileProfile from '@/pages/mobile/MobileProfile';
import MobileTimeHistory from '@/pages/mobile/MobileTimeHistory';
import MobileInbox from '@/pages/mobile/MobileInbox';

const TimeAppShell: React.FC = () => {
  return (
    <ShellProvider mode="time" appName="EventFlow Time" appTagline="Tidrapportering för fältpersonal">
      <MobileAuthProvider>
        <Routes>
          <Route path="/m/login" element={<MobileLogin />} />
          <Route path="/m" element={<MobileProtectedRoute><TimeAppLayout><MobileJobs /></TimeAppLayout></MobileProtectedRoute>} />
          <Route path="/m/job/:id" element={<MobileProtectedRoute><TimeAppLayout><MobileJobDetail /></TimeAppLayout></MobileProtectedRoute>} />
          <Route path="/m/report" element={<MobileProtectedRoute><TimeAppLayout><MobileTimeReport /></TimeAppLayout></MobileProtectedRoute>} />
          <Route path="/m/expenses" element={<MobileProtectedRoute><TimeAppLayout><MobileExpenses /></TimeAppLayout></MobileProtectedRoute>} />
          <Route path="/m/profile" element={<MobileProtectedRoute><TimeAppLayout><MobileProfile /></TimeAppLayout></MobileProtectedRoute>} />
          <Route path="/m/time-history" element={<MobileProtectedRoute><TimeAppLayout><MobileTimeHistory /></TimeAppLayout></MobileProtectedRoute>} />
          <Route path="/m/inbox" element={<MobileProtectedRoute><TimeAppLayout><MobileInbox /></TimeAppLayout></MobileProtectedRoute>} />
          
          {/* Redirect scanner routes to time app */}
          <Route path="/scanner" element={<Navigate to="/m" replace />} />
          <Route path="/scanner/login" element={<Navigate to="/m/login" replace />} />
          
          {/* Default route */}
          <Route path="/" element={<Navigate to="/m" replace />} />
          <Route path="*" element={<Navigate to="/m" replace />} />
        </Routes>
      </MobileAuthProvider>
    </ShellProvider>
  );
};

export default TimeAppShell;
