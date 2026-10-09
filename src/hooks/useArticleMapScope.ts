import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganizationId } from '@/hooks/useOrganizationId';
import { getStoredStaff, getToken, MOBILE_AUTH_CHANGED_EVENT } from '@/services/mobileApiService';

export interface ArticleMapScope { organizationId: string | null; sessionKey: string | null; scopeLoading: boolean }

/** Desktop: Supabase user + profile organization (same source as the edge function). */
export function useDesktopArticleMapScope(): ArticleMapScope {
  const { user, isLoading } = useAuth();
  const { organizationId, isLoading: orgLoading } = useOrganizationId();
  return { organizationId: user ? organizationId : null, sessionKey: user?.id ?? null, scopeLoading: isLoading || orgLoading };
}

/**
 * Mobile staff session identity. Never exposes the token: the key is staff id +
 * org + a session generation that bumps on login/logout/revocation/other-tab
 * changes. Silent token refresh for the same staff keeps the same key.
 */
function readMobileScope(gen: number): ArticleMapScope {
  const staff = getStoredStaff();
  const hasToken = !!getToken();
  if (!staff?.id || !hasToken) return { organizationId: null, sessionKey: null, scopeLoading: false };
  return { organizationId: (staff as any).organization_id ?? null, sessionKey: `${staff.id}#${gen}`, scopeLoading: false };
}

export function useMobileArticleMapScope(): ArticleMapScope {
  const [gen, setGen] = useState(0);
  const [identity, setIdentity] = useState(() => {
    const s = getStoredStaff();
    return getToken() && s?.id ? `${s.id}|${(s as any).organization_id ?? ''}` : null;
  });
  useEffect(() => {
    const sync = () => {
      const s = getStoredStaff();
      const next = getToken() && s?.id ? `${s.id}|${(s as any).organization_id ?? ''}` : null;
      setIdentity((prev) => { if (prev !== next) setGen((g) => g + 1); return next; });
    };
    const revoke = () => { setGen((g) => g + 1); sync(); };
    const evs = [MOBILE_AUTH_CHANGED_EVENT, 'storage'];
    const revokes = ['mobile-session-revoked', 'mobile-session-expired', 'mobile-session-invalid'];
    evs.forEach((e) => window.addEventListener(e, sync));
    revokes.forEach((e) => window.addEventListener(e, revoke));
    return () => {
      evs.forEach((e) => window.removeEventListener(e, sync));
      revokes.forEach((e) => window.removeEventListener(e, revoke));
    };
  }, []);
  return identity ? readMobileScope(gen) : { organizationId: null, sessionKey: null, scopeLoading: false };
}
