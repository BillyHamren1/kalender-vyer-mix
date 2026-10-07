// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetOperationsSupportContextForTests,
  activateOperationsSupportSsoSession,
  beginOperationsSupportSsoAttempt,
  clearOperationsSupportContextSession,
  installOperationsSupportContextProducer,
  isOperationsSupportEntityReady,
  registerLoadedOperationsSupportEntity,
  type OperationsSupportAudience,
} from './supportContextProducer';

const HUB_ORIGIN = 'https://e-flow.se';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const LEGACY_HUB_SUBJECT = '99999999-9999-4999-8999-999999999999';
const ORG_ID = '22222222-2222-4222-8222-222222222222';
const ORG_B = '77777777-7777-4777-8777-777777777777';
const ENTITY_ID = '33333333-3333-4333-8333-333333333333';
const REQUEST_ID = '44444444-4444-4444-8444-444444444444';
const GENERATION = '55555555-5555-4555-8555-555555555555';
const TRUST_KEY = `token:${ORG_ID}:planning`;

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  __resetOperationsSupportContextForTests();
});

function setup(audience: OperationsSupportAudience, pathname: string) {
  const parent = { postMessage: vi.fn() } as unknown as Window;
  let auth = { userId: USER_ID as string | null, organizationId: ORG_ID as string | null };
  let path = pathname;
  const attempt = beginOperationsSupportSsoAttempt({
    trustKey: `token:${ORG_ID}:${audience}`,
    origin: HUB_ORIGIN,
    source: parent,
    parentWindow: parent,
    expectedUserId: LEGACY_HUB_SUBJECT,
    expectedOrganizationId: ORG_ID,
    audience,
  });
  expect(activateOperationsSupportSsoSession(attempt, {
    sessionHubUserId: LEGACY_HUB_SUBJECT,
    verifiedUserId: USER_ID,
    sessionUserId: USER_ID,
    sessionOrganizationId: ORG_ID,
    organizationId: ORG_ID,
  })).toBe(true);
  cleanups.push(installOperationsSupportContextProducer({
    hostWindow: window,
    parentWindow: parent,
    getAuth: () => auth,
    getPathname: () => path,
  }));

  const request = {
    type: 'HUB_SUPPORT_CONTEXT_REQUEST',
    version: 1,
    request_id: REQUEST_ID,
    organization_id: ORG_ID,
    frame_generation: GENERATION,
  };
  const send = (data: unknown = request, origin = HUB_ORIGIN, source: unknown = parent) => {
    const event = new MessageEvent('message', { data, origin });
    Object.defineProperty(event, 'source', { value: source });
    window.dispatchEvent(event);
  };
  return {
    parent,
    request,
    send,
    setPath: (next: string) => { path = next; },
    setAuth: (next: typeof auth) => { auth = next; },
  };
}

