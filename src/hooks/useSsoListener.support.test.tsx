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
  clearOperationsSupportContextAfterAuthSignOut,
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

function ssoToken(
  organizationId = ORG_A,
  signature = 'matching-parent-token-signature-with-enough-entropy',
) {
  return {
    payload: {
      user_id: HUB_USER_ID,
      email: 'user@example.test',
      organization_id: organizationId,
      full_name: 'Test User',
      timestamp: Date.now(),
      expires_at: Date.now() + 60_000,
    },
    signature,
  };
}

function sendSsoToken(parent: Window, token: ReturnType<typeof ssoToken>, source: Window = parent) {
  const event = new MessageEvent('message', {
    origin: HUB_ORIGIN,
    data: { type: 'SSO_TOKEN', token },
  });
  Object.defineProperty(event, 'source', { value: source });
  act(() => window.dispatchEvent(event));
}

function processedFingerprint(token: ReturnType<typeof ssoToken>) {
  const audience = window.location.pathname.startsWith('/warehouse') ? 'warehouse' : 'planning';
  return `${token.signature.slice(0, 32)}:${token.payload.organization_id ?? 'none'}:${audience}`;
}

function matchingSession(organizationId: string | null, hubUserId: string | null = HUB_USER_ID) {
  return {
    data: {
      session: {
        user: {
          id: LOCAL_USER_ID,
          user_metadata: {
            hub_user_id: hubUserId,
            organization_id: organizationId,
          },
        },
      },
    },
    error: null,
  };
}

function installContextProbe(parent: Window, organizationId = ORG_A) {
  return installOperationsSupportContextProducer({
    hostWindow: window,
    parentWindow: parent,
    getAuth: () => ({ userId: LOCAL_USER_ID, organizationId }),
    getPathname: () => '/projects',
  });
}

function requestContext(parent: Window, organizationId = ORG_A) {
  const event = new MessageEvent('message', {
    origin: HUB_ORIGIN,
    data: {
      type: 'HUB_SUPPORT_CONTEXT_REQUEST',
      version: 1,
      request_id: '44444444-4444-4444-8444-444444444499',
      organization_id: organizationId,
      frame_generation: GENERATION,
    },
  });
  Object.defineProperty(event, 'source', { value: parent });
  act(() => window.dispatchEvent(event));
}

function expectNoAck(parent: Window) {
  expect(vi.mocked(parent.postMessage).mock.calls.map(([message]) => message)).not.toContainEqual({
    type: 'SSO_ACK',
    success: true,
  });
}

function successfulEdgeResult(overrides: {
  userId?: string | null;
  organizationId?: string | null;
} = {}) {
  return {
    data: {
      success: true,
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      user: {
        id: overrides.userId === undefined ? LOCAL_USER_ID : overrides.userId,
        email: 'user@example.test',
        organization_id: overrides.organizationId === undefined ? ORG_A : overrides.organizationId,
        full_name: 'Test User',
        sso_user: true,
      },
      roles: ['user'],
    },
    error: null,
  };
}

function establishedSession(overrides: {
  userId?: string;
  organizationId?: string | null;
  hubUserId?: string | null;
} = {}) {
  return {
    data: {
      session: {
        user: {
          id: overrides.userId ?? LOCAL_USER_ID,
          user_metadata: {
            hub_user_id: overrides.hubUserId === undefined ? HUB_USER_ID : overrides.hubUserId,
            organization_id: overrides.organizationId === undefined ? ORG_A : overrides.organizationId,
          },
        },
      },
    },
    error: null,
  };
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
    clearOperationsSupportContextAfterAuthSignOut();
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

it('rejects a valid same-origin sibling token before verification, session or ACK mutation', () => {
  const parent = { postMessage: vi.fn() } as unknown as Window;
  const sibling = { postMessage: vi.fn() } as unknown as Window;
  Object.defineProperty(window, 'parent', { configurable: true, value: parent });
  const hook = renderHook(() => useSsoListener());

  sendSsoToken(parent, ssoToken(), sibling);

  expect(mocks.getSession).not.toHaveBeenCalled();
  expect(mocks.invoke).not.toHaveBeenCalled();
  expect(mocks.setSession).not.toHaveBeenCalled();
  expect(mocks.signOut).not.toHaveBeenCalled();
  expect(parent.postMessage).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('sso_last_processed_fingerprint')).toBeNull();

  hook.unmount();
});

