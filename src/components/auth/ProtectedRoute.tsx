import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRoles, AppRole } from '@/hooks/useUserRoles';
import { Loader2, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: AppRole[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRoles }) => {
  const { user, isLoading: authLoading, signOut } = useAuth();
  const { hasPlanningAccess, hasAnyRole, isLoading: rolesLoading } = useUserRoles();
  const location = useLocation();

  // Show loading while auth or roles are loading
  if (authLoading || (user && rolesLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Laddar...</p>
        </div>
      </div>
    );
  }

  // Redirect to auth if not logged in
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Check role requirements
  const hasAccess = requiredRoles 
    ? hasAnyRole(requiredRoles) 
    : hasPlanningAccess; // Default: require planning access

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6 max-w-md text-center px-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldX className="h-8 w-8 text-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Åtkomst nekad
            </h1>
            <p className="text-muted-foreground">
              Du har inte behörighet att se denna sida. Kontakta din administratör om du anser att detta är ett fel.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => window.history.back()}>
              Gå tillbaka
            </Button>
            <Button variant="destructive" onClick={signOut}>
              Logga ut
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
