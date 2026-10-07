// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  activeOrganizationId: null as string | null,
  clearPersistedTenantState: vi.fn(),
  getSession: vi.fn(),
  invoke: vi.fn(),
  setLastKnownOrganizationId: vi.fn((value: string | null) => {
    mocks.activeOrganizationId = value;
  }),
  setSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      setSession: mocks.setSession,
      signOut: mocks.signOut,
    },
    functions: { invoke: mocks.invoke },
  },
}));

vi.mock('@/lib/tenant/tenantCacheGuard', () => ({
  clearPersistedTenantState: mocks.clearPersistedTenantState,
  getLastKnownOrganizationId: () => mocks.activeOrganizationId,
  setLastKnownOrganizationId: mocks.setLastKnownOrganizationId,
}));

import { useSsoListener } from './useSsoListener';
import {
  __resetOperationsSupportContextForTests,
  activateOperationsSupportSsoSession,
  beginOperationsSupportSsoAttempt,
  clearOperationsSupportContextSession,
  installOperationsSupportContextProducer,
  registerLoadedOperationsSupportEntity,
} from '@/lib/sso/supportContextProducer';

const HUB_ORIGIN = 'https://e-flow.se';
const LOCAL_USER_ID = '11111111-1111-4111-8111-111111111111';
const HUB_USER_ID = '99999999-9999-4999-8999-999999999999';
const ORG_A = '22222222-2222-4222-8222-222222222222';
const ORG_B = '77777777-7777-4777-8777-777777777777';
const ENTITY_ID = '33333333-3333-4333-8333-333333333333';
const GENERATION = '55555555-5555-4555-8555-555555555555';

let originalParentDescriptor: PropertyDescriptor | undefined;

function activateOrgA(parent: Window) {
  const orgAAttempt = beginOperationsSupportSsoAttempt({
    trustKey: `old-token:${ORG_A}:planning`,
    origin: HUB_ORIGIN,
    source: parent,
    parentWindow: parent,
    expectedUserId: HUB_USER_ID,
    expectedOrganizationId: ORG_A,
    audience: 'planning',
  });
  expect(activateOperationsSupportSsoSession(orgAAttempt, {
    sessionHubUserId: HUB_USER_ID,
    verifiedUserId: LOCAL_USER_ID,
    sessionUserId: LOCAL_USER_ID,
    sessionOrganizationId: ORG_A,
    organizationId: ORG_A,
  })).toBe(true);
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  __resetOperationsSupportContextForTests();
  window.history.replaceState(null, '', '/projects');
  originalParentDescriptor = Object.getOwnPropertyDescriptor(window, 'parent');
  mocks.activeOrganizationId = ORG_A;
  mocks.signOut.mockImplementation(async () => {
    // Mirrors AuthContext's SIGNED_OUT listener during the tenant transition.
    clearOperationsSupportContextSession();
    return { error: null };
  });
  mocks.invoke.mockResolvedValue({
    data: {
      success: true,
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      user: {
        id: LOCAL_USER_ID,
        email: 'user@example.test',
        organization_id: ORG_B,
        full_name: 'Test User',
        sso_user: true,
      },
      roles: ['user'],
    },
    error: null,
  });
  mocks.setSession.mockResolvedValue({
    data: {
      session: {
        user: {
          id: LOCAL_USER_ID,
          user_metadata: {
            hub_user_id: HUB_USER_ID,
            organization_id: ORG_B,
          },
        },
      },
    },
    error: null,
  });
});

