import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface SsoPayload {
  user_id: string;
  email: string;
  organization_id: string | null;
  full_name: string | null;
  timestamp: number;
  expires_at: number;
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

export function useSsoListener() {
  const isProcessingRef = useRef(false);

  const verifySsoToken = useCallback(async (ssoToken: SsoToken) => {
    // Förhindra dubbel-verifiering
    if (isProcessingRef.current) {
      console.log('[SSO] Already processing a token, skipping');
      return;
    }
    
    isProcessingRef.current = true;
    console.log('[SSO] Starting verification for:', ssoToken.payload.email);

    try {
      const response = await fetch(`https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/verify-sso-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ssoToken),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error('[SSO] Verification failed:', data);
        sendSsoResponse(false, { status: response.status, code: data.error_code, message: data.message });
        isProcessingRef.current = false;
        return;
      }

      console.log('[SSO] Verification successful, verifying OTP');

      // Använd verifyOtp för att etablera sessionen
      const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
        token_hash: data.hashed_token,
        type: 'magiclink',
      });

      if (sessionError) {
        console.error('[SSO] Session verification failed:', sessionError);
        sendSsoResponse(false, { status: 500, code: 'SESSION_VERIFY_FAILED', message: sessionError.message });
        isProcessingRef.current = false;
        return;
      }

      console.log('[SSO] Session established successfully for:', data.user.email);
      sendSsoResponse(true);
      
      // Sessionen är nu aktiv - ingen reload behövs om komponenter lyssnar på auth state changes

    } catch (err) {
      console.error('[SSO] Exception during verification:', err);
      sendSsoResponse(false, { status: 500, code: 'NETWORK_ERROR', message: String(err) });
    } finally {
      isProcessingRef.current = false;
    }
  }, []);

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

    // 2. Lyssna på postMessage som fallback
    function handleMessage(event: MessageEvent) {
      const data = event.data;
      if (data?.type === 'SSO_TOKEN') {
        console.log('[SSO] Received SSO_TOKEN via postMessage');
        
        // Försök med base64-variant först, sedan det parsade objektet
        let ssoToken: SsoToken | null = null;
        
        if (data.sso_token_b64) {
          try {
            ssoToken = JSON.parse(atob(data.sso_token_b64));
          } catch (e) {
            console.error('[SSO] Failed to parse base64 token:', e);
          }
        }
        
        if (!ssoToken && data.sso_token) {
          ssoToken = data.sso_token;
        }
        
        if (ssoToken) {
          verifySsoToken(ssoToken);
        } else {
          console.error('[SSO] No valid token found in postMessage');
          sendSsoResponse(false, { status: 400, code: 'INVALID_TOKEN', message: 'No valid SSO token in message' });
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