it('rejects same-origin sibling preferences before origin memory or preference mutation', () => {
  const parent = { postMessage: vi.fn() } as unknown as Window;
  const sibling = { postMessage: vi.fn() } as unknown as Window;
  Object.defineProperty(window, 'parent', { configurable: true, value: parent });
  const hook = renderHook(() => useSsoListener());
  const preferences = { language: 'sv', timezone: 'Europe/Stockholm', dateFormat: 'yyyy-MM-dd' };

  const siblingEvent = new MessageEvent('message', {
    origin: HUB_ORIGIN,
    data: { type: 'PREFERENCES_UPDATE', preferences },
  });
  Object.defineProperty(siblingEvent, 'source', { value: sibling });
  act(() => window.dispatchEvent(siblingEvent));

  expect(localStorage.getItem('app_language')).toBeNull();
  expect(localStorage.getItem('app_timezone')).toBeNull();
  expect(localStorage.getItem('app_date_format')).toBeNull();

  const parentEvent = new MessageEvent('message', {
    origin: HUB_ORIGIN,
    data: { type: 'PREFERENCES_UPDATE', preferences },
  });
  Object.defineProperty(parentEvent, 'source', { value: parent });
  act(() => window.dispatchEvent(parentEvent));
  expect(localStorage.getItem('app_language')).toBe('sv');

  hook.unmount();
});

it('reactivates exact parent-bound support trust after remount before ACKing a stored fingerprint', async () => {
  const parent = { postMessage: vi.fn() } as unknown as Window;
  Object.defineProperty(window, 'parent', { configurable: true, value: parent });
  const token = ssoToken();
  sessionStorage.setItem('sso_last_processed_fingerprint', processedFingerprint(token));
  mocks.activeOrganizationId = ORG_A;
  mocks.getSession.mockResolvedValue(matchingSession(ORG_A));

  const previous = renderHook(() => useSsoListener());
  previous.unmount();
  const remounted = renderHook(() => useSsoListener());
  sendSsoToken(parent, token);

  await waitFor(() => expect(parent.postMessage).toHaveBeenCalledWith(
    { type: 'SSO_ACK', success: true },
    HUB_ORIGIN,
  ));
  expect(mocks.getSession).toHaveBeenCalledTimes(1);
  expect(mocks.invoke).not.toHaveBeenCalled();
  expect(mocks.setSession).not.toHaveBeenCalled();

  vi.mocked(parent.postMessage).mockClear();
  const uninstall = installContextProbe(parent);
  requestContext(parent);
  expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({
    type: 'HUB_SUPPORT_CONTEXT',
    organization_id: ORG_A,
    view_key: 'project_planning',
  }), HUB_ORIGIN);

  uninstall();
  remounted.unmount();
});

