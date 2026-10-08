// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  user: { id: '11111111-1111-4111-8111-111111111111' } as { id: string } | null,
  isLoading: false,
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authState }));

import { useOperationsSupportContext } from './useOperationsSupportContext';
import {
  __resetOperationsSupportContextForTests,
  activateOperationsSupportSsoSession,
  beginOperationsSupportSsoAttempt,
  installOperationsSupportContextProducer,
  registerLoadedOperationsSupportEntity,
} from '@/lib/sso/supportContextProducer';

const HUB_ORIGIN = 'https://e-flow.se';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const PROJECT_A = '33333333-3333-4333-8333-333333333333';
const PROJECT_B = '66666666-6666-4666-8666-666666666666';
const GENERATION = '55555555-5555-4555-8555-555555555555';

let uninstall: (() => void) | null = null;
let parent: Window;
let liveAuth: { userId: string | null; organizationId: string | null };

function request(requestId: string) {
  const event = new MessageEvent('message', {
    origin: HUB_ORIGIN,
    data: {
      type: 'HUB_SUPPORT_CONTEXT_REQUEST', version: 1,
      request_id: requestId, organization_id: ORG_ID, frame_generation: GENERATION,
    },
  });
  Object.defineProperty(event, 'source', { value: parent });
  window.dispatchEvent(event);
}

beforeEach(() => {
  authState.user = { id: USER_ID };
  authState.isLoading = false;
  liveAuth = { userId: USER_ID, organizationId: ORG_ID };
  parent = { postMessage: vi.fn() } as unknown as Window;
  const attempt = beginOperationsSupportSsoAttempt({
    trustKey: 'token:planning', origin: HUB_ORIGIN, source: parent, parentWindow: parent,
    expectedUserId: USER_ID, expectedOrganizationId: ORG_ID, audience: 'planning',
  });
  expect(activateOperationsSupportSsoSession(attempt, {
    sessionHubUserId: USER_ID,
    verifiedUserId: USER_ID,
    sessionUserId: USER_ID,
    sessionOrganizationId: ORG_ID,
    organizationId: ORG_ID,
  })).toBe(true);
  uninstall = installOperationsSupportContextProducer({
    hostWindow: window,
    parentWindow: parent,
    getAuth: () => liveAuth,
    getPathname: () => window.location.pathname,
  });
});

afterEach(() => {
  uninstall?.();
  uninstall = null;
  __resetOperationsSupportContextForTests();
  window.history.replaceState(null, '', '/');
});

it('closes navigation/refetch/error/unmount races before replying', () => {
  window.history.replaceState(null, '', `/project-next/${PROJECT_A}`);
  const readyA = {
    kind: 'project' as const,
    entityId: PROJECT_A,
    entityOrganizationId: ORG_ID,
    routeId: PROJECT_A,
    isPending: false,
    isFetching: false,
    isError: false,
    hasEntity: true,
  };
  const { rerender, unmount } = renderHook(
    (props) => useOperationsSupportContext(props),
    { initialProps: readyA },
  );
  request('44444444-4444-4444-8444-444444444441');
  expect(parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ entity_id: PROJECT_A }), HUB_ORIGIN);

  vi.mocked(parent.postMessage).mockClear();
  window.history.replaceState(null, '', `/project/${PROJECT_A}`);
  request('44444444-4444-4444-8444-444444444450');
  expect(parent.postMessage).not.toHaveBeenCalled();

  window.history.replaceState(null, '', `/project-next/${PROJECT_B}`);
  request('44444444-4444-4444-8444-444444444442');
  expect(parent.postMessage).toHaveBeenLastCalledWith(expect.not.objectContaining({ entity_id: expect.anything() }), HUB_ORIGIN);

  rerender({ ...readyA, entityId: PROJECT_B, routeId: PROJECT_B });
  request('44444444-4444-4444-8444-444444444443');
  expect(parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ entity_id: PROJECT_B }), HUB_ORIGIN);

  vi.mocked(parent.postMessage).mockClear();
  rerender({ ...readyA, entityId: PROJECT_B, routeId: PROJECT_B, isFetching: true });
  request('44444444-4444-4444-8444-444444444444');
  expect(parent.postMessage).toHaveBeenLastCalledWith(expect.not.objectContaining({ entity_id: expect.anything() }), HUB_ORIGIN);

  vi.mocked(parent.postMessage).mockClear();
  rerender({ ...readyA, entityId: PROJECT_B, routeId: PROJECT_B, isError: true });
  request('44444444-4444-4444-8444-444444444445');
  expect(parent.postMessage).toHaveBeenLastCalledWith(expect.not.objectContaining({ entity_id: expect.anything() }), HUB_ORIGIN);

  vi.mocked(parent.postMessage).mockClear();
  unmount();
  request('44444444-4444-4444-8444-444444444446');
  expect(parent.postMessage).toHaveBeenLastCalledWith(expect.not.objectContaining({ entity_id: expect.anything() }), HUB_ORIGIN);
});

it('does not let stale cleanup from project A clear a later project B registration', () => {
  const cleanupA = registerLoadedOperationsSupportEntity({
    kind: 'project', entityId: PROJECT_A, entityOrganizationId: ORG_ID,
    routeId: PROJECT_A, isContextReady: true,
  });
  registerLoadedOperationsSupportEntity({
    kind: 'project', entityId: PROJECT_B, entityOrganizationId: ORG_ID,
    routeId: PROJECT_B, isContextReady: true,
  });
  cleanupA();
  window.history.replaceState(null, '', `/project-next/${PROJECT_B}`);
  request('44444444-4444-4444-8444-444444444447');
  expect(parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ entity_id: PROJECT_B }), HUB_ORIGIN);
});

it('revokes active trust when the live auth actor or organization drifts', () => {
  window.history.replaceState(null, '', '/projects');
  liveAuth = { userId: USER_ID, organizationId: 'different-org' };
  request('44444444-4444-4444-8444-444444444448');
  expect(parent.postMessage).not.toHaveBeenCalled();

  liveAuth = { userId: USER_ID, organizationId: ORG_ID };
  request('44444444-4444-4444-8444-444444444449');
  expect(parent.postMessage).not.toHaveBeenCalled();
});
