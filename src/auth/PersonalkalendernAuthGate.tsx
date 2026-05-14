import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth, AuthProvider } from '@/contexts/AuthContext';
import { useMobileAuth, MobileAuthProvider } from '@/contexts/MobileAuthContext';

/**
 * Dual-auth gate för publika /personalkalendern.
 * Släpper in om antingen Supabase-session (admin) ELLER mobile-token (personal) finns.
 *
 * Måste renderas under BÅDE AuthProvider och MobileAuthProvider — se App.tsx.
 */
const InnerGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading: supaLoading } = useAuth();
  const { isAuthenticated: mobileAuthed, isLoading: mobileLoading } = useMobileAuth();
  const location = useLocation();

  if (supaLoading || mobileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  const ok = !!user || mobileAuthed;
  if (!ok) {
    return (
      <Navigate
        to="/personalkalendern/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return <>{children}</>;
};

const PersonalkalendernAuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AuthProvider>
    <MobileAuthProvider>
      <InnerGate>{children}</InnerGate>
    </MobileAuthProvider>
  </AuthProvider>
);

export default PersonalkalendernAuthGate;
