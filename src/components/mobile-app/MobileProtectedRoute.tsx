import React from 'react';
import { Navigate } from 'react-router-dom';
import { useMobileAuth } from '@/contexts/MobileAuthContext';
import { Loader2 } from 'lucide-react';

const MobileProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useMobileAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/m/login" replace />;
  }

  return <>{children}</>;
};

export default MobileProtectedRoute;