it.each([
  ['missing cached tenant', null, ORG_A, HUB_USER_ID, 1],
  ['mismatched cached tenant', ORG_B, ORG_A, HUB_USER_ID, 0],
  ['missing live-session tenant', ORG_A, null, HUB_USER_ID, 1],
  ['mismatched live-session tenant', ORG_A, ORG_B, HUB_USER_ID, 1],
  ['mismatched verified HUB subject', ORG_A, ORG_A, LOCAL_USER_ID, 1],
])('never ACKs or restores context from %s', async (_label, cachedOrg, liveOrg, liveHubSubject, getSessionCalls) => {
  const parent = { postMessage: vi.fn() } as unknown as Window;
  Object.defineProperty(window, 'parent', { configurable: true, value: parent });
  const token = ssoToken();
  sessionStorage.setItem('sso_last_processed_fingerprint', processedFingerprint(token));
  mocks.activeOrganizationId = cachedOrg;
  mocks.getSession.mockResolvedValue(matchingSession(liveOrg, liveHubSubject));
  mocks.invoke.mockResolvedValue({
    data: { success: false, error_code: 'DENIED', message: 'Denied' },
    error: { context: { status: 401 } },
  });

  const hook = renderHook(() => useSsoListener());
  sendSsoToken(parent, token);

  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
  expect(mocks.getSession).toHaveBeenCalledTimes(getSessionCalls);
  expect(mocks.setSession).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('sso_last_processed_fingerprint')).toBeNull();
  expectNoAck(parent);

  vi.mocked(parent.postMessage).mockClear();
  const uninstall = installContextProbe(parent);
  requestContext(parent);
  expect(parent.postMessage).not.toHaveBeenCalled();

  uninstall();
  hook.unmount();
});

it('does not revive an older tenant after a newer parent delivery completes during signout', async () => {
  const parent = { postMessage: vi.fn() } as unknown as Window;
  Object.defineProperty(window, 'parent', { configurable: true, value: parent });
  let finishSignOut: (() => void) | undefined;
  mocks.signOut.mockImplementationOnce(() => {
    clearOperationsSupportContextAfterAuthSignOut();
    return new Promise((resolve) => {
      finishSignOut = () => resolve({ error: null });
    });
  });
  mocks.invoke.mockImplementation(async (_name, options) => successfulEdgeResult({
    organizationId: options.body.payload.organization_id,
  }));
  mocks.setSession.mockImplementation(async () => establishedSession({
    organizationId: mocks.invoke.mock.calls.at(-1)?.[1].body.payload.organization_id,
  }));
  const older = ssoToken(ORG_B, 'older-org-b-signout-with-enough-entropy');
  const newer = ssoToken(ORG_A, 'newer-org-a-signout-with-enough-entropy');
  const hook = renderHook(() => useSsoListener());

  sendSsoToken(parent, older);
  await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
  sendSsoToken(parent, newer);
  await waitFor(() => expect(mocks.setSession).toHaveBeenCalledTimes(1));
  expect(mocks.activeOrganizationId).toBe(ORG_A);
  vi.mocked(parent.postMessage).mockClear();

  await act(async () => { finishSignOut?.(); });

  expect(mocks.invoke).toHaveBeenCalledTimes(1);
  expect(mocks.invoke.mock.calls[0][1].body.payload.organization_id).toBe(ORG_A);
  expect(mocks.setSession).toHaveBeenCalledTimes(1);
  expect(mocks.activeOrganizationId).toBe(ORG_A);
  expectNoAck(parent);
  const uninstall = installContextProbe(parent);
  requestContext(parent);
  expect(parent.postMessage).toHaveBeenCalledWith(expect.objectContaining({
    type: 'HUB_SUPPORT_CONTEXT', organization_id: ORG_A,
  }), HUB_ORIGIN);

  uninstall();
  hook.unmount();
});