describe('Operations support context producer', () => {
  it('answers only bounded planning views and the protected legacy alias', () => {
    const s = setup('planning', '/calendar');
    s.send();
    expect(s.parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ view_key: 'calendar' }), HUB_ORIGIN);
    s.setPath('/projects');
    s.send();
    expect(s.parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ view_key: 'project_planning' }), HUB_ORIGIN);
    s.setPath('/project-planning');
    s.send();
    expect(s.parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ view_key: 'project_planning' }), HUB_ORIGIN);
  });

  it('freezes planning audience and never answers warehouse routes', () => {
    const s = setup('planning', '/warehouse');
    s.send();
    expect(s.parent.postMessage).not.toHaveBeenCalled();
    s.setPath('/projects');
    s.send();
    expect(s.parent.postMessage).toHaveBeenCalledTimes(1);
  });

  it('freezes warehouse audience and never answers planning routes', () => {
    const s = setup('warehouse', '/projects');
    s.send();
    expect(s.parent.postMessage).not.toHaveBeenCalled();
    s.setPath('/warehouse/calendar');
    s.send();
    expect(s.parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ view_key: 'warehouse' }), HUB_ORIGIN);
  });

  it('publishes standard and large projects only from matching loaded rows', () => {
    const s = setup('planning', `/project-next/${ENTITY_ID}`);
    cleanups.push(registerLoadedOperationsSupportEntity({
      kind: 'project',
      entityId: ENTITY_ID,
      entityOrganizationId: ORG_ID,
      routeId: ENTITY_ID,
      isContextReady: true,
    }));
    s.send();
    expect(s.parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      view_key: 'project_details', entity_type: 'project', entity_id: ENTITY_ID,
    }), HUB_ORIGIN);

    vi.mocked(s.parent.postMessage).mockClear();
    cleanups.push(registerLoadedOperationsSupportEntity({
      kind: 'large_project',
      entityId: ENTITY_ID,
      entityOrganizationId: ORG_ID,
      routeId: ENTITY_ID,
      isContextReady: true,
    }));
    s.setPath(`/large-project/${ENTITY_ID}/overview`);
    s.send();
    expect(s.parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      view_key: 'project_details', entity_type: 'project', entity_id: ENTITY_ID,
    }), HUB_ORIGIN);
  });

  it('never answers the bare project redirect alias from a stale loaded entity', () => {
    const s = setup('planning', `/project-next/${ENTITY_ID}`);
    cleanups.push(registerLoadedOperationsSupportEntity({
      kind: 'project',
      entityId: ENTITY_ID,
      entityOrganizationId: ORG_ID,
      routeId: ENTITY_ID,
      isContextReady: true,
    }));
    s.send();
    expect(s.parent.postMessage).toHaveBeenCalledTimes(1);

    s.setPath(`/project/${ENTITY_ID}`);
    s.send({
      ...s.request,
      request_id: '44444444-4444-4444-8444-444444444450',
    });
    expect(s.parent.postMessage).toHaveBeenCalledTimes(1);
  });

  it('publishes a warehouse project only from its canonical detail route', () => {
    const s = setup('warehouse', `/warehouse/projects/${ENTITY_ID}`);
    cleanups.push(registerLoadedOperationsSupportEntity({
      kind: 'warehouse_project',
      entityId: ENTITY_ID,
      entityOrganizationId: ORG_ID,
      routeId: ENTITY_ID,
      isContextReady: true,
    }));
    s.send();
    expect(s.parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      view_key: 'warehouse', entity_type: 'warehouse_project', entity_id: ENTITY_ID,
    }), HUB_ORIGIN);
  });

  it('never promotes a packing UUID to warehouse_project', () => {
    const s = setup('warehouse', `/warehouse/packing/${ENTITY_ID}`);
    cleanups.push(registerLoadedOperationsSupportEntity({
      kind: 'warehouse_project',
      entityId: ENTITY_ID,
      entityOrganizationId: ORG_ID,
      routeId: ENTITY_ID,
      isContextReady: true,
    }));
    s.send();
    expect(s.parent.postMessage).toHaveBeenLastCalledWith({
      type: 'HUB_SUPPORT_CONTEXT', version: 1, request_id: REQUEST_ID,
      organization_id: ORG_ID, frame_generation: GENERATION, view_key: 'packlist',
    }, HUB_ORIGIN);
  });

  it('clears a loaded entity synchronously for refetch, route mismatch and tenant mismatch', () => {
    const s = setup('planning', `/project-next/${ENTITY_ID}`);
    registerLoadedOperationsSupportEntity({
      kind: 'project', entityId: ENTITY_ID, entityOrganizationId: ORG_ID,
      routeId: ENTITY_ID, isContextReady: true,
    });
    registerLoadedOperationsSupportEntity({
      kind: 'project', entityId: ENTITY_ID, entityOrganizationId: ORG_ID,
      routeId: ENTITY_ID, isContextReady: false,
    });
    s.send();
    expect(s.parent.postMessage).toHaveBeenLastCalledWith(expect.not.objectContaining({ entity_id: expect.anything() }), HUB_ORIGIN);

    vi.mocked(s.parent.postMessage).mockClear();
    registerLoadedOperationsSupportEntity({
      kind: 'project', entityId: ENTITY_ID, entityOrganizationId: 'other-org',
      routeId: ENTITY_ID, isContextReady: true,
    });
    s.send();
    expect(s.parent.postMessage).toHaveBeenLastCalledWith(expect.not.objectContaining({ entity_id: expect.anything() }), HUB_ORIGIN);
  });

  it('rejects hostile source/origin, extra fields, bad nonces, actor and tenant drift', () => {
    const s = setup('planning', '/projects');
    s.send(s.request, HUB_ORIGIN, window);
    s.send(s.request, 'https://evil.example');
    s.send({ ...s.request, customer_name: 'Secret' });
    s.send({ ...s.request, request_id: 'not-a-uuid' });
    expect(s.parent.postMessage).not.toHaveBeenCalled();

    s.setAuth({ userId: 'other', organizationId: ORG_ID });
    s.send();
    expect(s.parent.postMessage).not.toHaveBeenCalled();
    s.setAuth({ userId: USER_ID, organizationId: ORG_ID });
    s.send();
    expect(s.parent.postMessage).not.toHaveBeenCalled();
  });

  it('requires edge/session actor agreement while supporting a verified legacy HUB subject', () => {
    clearOperationsSupportContextSession();
    const parent = { postMessage: vi.fn() } as unknown as Window;
    const attempt = beginOperationsSupportSsoAttempt({
      trustKey: TRUST_KEY,
      origin: HUB_ORIGIN, source: parent, parentWindow: parent,
      expectedUserId: LEGACY_HUB_SUBJECT, expectedOrganizationId: ORG_ID, audience: 'planning',
    });
    expect(activateOperationsSupportSsoSession(attempt, {
      sessionHubUserId: LEGACY_HUB_SUBJECT,
      verifiedUserId: USER_ID,
      sessionUserId: 'different',
      sessionOrganizationId: ORG_ID,
      organizationId: ORG_ID,
    })).toBe(false);

    const second = beginOperationsSupportSsoAttempt({
      trustKey: `${TRUST_KEY}:second`,
      origin: HUB_ORIGIN, source: parent, parentWindow: parent,
      expectedUserId: LEGACY_HUB_SUBJECT, expectedOrganizationId: ORG_ID, audience: 'planning',
    });
    expect(activateOperationsSupportSsoSession(second, {
      sessionHubUserId: 'different-hub-subject',
      verifiedUserId: USER_ID,
      sessionUserId: USER_ID,
      sessionOrganizationId: ORG_ID,
      organizationId: ORG_ID,
    })).toBe(false);
  });

  it('clears the previous session on every new SSO attempt', () => {
    const s = setup('planning', '/projects');
    beginOperationsSupportSsoAttempt({
      trustKey: `${TRUST_KEY}:new-token`,
      origin: HUB_ORIGIN,
      source: s.parent,
      parentWindow: s.parent,
      expectedUserId: LEGACY_HUB_SUBJECT,
      expectedOrganizationId: ORG_ID,
      audience: 'planning',
    });
    s.send();
    expect(s.parent.postMessage).not.toHaveBeenCalled();
  });

  it('revokes old support trust when the exact parent sends malformed new SSO claims', () => {
    const s = setup('planning', '/projects');
    expect(beginOperationsSupportSsoAttempt({
      trustKey: 'malformed-token',
      origin: HUB_ORIGIN,
      source: s.parent,
      parentWindow: s.parent,
      expectedUserId: '',
      expectedOrganizationId: ORG_ID,
      audience: 'planning',
    })).toBeNull();
    s.send();
    expect(s.parent.postMessage).not.toHaveBeenCalled();
  });

  it('does not let an unrelated window revoke the parent-bound support realm', () => {
    const s = setup('planning', '/projects');
    expect(beginOperationsSupportSsoAttempt({
      trustKey: 'hostile-token',
      origin: HUB_ORIGIN,
      source: window,
      parentWindow: s.parent,
      expectedUserId: 'attacker',
      expectedOrganizationId: 'attacker-org',
      audience: 'planning',
    })).toBeNull();
    s.send();
    expect(s.parent.postMessage).toHaveBeenCalledTimes(1);
  });

  it('keeps one pending attempt and an active realm across identical token redelivery', () => {
    clearOperationsSupportContextSession();
    const parent = { postMessage: vi.fn() } as unknown as Window;
    const input = {
      trustKey: TRUST_KEY,
      origin: HUB_ORIGIN,
      source: parent,
      parentWindow: parent,
      expectedUserId: LEGACY_HUB_SUBJECT,
      expectedOrganizationId: ORG_ID,
      audience: 'planning' as const,
    };
    const first = beginOperationsSupportSsoAttempt(input);
    const duplicateWhilePending = beginOperationsSupportSsoAttempt(input);
    expect(duplicateWhilePending).toBe(first);
    expect(activateOperationsSupportSsoSession(first, {
      sessionHubUserId: LEGACY_HUB_SUBJECT,
      verifiedUserId: USER_ID,
      sessionUserId: USER_ID,
      sessionOrganizationId: ORG_ID,
      organizationId: ORG_ID,
    })).toBe(true);

    expect(beginOperationsSupportSsoAttempt(input)).toBeNull();
    const uninstall = installOperationsSupportContextProducer({
      hostWindow: window,
      parentWindow: parent,
      getAuth: () => ({ userId: USER_ID, organizationId: ORG_ID }),
      getPathname: () => '/projects',
    });
    cleanups.push(uninstall);
    const event = new MessageEvent('message', {
      origin: HUB_ORIGIN,
      data: {
        type: 'HUB_SUPPORT_CONTEXT_REQUEST', version: 1,
        request_id: REQUEST_ID, organization_id: ORG_ID, frame_generation: GENERATION,
      },
    });
    Object.defineProperty(event, 'source', { value: parent });
    window.dispatchEvent(event);
    expect(parent.postMessage).toHaveBeenCalledTimes(1);
  });

  it('can re-establish a validated org-B attempt after internal tenant-switch signout', () => {
    clearOperationsSupportContextSession();
    const parent = { postMessage: vi.fn() } as unknown as Window;
    const orgAAttempt = beginOperationsSupportSsoAttempt({
      trustKey: TRUST_KEY, origin: HUB_ORIGIN, source: parent, parentWindow: parent,
      expectedUserId: LEGACY_HUB_SUBJECT, expectedOrganizationId: ORG_ID, audience: 'planning',
    });
    expect(activateOperationsSupportSsoSession(orgAAttempt, {
      sessionHubUserId: LEGACY_HUB_SUBJECT, verifiedUserId: USER_ID, sessionUserId: USER_ID,
      sessionOrganizationId: ORG_ID, organizationId: ORG_ID,
    })).toBe(true);
    registerLoadedOperationsSupportEntity({
      kind: 'project', entityId: ENTITY_ID, entityOrganizationId: ORG_ID,
      routeId: ENTITY_ID, isContextReady: true,
    });

    const seed = {
      trustKey: `token:${ORG_B}:planning`,
      origin: HUB_ORIGIN,
      source: parent,
      parentWindow: parent,
      expectedUserId: LEGACY_HUB_SUBJECT,
      expectedOrganizationId: ORG_B,
      audience: 'planning' as const,
    };
    expect(beginOperationsSupportSsoAttempt(seed)).not.toBeNull();
    clearOperationsSupportContextSession(); // internal SIGNED_OUT
    const restored = beginOperationsSupportSsoAttempt(seed);
    expect(activateOperationsSupportSsoSession(restored, {
      sessionHubUserId: LEGACY_HUB_SUBJECT,
      verifiedUserId: USER_ID,
      sessionUserId: USER_ID,
      sessionOrganizationId: ORG_B,
      organizationId: ORG_B,
    })).toBe(true);

    cleanups.push(installOperationsSupportContextProducer({
      hostWindow: window,
      parentWindow: parent,
      getAuth: () => ({ userId: USER_ID, organizationId: ORG_B }),
      getPathname: () => '/projects',
    }));
    const send = (organizationId: string, requestId: string) => {
      const event = new MessageEvent('message', { origin: HUB_ORIGIN, data: {
        type: 'HUB_SUPPORT_CONTEXT_REQUEST', version: 1, request_id: requestId,
        organization_id: organizationId, frame_generation: GENERATION,
      } });
      Object.defineProperty(event, 'source', { value: parent });
      window.dispatchEvent(event);
    };
    send(ORG_ID, '88888888-8888-4888-8888-888888888881');
    expect(parent.postMessage).not.toHaveBeenCalled();

    send(ORG_B, '88888888-8888-4888-8888-888888888882');
    expect(parent.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      organization_id: ORG_B,
      view_key: 'project_planning',
    }), HUB_ORIGIN);
  });

  it('excludes economy, mobile, scanner, public, auth, admin, inventory, service, verify, jobs and unknown routes', () => {
    const planning = setup('planning', '/project/33333333-3333-4333-8333-333333333333/economy');
    for (const path of ['/m', '/scanner', '/auth', '/admin/sync', '/logistics', '/unknown']) {
      planning.setPath(path);
      planning.send();
    }
    expect(planning.parent.postMessage).not.toHaveBeenCalled();
    clearOperationsSupportContextSession();

    const warehouse = setup('warehouse', '/warehouse/inventory');
    for (const path of ['/warehouse/service', `/warehouse/packing/${ENTITY_ID}/verify`, `/jobs/${ENTITY_ID}`, '/warehouse/bookings/123']) {
      warehouse.setPath(path);
      warehouse.send();
    }
    expect(warehouse.parent.postMessage).not.toHaveBeenCalled();
  });

  it('readiness fails closed during auth/query uncertainty', () => {
    const ready = {
      userId: USER_ID, authLoading: false, isPending: false,
      isFetching: false, isError: false, hasEntity: true,
    };
    expect(isOperationsSupportEntityReady(ready)).toBe(true);
    for (const blocked of [
      { userId: null }, { authLoading: true }, { isPending: true },
      { isFetching: true }, { isError: true }, { hasEntity: false },
    ]) {
      expect(isOperationsSupportEntityReady({ ...ready, ...blocked })).toBe(false);
    }
  });
});
