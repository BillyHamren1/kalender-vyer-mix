import React from 'react';
import { Navigate } from 'react-router-dom';
import { useMobileRoles } from '@/hooks/mobile/useMobileRoles';

/**
 * PlannerOnlyRoute
 * Wrap any /m/overview/* route with this guard. Non-planner users are
 * redirected to /m. Backend already enforces 403 — this is a UX guard.
 */
const PlannerOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isPlanner, isLoading } = useMobileRoles();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Laddar…</div>
      </div>
    );
  }

  if (!isPlanner) {
    return <Navigate to="/m" replace />;
  }

  return <>{children}</>;
};

export default PlannerOnlyRoute;