it.each(['malformed parent token', 'listener disposal', 'explicit logout', 'second auth signout'])('does not resume tenant verification after %s during signout', async (replacement) => {
  const parent = { postMessage: vi.fn() } as unknown as Window;
  Object.defineProperty(window, 'parent', { configurable: true, value: parent });
  let finishSignOut: (() => void) | undefined;
  mocks.signOut.mockImplementationOnce(() => {
    clearOperationsSupportContextAfterAuthSignOut();
    return new Promise((resolve) => {
      finishSignOut = () => resolve({ error: null });
    });
  });
  const hook = renderHook(() => useSsoListener());
  sendSsoToken(parent, ssoToken(ORG_B));
  await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));

  if (replacement === 'listener disposal') {
    hook.unmount();
  } else if (replacement === 'explicit logout') {
    // AuthContext.signOut revokes synchronously before its imports and SDK await.
    clearOperationsSupportContextSession();
  } else if (replacement === 'second auth signout') {
    clearOperationsSupportContextAfterAuthSignOut();
  } else {
    const event = new MessageEvent('message', {
      origin: HUB_ORIGIN, data: { type: 'SSO_TOKEN', token: { signature: '' } },
    });
    Object.defineProperty(event, 'source', { value: parent });
    act(() => window.dispatchEvent(event));
  }
  vi.mocked(parent.postMessage).mockClear();
  await act(async () => { finishSignOut?.(); });

  expect(mocks.invoke).not.toHaveBeenCalled();
  expect(mocks.setSession).not.toHaveBeenCalled();
  expect(mocks.activeOrganizationId).toBeNull();
  expectNoAck(parent);
  const uninstall = installContextProbe(parent, ORG_B);
  requestContext(parent, ORG_B);
  expect(parent.postMessage).not.toHaveBeenCalled();

  uninstall();
  if (replacement !== 'listener disposal') hook.unmount();
});

it('ignores sibling delivery while the current parent tenant switch is signing out', async () => {
  const parent = { postMessage: vi.fn() } as unknown as Window;
  const sibling = { postMessage: vi.fn() } as unknown as Window;
  Object.defineProperty(window, 'parent', { configurable: true, value: parent });
  let finishSignOut: (() => void) | undefined;
  mocks.signOut.mockImplementationOnce(() => {
    clearOperationsSupportContextAfterAuthSignOut();
    return new Promise((resolve) => {
      finishSignOut = () => resolve({ error: null });
    });
  });
  const hook = renderHook(() => useSsoListener());
  sendSsoToken(parent, ssoToken(ORG_B));
  await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
  sendSsoToken(parent, ssoToken(ORG_A), sibling);
  await act(async () => { finishSignOut?.(); });

  expect(mocks.invoke).toHaveBeenCalledTimes(1);
  expect(mocks.invoke.mock.calls[0][1].body.payload.organization_id).toBe(ORG_B);
  expect(mocks.setSession).toHaveBeenCalledTimes(1);
  expect(mocks.activeOrganizationId).toBe(ORG_B);
  expect(parent.postMessage).toHaveBeenCalledWith({ type: 'SSO_ACK', success: true }, HUB_ORIGIN);
  hook.unmount();
});

it('drops a stale in-flight attempt before setSession, ACK and support activation', async () => {
  const parent = { postMessage: vi.fn() } as unknown as Window;
  Object.defineProperty(window, 'parent', { configurable: true, value: parent });
  let resolveVerification: ((value: unknown) => void) | null = null;
  mocks.invoke.mockImplementation(() => new Promise((resolve) => { resolveVerification = resolve; }));
  const first = ssoToken(ORG_A, 'first-parent-token-signature-with-enough-entropy');
  const replacement = ssoToken(ORG_A, 'replacement-parent-token-signature-with-enough-entropy');
  const hook = renderHook(() => useSsoListener());

  sendSsoToken(parent, first);
  await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
  sendSsoToken(parent, replacement);

  await act(async () => {
    resolveVerification?.({
      data: {
        success: true,
        access_token: 'stale-access-token',
        refresh_token: 'stale-refresh-token',
        user: {
          id: LOCAL_USER_ID,
          email: 'user@example.test',
          organization_id: ORG_A,
          full_name: 'Test User',
          sso_user: true,
        },
        roles: ['user'],
      },
      error: null,
    });
    await Promise.resolve();
  });

  await waitFor(() => expect(sessionStorage.getItem('sso_currently_processing')).toBeNull());
  expect(mocks.setSession).not.toHaveBeenCalled();
  expectNoAck(parent);
  vi.mocked(parent.postMessage).mockClear();
  const uninstall = installContextProbe(parent);
  requestContext(parent);
  expect(parent.postMessage).not.toHaveBeenCalled();

  uninstall();
  hook.unmount();
});

