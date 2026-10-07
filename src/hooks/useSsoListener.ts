import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  clearPersistedTenantState,
  getLastKnownOrganizationId,
  setLastKnownOrganizationId,
} from '@/lib/tenant/tenantCacheGuard';
import { isAllowedHubOrigin } from '@/lib/sso/hubOrigins';
import {
  activateOperationsSupportSsoSession,
  beginOperationsSupportSsoAttempt,
  clearOperationsSupportContextSession,
  isOperationsSupportSsoAttemptCurrent,
  type OperationsSupportSsoAttempt,
} from '@/lib/sso/supportContextProducer';

// Origin som HUB faktiskt skickade senaste SSO/preferences-meddelandet från.
// Svar (SSO_ACK/SSO_ERROR) ska alltid gå tillbaka dit, aldrig till en hårdkodad URL.
let lastHubMessageOrigin: string | null = null;

function getHubParentOrigin(): string | null {
  if (isAllowedHubOrigin(lastHubMessageOrigin)) {
    return lastHubMessageOrigin;
  }
  try {
    const origin = document.referrer ? new URL(document.referrer).origin : null;
    return isAllowedHubOrigin(origin) ? origin : null;
  } catch {
    return null;
  }
}


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

function hasSafeSsoTokenShape(value: unknown): value is SsoToken {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const token = value as Record<string, unknown>;
  return typeof token.signature === 'string'
    && token.signature.length > 0
    && !!token.payload
    && typeof token.payload === 'object'
    && !Array.isArray(token.payload);
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

const SSO_VERIFY_MAX_ATTEMPTS = 3;
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function getSsoErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const context = (error as { context?: unknown }).context;
  if (!context || typeof context !== 'object') return undefined;
  const status = (context as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function decodeUtf8Base64(input: string): string {
  const normalized = decodeURIComponent(input).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
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
    const targetOrigin = getHubParentOrigin();
    if (!targetOrigin) return;
    window.parent.postMessage(message, targetOrigin);
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
export const PLANNING_SSO_START_EVENT = 'eventflow-planning-sso-start';
export const PLANNING_SSO_SETTLED_EVENT = 'eventflow-planning-sso-settled';

function notifySsoStart() {
  window.dispatchEvent(new CustomEvent(PLANNING_SSO_START_EVENT));
}

function notifySsoSettled(success: boolean) {
  window.dispatchEvent(new CustomEvent(PLANNING_SSO_SETTLED_EVENT, { detail: { success } }));
}

export function useSsoListener() {
  const isProcessingRef = useRef(false);
  const lastProcessedRef = useRef<string | null>(null);

  // Determine target view based on current route (use window.location to avoid Router dependency)
  const getTargetView = useCallback((): 'planning' | 'warehouse' => {
    if (window.location.pathname.startsWith('/warehouse')) {
      return 'warehouse';
    }
    return 'planning';
  }, []);

  const verifySsoToken = useCallback(async (
    ssoToken: SsoToken,
    supportAttempt: OperationsSupportSsoAttempt | null = null,
  ) => {
    const requestedOrgId = ssoToken.payload?.organization_id ?? null;
    const targetView = supportAttempt?.audience ?? getTargetView();
    // Fingerprinten MÅSTE innehålla organisationen. Annars kan HUB skicka
    // "samma" token-signatur för en annan organisation och dedupe-logiken
    // hoppar över verifieringen – kvar blir föregående organisations context.
    const fingerprint = supportAttempt?.trustKey
      ?? `${getTokenFingerprint(ssoToken.signature)}:${requestedOrgId ?? 'none'}:${targetView}`;

    // TENANT SWITCH: HUB begär en annan organisation än den aktiva.
    // Då får ingen dedupe-check stoppa oss, och all tidigare tenant-state
    // (session + cache) måste bort INNAN den nya sessionen etableras.
    const activeOrgId = getLastKnownOrganizationId();
    const isTenantSwitch = !!requestedOrgId && !!activeOrgId && requestedOrgId !== activeOrgId;
    if (isTenantSwitch) {
      console.warn('[SSO] Organisationsbyte begärt av HUB – rensar tidigare tenant-context', {
        from: activeOrgId,
        to: requestedOrgId,
      });
      lastProcessedRef.current = null;
      sessionStorage.removeItem(SSO_PROCESSED_KEY);
      sessionStorage.removeItem(SSO_PROCESSING_KEY);
      clearPersistedTenantState();
      setLastKnownOrganizationId(null);
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.warn('[SSO] signOut vid tenant-byte misslyckades', e);
      }
      // SIGNED_OUT intentionally clears all support trust. Re-establish only
      // the already parent/origin-validated attempt after the old tenant is gone.
      if (supportAttempt) {
        supportAttempt = beginOperationsSupportSsoAttempt({
          trustKey: supportAttempt.trustKey,
          origin: supportAttempt.origin,
          source: supportAttempt.parentWindow,
          parentWindow: supportAttempt.parentWindow,
          expectedUserId: supportAttempt.expectedUserId,
          expectedOrganizationId: supportAttempt.expectedOrganizationId,
          audience: supportAttempt.audience,
        });
      }
    }

    notifySsoStart();

    // A repeated HUB token must never disappear silently. If the matching session
    // is already established, re-ACK it. If storage is stale, clear it and verify again.
    const ackExistingMatchingSession = async (): Promise<boolean> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const activeSession = sessionData.session;
      const activeTenant = getLastKnownOrganizationId();
      const sessionUserId = activeSession?.user.id;
      const sessionOrganizationId = activeSession?.user.user_metadata?.organization_id;
      // verify-sso-token stores HUB's verified subject and tenant in Auth user
      // metadata before it creates the local Supabase session. Missing values
      // are never a match, and the unverified incoming token cannot replace
      // either value on this fast path.
      const sessionHubUserId = activeSession?.user.user_metadata?.hub_user_id;
      const exactLiveSession = Boolean(
        activeSession
        && supportAttempt
        && requestedOrgId
        && activeTenant === requestedOrgId
        && sessionOrganizationId === requestedOrgId
        && supportAttempt.expectedOrganizationId === requestedOrgId
        && sessionHubUserId === supportAttempt.expectedUserId
        && typeof sessionUserId === 'string'
        && sessionUserId,
      );
      if (exactLiveSession && activateOperationsSupportSsoSession(supportAttempt, {
        sessionHubUserId,
        verifiedUserId: sessionUserId,
        sessionUserId,
        sessionOrganizationId,
        organizationId: activeTenant,
      })) {
        sessionStorage.setItem('isSsoUser', 'true');
        sessionStorage.setItem('skipRoleCheck', 'true');
        lastProcessedRef.current = fingerprint;
        sessionStorage.setItem(SSO_PROCESSED_KEY, fingerprint);
        sendSsoResponse(true);
        notifySsoSettled(true);
        return true;
      }
      lastProcessedRef.current = null;
      sessionStorage.removeItem(SSO_PROCESSED_KEY);
      // The attempt remains pending so the normal verified path can establish
      // it. No context exists while cached/live metadata is absent or differs.
      return false;
    };

    // Check 1 + 2: already processed. Re-ACK only if a real session still exists.
    const storedFingerprint = sessionStorage.getItem(SSO_PROCESSED_KEY);
    if (!isTenantSwitch && (lastProcessedRef.current === fingerprint || storedFingerprint === fingerprint)) {
      console.log('[SSO] Token already processed, validating existing session before ACK:', fingerprint);
      if (await ackExistingMatchingSession()) return;
    }

    // A processing key without our in-memory lock is stale (e.g. React remount/crash).
    const currentlyProcessing = sessionStorage.getItem(SSO_PROCESSING_KEY);
    if (currentlyProcessing === fingerprint) {
      if (isProcessingRef.current) {
        console.log('[SSO] Token is already being verified; the active attempt will ACK it');
        return;
      }
      console.warn('[SSO] Removing stale processing lock:', fingerprint);
      sessionStorage.removeItem(SSO_PROCESSING_KEY);
    }

    if (isProcessingRef.current) {
      console.log('[SSO] Another token is being processed; ignoring parallel attempt');
      return;
    }
    
    // Lock immediately - both in-memory and sessionStorage
    isProcessingRef.current = true;
    sessionStorage.setItem(SSO_PROCESSING_KEY, fingerprint);
    
    console.log('[SSO] Starting verification for:', ssoToken.payload.email, 'fingerprint:', fingerprint, 'target_view:', targetView);

    try {
      let data: SsoResult | null = null;
      let error: unknown = null;

      for (let attempt = 1; attempt <= SSO_VERIFY_MAX_ATTEMPTS; attempt++) {
        const result = await supabase.functions.invoke<SsoResult>('verify-sso-token', {
          body: {
            ...ssoToken,
            target_view: targetView,
          },
        });
        data = result.data;
        error = result.error;

        if (!error && data?.success) break;

        const status = getSsoErrorStatus(error);
        const retryable = status === undefined || status >= 500 || data?.error_code === 'SESSION_CREATE_FAILED';
        if (!retryable || attempt === SSO_VERIFY_MAX_ATTEMPTS) break;

        console.warn('[SSO] Transient verification failure, retrying', { attempt, status, code: data?.error_code });
        await wait(250 * attempt + Math.floor(Math.random() * 300));
      }

      if (error || !data?.success) {
        const status = getSsoErrorStatus(error);
        const errorMessage = error instanceof Error ? error.message : undefined;
        console.error('[SSO] Verification failed:', { error, data, status });
        sendSsoResponse(false, { status, code: data?.error_code ?? 'VERIFY_FAILED', message: data?.message ?? errorMessage });
        notifySsoSettled(false);
        return;
      }

      // A newer exact-parent token may have replaced this attempt while the
      // Edge verification was in flight. Do not let the stale result mutate
      // the local session or produce an ACK.
      if (supportAttempt && !isOperationsSupportSsoAttemptCurrent(supportAttempt)) {
        console.warn('[SSO] Ignoring stale verification result before session mutation');
        notifySsoSettled(false);
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
        notifySsoSettled(false);
        return;
      }

      const clearRejectedSsoState = () => {
        sessionStorage.removeItem('isSsoUser');
        sessionStorage.removeItem('skipRoleCheck');
        lastProcessedRef.current = null;
        sessionStorage.removeItem(SSO_PROCESSED_KEY);
        clearOperationsSupportContextSession();
        // Cache eviction must be synchronous with rejection. Auth sign-out can
        // be delayed by storage/network hooks and must not leave a stale tenant
        // available to the rest of the application in the meantime.
        clearPersistedTenantState();
        setLastKnownOrganizationId(null);
      };

      // Fence the narrow race where a newer delivery arrives while setSession
      // is awaiting. Remove the stale session and never ACK the old attempt.
      if (supportAttempt && !isOperationsSupportSsoAttemptCurrent(supportAttempt)) {
        console.warn('[SSO] Verification attempt became stale while setting session');
        clearRejectedSsoState();
        try { await supabase.auth.signOut(); } catch (e) {
          console.warn('[SSO] Failed to clear stale session', e);
        }
        notifySsoSettled(false);
        return;
      }

      const verifiedUserId = data.user?.id;
      const verifiedOrgId = data.user?.organization_id;
      const sessionUserId = sessionData.session?.user.id;
      const sessionHubUserId = sessionData.session?.user.user_metadata?.hub_user_id;
      const sessionOrganizationId = sessionData.session?.user.user_metadata?.organization_id;
      const exactVerifiedSession = Boolean(
        requestedOrgId
        && verifiedOrgId === requestedOrgId
        && sessionOrganizationId === requestedOrgId
        && typeof verifiedUserId === 'string'
        && verifiedUserId
        && sessionUserId === verifiedUserId
        && (!supportAttempt || (
          supportAttempt.expectedOrganizationId === requestedOrgId
          && sessionHubUserId === supportAttempt.expectedUserId
        )),
      );
      const supportActivated = exactVerifiedSession && supportAttempt
        ? activateOperationsSupportSsoSession(supportAttempt, {
            sessionHubUserId,
            verifiedUserId,
            sessionUserId,
            sessionOrganizationId,
            organizationId: verifiedOrgId,
          })
        : !supportAttempt && exactVerifiedSession;

      if (!supportActivated) {
        clearRejectedSsoState();
        try { await supabase.auth.signOut(); } catch (e) {
          console.warn('[SSO] Failed to clear identity-mismatched session', e);
        }
        notifySsoSettled(false);
        return;
      }

      // Tenant cache and route-bypass flags are written only after the edge
      // identity, live session and parent-bound HUB subject all agree.
      setLastKnownOrganizationId(requestedOrgId);
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
      notifySsoSettled(true);

    } catch (err) {
      console.error('[SSO] Exception during verification:', err);
      sendSsoResponse(false, { status: 500, code: 'NETWORK_ERROR', message: String(err) });
      notifySsoSettled(false);
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
          const tokenJson = decodeUtf8Base64(tokenB64);
          const ssoToken = JSON.parse(tokenJson) as SsoToken;
          // Rensa hashen från URL
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          clearOperationsSupportContextSession();
          verifySsoToken(ssoToken);
        } catch (e) {
          console.error('[SSO] Failed to parse hash token:', e);
          sendSsoResponse(false, { status: 400, code: 'INVALID_TOKEN', message: 'Failed to parse SSO token' });
        }
      }
    }

    // 2. Lyssna på postMessage
    function handleMessage(event: MessageEvent) {
      if (!isAllowedHubOrigin(event.origin)) {
        if (event.data?.type === 'SSO_TOKEN' || event.data?.type === 'PREFERENCES_UPDATE') {
          console.warn('[SSO] Blocked message from untrusted origin:', event.origin);
        }
        return;
      }
      const data = event.data;
      // A same-origin sibling is not the iframe parent. Reject both message
      // types before they can affect origin memory, preferences, Supabase
      // session state or ACKs.
      if ((data?.type === 'SSO_TOKEN' || data?.type === 'PREFERENCES_UPDATE') && event.source !== window.parent) {
        console.warn(`[SSO] Blocked ${data.type} from non-parent window`);
        return;
      }
      if (data?.type === 'SSO_TOKEN' || data?.type === 'PREFERENCES_UPDATE') {
        lastHubMessageOrigin = event.origin;
      }

      
      // Handle SSO_TOKEN message
      if (data?.type === 'SSO_TOKEN') {
        console.log('[SSO] Received SSO_TOKEN via postMessage');
        
        // Försök med olika format som Hubben kan skicka
        let ssoToken: SsoToken | null = null;
        
        // Format 1: event.data.sso_token_b64 (base64-kodat)
        if (data.sso_token_b64) {
          try {
            ssoToken = JSON.parse(decodeUtf8Base64(data.sso_token_b64));
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
        
        if (hasSafeSsoTokenShape(ssoToken)) {
          const audience = getTargetView();
          const trustKey = `${getTokenFingerprint(ssoToken.signature)}:${ssoToken.payload?.organization_id ?? 'none'}:${audience}`;
          const supportAttempt = beginOperationsSupportSsoAttempt({
            trustKey,
            origin: event.origin,
            source: event.source,
            parentWindow: window.parent,
            expectedUserId: ssoToken.payload?.user_id,
            expectedOrganizationId: ssoToken.payload?.organization_id,
            audience,
          });
          verifySsoToken(ssoToken, supportAttempt);
        } else {
          // Only the exact iframe parent may revoke an existing support realm.
          // A sibling window on the same allowed origin must not gain a DoS path.
          if (event.source === window.parent) clearOperationsSupportContextSession();
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
      clearOperationsSupportContextSession();
    };
  }, [getTargetView, verifySsoToken]);
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
