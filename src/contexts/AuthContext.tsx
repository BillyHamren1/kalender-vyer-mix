import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isSsoUser: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  isSsoUser: false,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSsoUser, setIsSsoUser] = useState(false);

  useEffect(() => {
    // Check if this is an SSO user from sessionStorage
    const checkSsoUser = () => {
      const ssoFlag = sessionStorage.getItem('isSsoUser') === 'true';
      setIsSsoUser(ssoFlag);
    };
    
    checkSsoUser();

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[Auth] State change:', event, 'hasSession:', !!session);

        // Only an EXPLICIT sign-out clears the session. Empty-session
        // TOKEN_REFRESHED events (which can happen during transient network
        // hiccups, OS sleep/resume, or when Supabase momentarily fails to
        // refresh) must NOT log the user out — Supabase will retry the
        // refresh automatically on the next request.
        if (event === 'SIGNED_OUT') {
          console.log('[Auth] User signed out (explicit)');
          setSession(null);
          setUser(null);
          setIsSsoUser(false);
          sessionStorage.removeItem('isSsoUser');
          sessionStorage.removeItem('skipRoleCheck');
          setIsLoading(false);
          return;
        }

        if (event === 'TOKEN_REFRESHED') {
          if (!session) {
            // Transient: keep current state, wait for next refresh attempt.
            console.warn('[Auth] TOKEN_REFRESHED with no session — keeping existing state, will retry');
            setIsLoading(false);
            return;
          }
          console.log('[Auth] Token refreshed successfully');
        }

        // Handle successful sign in
        if (event === 'SIGNED_IN' && session) {
          console.log('[Auth] User signed in');
          checkSsoUser(); // Re-check SSO status
        }

        // Only update state when we actually received a session, or on
        // initial INITIAL_SESSION event (which legitimately may carry null).
        if (session || event === 'INITIAL_SESSION') {
          setSession(session);
          setUser(session?.user ?? null);
        }

        // Check user metadata for SSO flag
        if (session?.user?.user_metadata?.sso_user) {
          setIsSsoUser(true);
          sessionStorage.setItem('isSsoUser', 'true');
        }

        setIsLoading(false);
      }
    );

    // THEN check for existing session
    const loadSession = (isRetry = false) => {
      supabase.auth.getSession().then(({ data: { session }, error }) => {
        if (error) {
          // Network / transient error: keep any existing state and retry
          // silently after 30s instead of nuking the user back to login.
          console.error('[Auth] Failed to get session:', error.message, isRetry ? '(retry)' : '(initial)');
          setIsLoading(false);
          if (!isRetry) {
            setTimeout(() => loadSession(true), 30_000);
          }
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);

        // Check user metadata for SSO flag
        if (session?.user?.user_metadata?.sso_user) {
          setIsSsoUser(true);
          sessionStorage.setItem('isSsoUser', 'true');
        }

        setIsLoading(false);
      });
    };
    loadSession();

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    // Clear SSO flags on sign out
    sessionStorage.removeItem('isSsoUser');
    sessionStorage.removeItem('skipRoleCheck');
    sessionStorage.removeItem('sso_last_processed_fingerprint');
    setIsSsoUser(false);
    // Clear shared org-id cache so the next user doesn't inherit it
    const { clearOrganizationIdCache } = await import('@/hooks/useOrganizationId');
    clearOrganizationIdCache();
    await supabase.auth.signOut();
  };

  const value = {
    user,
    session,
    isLoading,
    isSsoUser,
    signIn,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
