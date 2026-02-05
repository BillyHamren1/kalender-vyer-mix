import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRoles, AppRole } from '@/hooks/useUserRoles';
import { Loader2, ShieldX, UserX, Copy, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: AppRole[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRoles }) => {
  const { user, isLoading: authLoading, signOut } = useAuth();
  const { roles, hasPlanningAccess, hasAnyRole, isLoading: rolesLoading } = useUserRoles();
  const location = useLocation();
  const [copied, setCopied] = useState(false);
  
  // Check if user came from /auth login (skip role check in that case)
  const skipRoleCheck = (location.state as { skipRoleCheck?: boolean })?.skipRoleCheck === true;

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
  
  // If user logged in via /auth, skip role check and let them in
  if (skipRoleCheck) {
    return <>{children}</>;
  }

  const copyUserId = () => {
    if (user?.id) {
      navigator.clipboard.writeText(user.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!hasAccess) {
    const noRolesAtAll = roles.length === 0;
    const requiredRolesList = requiredRoles || ['admin', 'projekt', 'lager'];

    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6 max-w-md text-center px-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            {noRolesAtAll ? (
              <UserX className="h-8 w-8 text-destructive" />
            ) : (
              <ShieldX className="h-8 w-8 text-destructive" />
            )}
          </div>
          
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              {noRolesAtAll ? 'Inga roller tilldelade' : 'Åtkomst nekad'}
            </h1>
            
            {noRolesAtAll ? (
              <div className="space-y-3 text-muted-foreground">
                <p>
                  Ditt konto saknar roller och kan därför inte komma åt systemet.
                </p>
                <p className="text-sm">
                  Be din administratör att tilldela dig en eller flera av följande roller:
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {requiredRolesList.map((role) => (
                    <span 
                      key={role}
                      className="px-2 py-1 bg-muted rounded text-xs font-medium"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-muted-foreground">
                <p>
                  Du har inte behörighet att se denna sida.
                </p>
                <p className="text-sm">
                  Dina roller: {roles.length > 0 ? roles.join(', ') : 'inga'}
                </p>
                <p className="text-sm">
                  Kräver en av: {requiredRolesList.join(', ')}
                </p>
              </div>
            )}
          </div>

          {/* Debug info box */}
          <div className="w-full p-4 bg-muted/50 rounded-lg text-left space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Felsökningsinformation</p>
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">E-post:</span>
                <span className="font-mono">{user.email}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Användar-ID:</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[10px] truncate max-w-[180px]">{user.id}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={copyUserId}
                  >
                    {copied ? (
                      <CheckCircle className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Roller i systemet:</span>
                <span className="font-mono">{roles.length > 0 ? roles.join(', ') : 'inga'}</span>
              </div>
            </div>
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
