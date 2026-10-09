import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

let token: string | null = 'secret-token-A';
let staff: any = { id: 'staff-1', organization_id: 'org-1' };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, isLoading: false }) }));
vi.mock('@/hooks/useOrganizationId', () => ({ useOrganizationId: () => ({ organizationId: null, isLoading: false }) }));
vi.mock('@/services/mobileApiService', () => ({
  getToken: () => token, getStoredStaff: () => staff, MOBILE_AUTH_CHANGED_EVENT: 'mobile-auth-changed',
}));

import { useMobileArticleMapScope } from '../useArticleMapScope';

describe('useMobileArticleMapScope', () => {
  it('tracks real staff session, never exposes the token, changes on account switch/revoke/logout', () => {
    const { result } = renderHook(() => useMobileArticleMapScope());
    const first = result.current.sessionKey!;
    expect(result.current.organizationId).toBe('org-1');
    expect(first).not.toContain('secret-token');

    token = 'secret-token-A2'; // silent refresh, same staff → same key
    act(() => { window.dispatchEvent(new Event('mobile-auth-changed')); });
    expect(result.current.sessionKey).toBe(first);

    staff = { id: 'staff-2', organization_id: 'org-2' };
    act(() => { window.dispatchEvent(new Event('mobile-auth-changed')); });
    expect(result.current.organizationId).toBe('org-2');
    const second = result.current.sessionKey!;
    expect(second).not.toBe(first);

    act(() => { window.dispatchEvent(new Event('mobile-session-revoked')); });
    expect(result.current.sessionKey).not.toBe(second);

    token = null;
    act(() => { window.dispatchEvent(new Event('mobile-auth-changed')); });
    expect(result.current).toMatchObject({ organizationId: null, sessionKey: null });
  });
});
