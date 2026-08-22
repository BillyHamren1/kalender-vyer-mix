import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ScannerAuthProvider } from '@/contexts/ScannerAuthContext';
import ScannerRouteGuard from '@/components/scanner/ScannerProtectedRoute';
import { ShellProvider } from './ShellContext';
import ScannerAppLayout from './scanner/ScannerAppLayout';
import { LanguageProvider } from '@/i18n/LanguageContext';

// Scanner app pages
import ScannerLogin from '@/pages/scanner/ScannerLogin';
import MobileScannerApp from '@/pages/MobileScannerApp';

const ScannerAppShell: React.FC = () => {
  React.useEffect(() => {
    console.log('[ScannerStartup] Shell mounted');
  }, []);
  return (
    <ShellProvider mode="scanner" appName="EventFlow Scanner" appTagline="Scanning & packing">
      <LanguageProvider>
        <ScannerAuthProvider>
          <Routes>
          <Route path="/scanner/login" element={<ScannerLogin />} />
          <Route path="/scanner" element={
            <ScannerRouteGuard>
              <ScannerAppLayout>
                <MobileScannerApp />
              </ScannerAppLayout>
            </ScannerRouteGuard>
          } />
          
          {/* Redirect time routes to scanner */}
          <Route path="/m" element={<Navigate to="/scanner" replace />} />
          <Route path="/m/login" element={<Navigate to="/scanner/login" replace />} />
          <Route path="/m/*" element={<Navigate to="/scanner" replace />} />
          
          {/* Default route */}
          <Route path="/" element={<Navigate to="/scanner" replace />} />
          <Route path="*" element={<Navigate to="/scanner" replace />} />
          </Routes>
        </ScannerAuthProvider>
      </LanguageProvider>
    </ShellProvider>
  );
};

export default ScannerAppShell;
