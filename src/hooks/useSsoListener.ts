import { useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface SsoPreferences {
  language?: string;
  timezone?: string;
  dateFormat?: string;
}

interface SsoPayload {
  user_id: string;
  email: string;
  organization_id: string | null;
  full_name: string | null;
  timestamp: number;
  expires_at: number;
  preferences?: SsoPreferences;
}

interface SsoToken {
  payload: SsoPayload;
  signature: string;
}

interface SsoError {
  status?: number;
  code?: string;
  message?: string;
}

interface SsoResult {
  success: boolean;
  access_token?: string;
  refresh_token?: string;
  user?: {
    id: string;
    email: string;
    organization_id: string | null;
    full_name: string | null;
    sso_user: boolean;
  };
  preferences?: SsoPreferences | null;
  roles?: string[];
  error_code?: string;
  message?: string;
}

// Generate a fingerprint from the token signature for deduplication
function getTokenFingerprint(signature: string): string {
  return signature.slice(0, 32); // First 32 chars of signature is unique enough
}

function sendSsoResponse(success: boolean, error?: SsoError) {
  // Endast skicka om vi är i en iframe
  if (window.parent === window) return;
  
  const message = success 
    ? { type: 'SSO_ACK', success: true }
    : { type: 'SSO_ERROR', success: false, status: error?.status, error_code: error?.code, message: error?.message };
  
  try {
    window.parent.postMessage(message, '*');
    console.log('[SSO] Sent response to parent:', message);
  } catch (e) {
    console.error('[SSO] Failed to send postMessage:', e);
  }
}

// Apply preferences to the application
function applyPreferences(preferences: SsoPreferences) {
  if (!preferences) return;
  
  console.log('[SSO] Applying preferences:', preferences);
  
  // Store preferences in localStorage for persistence
  if (preferences.language) {
    localStorage.setItem('app_language', preferences.language);
    document.documentElement.lang = preferences.language;
  }
  
  if (preferences.timezone) {
    localStorage.setItem('app_timezone', preferences.timezone);
  }
  
  if (preferences.dateFormat) {
    localStorage.setItem('app_date_format', preferences.dateFormat);
  }
  
  // Dispatch custom event for components that need to react
  window.dispatchEvent(new CustomEvent('preferences-updated', { detail: preferences }));
}

// Use sessionStorage key for cross-render deduplication
const SSO_PROCESSED_KEY = 'sso_last_processed_fingerprint';
const SSO_PROCESSING_KEY = 'sso_currently_processing';

export function useSsoListener() {
  const isProcessingRef = useRef(false);
  const lastProcessedRef = useRef<string | null>(null);
  const location = useLocation();

  // Determine target view based on current route
  const getTargetView = useCallback((): 'planning' | 'warehouse' => {
    if (location.pathname.startsWith('/warehouse')) {
      return 'warehouse';
    }
    return 'planning';
  }, [location.pathname]);

  const verifySsoToken = useCallback(async (ssoToken: SsoToken) => {
    const fingerprint = getTokenFingerprint(ssoToken.signature);
    
    // Check 1: Already processed this exact token (in-memory)
    if (lastProcessedRef.current === fingerprint) {
      console.log('[SSO] Token already processed (memory), skipping:', fingerprint);
      return;
    }
    
    // Check 2: Already processed this token (sessionStorage - survives React Strict Mode double-mount)
    const storedFingerprint = sessionStorage.getItem(SSO_PROCESSED_KEY);
    if (storedFingerprint === fingerprint) {
      console.log('[SSO] Token already processed (storage), skipping:', fingerprint);
      return;
    }
    
    // Check 3: Another tab/instance is currently processing
    const currentlyProcessing = sessionStorage.getItem(SSO_PROCESSING_KEY);
    if (currentlyProcessing === fingerprint) {
      console.log('[SSO] Token currently being processed elsewhere, skipping:', fingerprint);
      return;
    }
    
    // Check 4: In-memory processing flag
    if (isProcessingRef.current) {
      console.log('[SSO] Already processing a token, skipping');
      return;
    }
    
    // Lock immediately - both in-memory and sessionStorage
    isProcessingRef.current = true;
    sessionStorage.setItem(SSO_PROCESSING_KEY, fingerprint);
    
    const targetView = getTargetView();
    console.log('[SSO] Starting verification for:', ssoToken.payload.email, 'fingerprint:', fingerprint, 'target_view:', targetView);

    try {
      const response = await fetch(`https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/verify-sso-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...ssoToken,
          target_view: targetView,
        }),
      });

      const data: SsoResult = await response.json();

      if (!response.ok || !data.success) {
        console.error('[SSO] Verification failed:', data);
        sendSsoResponse(false, { status: response.status, code: data.error_code, message: data.message });
        return;
      }

      console.log('[SSO] Verification successful, setting session directly');

      // Använd setSession med tokens från edge function
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token!,
        refresh_token: data.refresh_token!,
      });

      if (sessionError) {
        console.error('[SSO] Session set failed:', sessionError);
        sendSsoResponse(false, { status: 500, code: 'SESSION_SET_FAILED', message: sessionError.message });
        return;
      }

      // Mark user as SSO user in sessionStorage (for ProtectedRoute to skip role check)
      sessionStorage.setItem('isSsoUser', 'true');
      sessionStorage.setItem('skipRoleCheck', 'true');
      
      // Apply preferences from SSO token
      if (data.preferences) {
        applyPreferences(data.preferences);
      }

      // Mark as successfully processed AFTER session is established
      lastProcessedRef.current = fingerprint;
      sessionStorage.setItem(SSO_PROCESSED_KEY, fingerprint);
      
      console.log('[SSO] Session established successfully for:', data.user?.email, 'roles:', data.roles);
      sendSsoResponse(true);

    } catch (err) {
      console.error('[SSO] Exception during verification:', err);
      sendSsoResponse(false, { status: 500, code: 'NETWORK_ERROR', message: String(err) });
    } finally {
      isProcessingRef.current = false;
      sessionStorage.removeItem(SSO_PROCESSING_KEY);
    }
  }, [getTargetView]);

  useEffect(() => {
    // 1. Kolla URL-hash först
    const hash = window.location.hash;
    if (hash.includes('sso_token=')) {
      console.log('[SSO] Found sso_token in URL hash');
      const tokenB64 = hash.split('sso_token=')[1]?.split('&')[0];
      if (tokenB64) {
        try {
          const tokenJson = atob(tokenB64);
          const ssoToken = JSON.parse(tokenJson) as SsoToken;
          // Rensa hashen från URL
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          verifySsoToken(ssoToken);
        } catch (e) {
          console.error('[SSO] Failed to parse hash token:', e);
          sendSsoResponse(false, { status: 400, code: 'INVALID_TOKEN', message: 'Failed to parse SSO token' });
        }
      }
    }

    // 2. Lyssna på postMessage
    function handleMessage(event: MessageEvent) {
      const data = event.data;
      
      // Handle SSO_TOKEN message
      if (data?.type === 'SSO_TOKEN') {
        console.log('[SSO] Received SSO_TOKEN via postMessage');
        
        // Försök med olika format som Hubben kan skicka
        let ssoToken: SsoToken | null = null;
        
        // Format 1: event.data.sso_token_b64 (base64-kodat)
        if (data.sso_token_b64) {
          try {
            ssoToken = JSON.parse(atob(data.sso_token_b64));
          } catch (e) {
            console.error('[SSO] Failed to parse base64 token:', e);
          }
        }
        
        // Format 2: event.data.sso_token (direkt objekt)
        if (!ssoToken && data.sso_token) {
          ssoToken = data.sso_token;
        }
        
        // Format 3: event.data.token (enligt dokumentationen)
        if (!ssoToken && data.token) {
          ssoToken = data.token;
        }
        
        if (ssoToken) {
          verifySsoToken(ssoToken);
        } else {
          console.error('[SSO] No valid token found in postMessage');
          sendSsoResponse(false, { status: 400, code: 'INVALID_TOKEN', message: 'No valid SSO token in message' });
        }
      }
      
      // Handle PREFERENCES_UPDATE message from Hub
      if (data?.type === 'PREFERENCES_UPDATE') {
        console.log('[SSO] Received PREFERENCES_UPDATE via postMessage');
        const preferences = data.preferences as SsoPreferences;
        if (preferences) {
          applyPreferences(preferences);
        }
      }
    }

    window.addEventListener('message', handleMessage);
    console.log('[SSO] Listener initialized');
    
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [verifySsoToken]);
}

// Hook to get current preferences
export function useAppPreferences() {
  const getPreferences = useCallback((): SsoPreferences => {
    return {
      language: localStorage.getItem('app_language') || 'sv',
      timezone: localStorage.getItem('app_timezone') || 'Europe/Stockholm',
      dateFormat: localStorage.getItem('app_date_format') || 'DD/MM/YYYY',
    };
  }, []);

  return { getPreferences };
}

// Check if current user is an SSO user
export function isSsoUser(): boolean {
  return sessionStorage.getItem('isSsoUser') === 'true';
}