afterEach(() => {
  if (originalParentDescriptor) Object.defineProperty(window, 'parent', originalParentDescriptor);
  else Reflect.deleteProperty(window, 'parent');
  __resetOperationsSupportContextForTests();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

it('survives the real SSO org-A to org-B signout lifecycle without reviving A', async () => {
  const parent = { postMessage: vi.fn() } as unknown as Window;
  Object.defineProperty(window, 'parent', { configurable: true, value: parent });

  activateOrgA(parent);
  registerLoadedOperationsSupportEntity({
    kind: 'project',
    entityId: ENTITY_ID,
    entityOrganizationId: ORG_A,
    routeId: ENTITY_ID,
    isContextReady: true,
  });

  const hook = renderHook(() => useSsoListener());
  const token = {
    payload: {
      user_id: HUB_USER_ID,
      email: 'user@example.test',
      organization_id: ORG_B,
      full_name: 'Test User',
      timestamp: Date.now(),
      expires_at: Date.now() + 60_000,
    },
    signature: 'new-org-b-signature-with-enough-entropy-for-fingerprint',
  };
  const ssoEvent = new MessageEvent('message', {
    origin: HUB_ORIGIN,
    data: { type: 'SSO_TOKEN', token },
  });
  Object.defineProperty(ssoEvent, 'source', { value: parent });
  act(() => window.dispatchEvent(ssoEvent));

  await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(mocks.setSession).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(parent.postMessage).toHaveBeenCalledWith(
    { type: 'SSO_ACK', success: true },
    HUB_ORIGIN,
  ));
  expect(mocks.clearPersistedTenantState).toHaveBeenCalledTimes(1);
  expect(mocks.activeOrganizationId).toBe(ORG_B);

  vi.mocked(parent.postMessage).mockClear();
  const uninstall = installOperationsSupportContextProducer({
    hostWindow: window,
    parentWindow: parent,
    getAuth: () => ({ userId: LOCAL_USER_ID, organizationId: ORG_B }),
    getPathname: () => '/projects',
  });
  const request = (organizationId: string, requestId: string) => {
    const event = new MessageEvent('message', {
      origin: HUB_ORIGIN,
      data: {
        type: 'HUB_SUPPORT_CONTEXT_REQUEST',
        version: 1,
        request_id: requestId,
        organization_id: organizationId,
        frame_generation: GENERATION,
      },
    });
    Object.defineProperty(event, 'source', { value: parent });
    window.dispatchEvent(event);
  };

  request(ORG_A, '44444444-4444-4444-8444-444444444441');
  expect(parent.postMessage).not.toHaveBeenCalled();
  request(ORG_B, '44444444-4444-4444-8444-444444444442');
  expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({
    organization_id: ORG_B,
    view_key: 'project_planning',
  }), HUB_ORIGIN);

  uninstall();
  hook.unmount();
});

it('revokes on malformed exact-parent SSO but ignores the same malformed sibling delivery', () => {
  const parent = { postMessage: vi.fn() } as unknown as Window;
  const sibling = { postMessage: vi.fn() } as unknown as Window;
  Object.defineProperty(window, 'parent', { configurable: true, value: parent });
  activateOrgA(parent);

  const hook = renderHook(() => useSsoListener());
  const malformedFromSibling = new MessageEvent('message', {
    origin: HUB_ORIGIN,
    data: { type: 'SSO_TOKEN', token: {} },
  });
  Object.defineProperty(malformedFromSibling, 'source', { value: sibling });
  act(() => window.dispatchEvent(malformedFromSibling));

  const uninstall = installOperationsSupportContextProducer({
    hostWindow: window,
    parentWindow: parent,
    getAuth: () => ({ userId: LOCAL_USER_ID, organizationId: ORG_A }),
    getPathname: () => '/projects',
  });
  vi.mocked(parent.postMessage).mockClear();
  const request = (requestId: string) => {
    const event = new MessageEvent('message', {
      origin: HUB_ORIGIN,
      data: {
        type: 'HUB_SUPPORT_CONTEXT_REQUEST',
        version: 1,
        request_id: requestId,
        organization_id: ORG_A,
        frame_generation: GENERATION,
      },
    });
    Object.defineProperty(event, 'source', { value: parent });
    window.dispatchEvent(event);
  };
  request('44444444-4444-4444-8444-444444444443');
  expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({
    organization_id: ORG_A,
    view_key: 'project_planning',
  }), HUB_ORIGIN);

  vi.mocked(parent.postMessage).mockClear();
  const malformedFromParent = new MessageEvent('message', {
    origin: HUB_ORIGIN,
    data: { type: 'SSO_TOKEN', token: {} },
  });
  Object.defineProperty(malformedFromParent, 'source', { value: parent });
  act(() => window.dispatchEvent(malformedFromParent));
  expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({
    type: 'SSO_ERROR',
    success: false,
    error_code: 'INVALID_TOKEN',
  }), HUB_ORIGIN);

  vi.mocked(parent.postMessage).mockClear();
  request('44444444-4444-4444-8444-444444444444');
  expect(parent.postMessage).not.toHaveBeenCalled();

  uninstall();
  hook.unmount();
});
