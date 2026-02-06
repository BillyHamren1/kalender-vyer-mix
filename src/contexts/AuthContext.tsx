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
        console.log('[Auth] State change:', event);
        
        // Handle token refresh errors - clear invalid session
        if (event === 'TOKEN_REFRESHED' && !session) {
          console.warn('[Auth] Token refresh failed, clearing session');
          setSession(null);
          setUser(null);
          setIsLoading(false);
          return;
        }
        
        // Handle sign out or session expiry
        if (event === 'SIGNED_OUT') {
          console.log('[Auth] User signed out');
          setSession(null);
          setUser(null);
          setIsSsoUser(false);
          sessionStorage.removeItem('isSsoUser');
          sessionStorage.removeItem('skipRoleCheck');
          setIsLoading(false);
          return;
        }
        
        // Handle successful sign in
        if (event === 'SIGNED_IN' && session) {
          console.log('[Auth] User signed in');
          checkSsoUser(); // Re-check SSO status
        }
        
        setSession(session);
        setUser(session?.user ?? null);
        
        // Check user metadata for SSO flag
        if (session?.user?.user_metadata?.sso_user) {
          setIsSsoUser(true);
          sessionStorage.setItem('isSsoUser', 'true');
        }
        
        setIsLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('[Auth] Failed to get session:', error.message);
        // Clear any stale session data on error
        setSession(null);
        setUser(null);
        setIsLoading(false);
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
