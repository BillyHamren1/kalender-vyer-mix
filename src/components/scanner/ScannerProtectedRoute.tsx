import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { Loader2 } from 'lucide-react';

const SAFETY_TIMEOUT_MS = 5000;

const ScannerProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useMobileAuth();
  const [safetyElapsed, setSafetyElapsed] = useState(false);

  useEffect(() => {
    console.log('[ScannerStartup] RouteGuard state', { isAuthenticated, isLoading });
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    if (!isLoading) return;
    const t = window.setTimeout(() => {
      console.warn('[ScannerStartup] RouteGuard safety timeout — forcing redirect to login');
      setSafetyElapsed(true);
    }, SAFETY_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [isLoading]);

  if (isLoading && !safetyElapsed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/scanner/login" replace />;
  }

  return <>{children}</>;
};

export default ScannerProtectedRoute;