it('revokes a session that becomes stale while setSession is pending and clears tenant state before signout settles', async () => {
  const parent = { postMessage: vi.fn() } as unknown as Window;
  Object.defineProperty(window, 'parent', { configurable: true, value: parent });
  let resolveSession: ((value: ReturnType<typeof establishedSession>) => void) | null = null;
  mocks.invoke.mockResolvedValue(successfulEdgeResult());
  mocks.setSession.mockImplementation(() => new Promise((resolve) => { resolveSession = resolve; }));
  const first = ssoToken(ORG_A, 'first-deferred-session-signature-with-enough-entropy');
  const replacement = ssoToken(ORG_A, 'replacement-session-signature-with-enough-entropy');
  const hook = renderHook(() => useSsoListener());

  sendSsoToken(parent, first);
  await waitFor(() => expect(mocks.setSession).toHaveBeenCalledTimes(1));
  sendSsoToken(parent, replacement);

  await act(async () => {
    resolveSession?.(establishedSession());
    await Promise.resolve();
  });

  await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
  expect(mocks.clearPersistedTenantState).toHaveBeenCalledTimes(1);
  expect(mocks.setLastKnownOrganizationId).toHaveBeenLastCalledWith(null);
  expect(mocks.activeOrganizationId).toBeNull();
  expect(sessionStorage.getItem('isSsoUser')).toBeNull();
  expect(sessionStorage.getItem('skipRoleCheck')).toBeNull();
  expect(sessionStorage.getItem('sso_last_processed_fingerprint')).toBeNull();
  expectNoAck(parent);

  vi.mocked(parent.postMessage).mockClear();
  const uninstall = installContextProbe(parent);
  requestContext(parent);
  expect(parent.postMessage).not.toHaveBeenCalled();

  uninstall();
  hook.unmount();
});

it.each([
  ['null edge organization', { organizationId: null }, {}],
  ['mismatched edge organization', { organizationId: ORG_B }, {}],
  ['null edge user', { userId: null }, {}],
  ['mismatched edge/session user', { userId: LOCAL_USER_ID }, { userId: '88888888-8888-4888-8888-888888888888' }],
  ['null session organization', {}, { organizationId: null }],
  ['mismatched session organization', {}, { organizationId: ORG_B }],
  ['null session HUB subject', {}, { hubUserId: null }],
  ['mismatched session HUB subject', {}, { hubUserId: LOCAL_USER_ID }],
] as const)(
  'fails closed after a nominally successful edge response with %s',
  async (_label, edgeOverrides, sessionOverrides) => {
    const parent = { postMessage: vi.fn() } as unknown as Window;
    Object.defineProperty(window, 'parent', { configurable: true, value: parent });
    mocks.invoke.mockResolvedValue(successfulEdgeResult(edgeOverrides));
    mocks.setSession.mockResolvedValue(establishedSession(sessionOverrides));
    const hook = renderHook(() => useSsoListener());

    sendSsoToken(parent, ssoToken());

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
    expect(mocks.clearPersistedTenantState).toHaveBeenCalledTimes(1);
    expect(mocks.setLastKnownOrganizationId).toHaveBeenLastCalledWith(null);
    expect(mocks.activeOrganizationId).toBeNull();
    expect(sessionStorage.getItem('isSsoUser')).toBeNull();
    expect(sessionStorage.getItem('skipRoleCheck')).toBeNull();
    expect(sessionStorage.getItem('sso_last_processed_fingerprint')).toBeNull();
    expectNoAck(parent);

    vi.mocked(parent.postMessage).mockClear();
    const uninstall = installContextProbe(parent);
    requestContext(parent);
    expect(parent.postMessage).not.toHaveBeenCalled();

    uninstall();
    hook.unmount();
  },
);
