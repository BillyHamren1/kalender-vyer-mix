import { isAllowedHubOrigin } from './hubOrigins';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_KEYS = [
  'type',
  'version',
  'request_id',
  'organization_id',
  'frame_generation',
] as const;

type HubWindow = Pick<Window, 'postMessage'>;
export type OperationsSupportAudience = 'planning' | 'warehouse';
export type OperationsSupportEntityKind = 'project' | 'large_project' | 'warehouse_project';

export type OperationsSupportSsoAttempt = Readonly<{
  trustKey: string;
  origin: string;
  parentWindow: Window;
  expectedUserId: string;
  expectedOrganizationId: string;
  audience: OperationsSupportAudience;
}>;

type ActiveHubSession = Readonly<{
  trustKey: string;
  origin: string;
  parentWindow: HubWindow;
  userId: string;
  hubSubjectUserId: string;
  organizationId: string;
  audience: OperationsSupportAudience;
}>;

type LoadedEntity = Readonly<{
  kind: OperationsSupportEntityKind;
  id: string;
  organizationId: string;
  routeId: string;
}>;

type SupportRequest = Readonly<{
  type: 'HUB_SUPPORT_CONTEXT_REQUEST';
  version: 1;
  request_id: string;
  organization_id: string;
  frame_generation: string;
}>;

type ProducerOptions = {
  hostWindow?: Window;
  parentWindow?: Window;
  getAuth: () => { userId: string | null; organizationId: string | null };
  getPathname: () => string;
};

let pendingAttempt: OperationsSupportSsoAttempt | null = null;
let activeSession: ActiveHubSession | null = null;
let loadedEntity: LoadedEntity | null = null;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isExactRequest(value: unknown): value is SupportRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  const keys = Object.keys(data);
  if (keys.length !== REQUEST_KEYS.length || keys.some((key) => !(REQUEST_KEYS as readonly string[]).includes(key))) {
    return false;
  }
  return data.type === 'HUB_SUPPORT_CONTEXT_REQUEST'
    && data.version === 1
    && isUuid(data.request_id)
    && typeof data.organization_id === 'string'
    && data.organization_id.length > 0
    && data.organization_id.length <= 128
    && isUuid(data.frame_generation);
}

function normalizePathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

function loadedEntityFor(
  kind: OperationsSupportEntityKind,
  routeId: string,
  organizationId: string,
): { entity_type: 'project' | 'warehouse_project'; entity_id: string } | null {
  if (
    !loadedEntity
    || loadedEntity.kind !== kind
    || !isUuid(routeId)
    || loadedEntity.routeId.toLowerCase() !== routeId.toLowerCase()
    || loadedEntity.id.toLowerCase() !== routeId.toLowerCase()
    || loadedEntity.organizationId !== organizationId
  ) {
    return null;
  }

  return {
    entity_type: kind === 'warehouse_project' ? 'warehouse_project' : 'project',
    entity_id: loadedEntity.id,
  };
}

function planningObservation(pathname: string, organizationId: string) {
  if (pathname === '/calendar') return { view_key: 'calendar' } as const;
  if (pathname === '/projects' || pathname === '/project-planning') {
    return { view_key: 'project_planning' } as const;
  }

  const standard = pathname.match(/^\/project-next\/([^/]+)$/)
    ?? pathname.match(/^\/project\/([^/]+)\/(?:execution|establishment)$/);
  if (standard) {
    const entity = loadedEntityFor('project', standard[1], organizationId);
    return entity ? { view_key: 'project_details', ...entity } as const : { view_key: 'project_details' } as const;
  }

  const large = pathname.match(/^\/large-project\/([^/]+)(?:\/(?:overview|establishment|collaboration))?$/);
  if (large) {
    const entity = loadedEntityFor('large_project', large[1], organizationId);
    return entity ? { view_key: 'project_details', ...entity } as const : { view_key: 'project_details' } as const;
  }

  return null;
}

function warehouseObservation(pathname: string, organizationId: string) {
  if (pathname === '/warehouse' || pathname === '/warehouse/calendar') {
    return { view_key: 'warehouse' } as const;
  }

  const project = pathname.match(/^\/warehouse\/projects\/([^/]+)$/);
  if (project) {
    const entity = loadedEntityFor('warehouse_project', project[1], organizationId);
    return entity ? { view_key: 'warehouse', ...entity } as const : { view_key: 'warehouse' } as const;
  }

  // A packing id is not a warehouse-project id. The page may describe a
  // packlist, but its UUID must never be promoted to an entity observation.
  if (pathname === '/warehouse/packing' || /^\/warehouse\/packing\/[^/]+$/.test(pathname)) {
    return { view_key: 'packlist' } as const;
  }

  return null;
}

function routeObservation(pathname: string, session: ActiveHubSession) {
  const normalized = normalizePathname(pathname);
  return session.audience === 'planning'
    ? planningObservation(normalized, session.organizationId)
    : warehouseObservation(normalized, session.organizationId);
}

export function isOperationsSupportEntityReady(input: {
  userId: string | null | undefined;
  authLoading: boolean;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  hasEntity: boolean;
}): boolean {
  return Boolean(
    input.userId
    && !input.authLoading
    && !input.isPending
    && !input.isFetching
    && !input.isError
    && input.hasEntity
  );
}

/** Begin support trust from the same accepted parent-bound SSO_TOKEN event. */
export function beginOperationsSupportSsoAttempt(input: {
  trustKey: string;
  origin: string;
  source: MessageEventSource | null;
  parentWindow: Window;
  expectedUserId: string | null | undefined;
  expectedOrganizationId: string | null | undefined;
  audience: OperationsSupportAudience;
}): OperationsSupportSsoAttempt | null {
  if (
    input.source !== input.parentWindow
    || !isAllowedHubOrigin(input.origin)
  ) {
    return null;
  }

  // Once the exact trusted parent starts a new SSO delivery, old support
  // authority must not survive malformed or incomplete claims.
  if (
    typeof input.trustKey !== 'string'
    || !input.trustKey
    || input.trustKey.length > 256
    || typeof input.expectedUserId !== 'string'
    || !input.expectedUserId
    || typeof input.expectedOrganizationId !== 'string'
    || !input.expectedOrganizationId
  ) {
    clearOperationsSupportContextSession();
    return null;
  }

  if (
    pendingAttempt
    && pendingAttempt.trustKey === input.trustKey
    && pendingAttempt.origin === input.origin
    && pendingAttempt.parentWindow === input.parentWindow
    && pendingAttempt.expectedUserId === input.expectedUserId
    && pendingAttempt.expectedOrganizationId === input.expectedOrganizationId
    && pendingAttempt.audience === input.audience
  ) {
    return pendingAttempt;
  }

  // Routine redelivery of the exact token keeps the already verified realm.
  // A different token, actor, tenant, parent or audience revokes it immediately.
  if (
    activeSession
    && activeSession.trustKey === input.trustKey
    && activeSession.origin === input.origin
    && activeSession.parentWindow === input.parentWindow
    && activeSession.hubSubjectUserId === input.expectedUserId
    && activeSession.organizationId === input.expectedOrganizationId
    && activeSession.audience === input.audience
  ) {
    return null;
  }

  clearOperationsSupportContextSession();

  const attempt = Object.freeze({
    trustKey: input.trustKey,
    origin: input.origin,
    parentWindow: input.parentWindow,
    expectedUserId: input.expectedUserId,
    expectedOrganizationId: input.expectedOrganizationId,
    audience: input.audience,
  });
  pendingAttempt = attempt;
  return attempt;
}

/** Activate only after normal SSO established the exact signed actor and tenant. */
export function activateOperationsSupportSsoSession(
  attempt: OperationsSupportSsoAttempt | null,
  actual: {
    sessionHubUserId: string | null | undefined;
    verifiedUserId: string | null | undefined;
    sessionUserId: string | null | undefined;
    sessionOrganizationId: string | null | undefined;
    organizationId: string | null | undefined;
  },
): boolean {
  if (
    !attempt
    || pendingAttempt !== attempt
    || actual.sessionHubUserId !== attempt.expectedUserId
    || typeof actual.verifiedUserId !== 'string'
    || !actual.verifiedUserId
    || actual.sessionUserId !== actual.verifiedUserId
    || actual.sessionOrganizationId !== attempt.expectedOrganizationId
    || actual.organizationId !== attempt.expectedOrganizationId
  ) {
    if (pendingAttempt === attempt) pendingAttempt = null;
    return false;
  }

  activeSession = Object.freeze({
    trustKey: attempt.trustKey,
    origin: attempt.origin,
    parentWindow: attempt.parentWindow,
    userId: actual.sessionUserId,
    hubSubjectUserId: attempt.expectedUserId,
    organizationId: actual.organizationId,
    audience: attempt.audience,
  });
  pendingAttempt = null;
  return true;
}

export function clearOperationsSupportContextSession(): void {
  pendingAttempt = null;
  activeSession = null;
  loadedEntity = null;
}

/** Register only an ordinary, already-loaded, current-tenant query result. */
export function registerLoadedOperationsSupportEntity(input: {
  kind: OperationsSupportEntityKind;
  entityId: string | null | undefined;
  entityOrganizationId: string | null | undefined;
  routeId: string | null | undefined;
  isContextReady: boolean;
}): () => void {
  if (
    !input.isContextReady
    || !isUuid(input.entityId)
    || !isUuid(input.routeId)
    || typeof input.entityOrganizationId !== 'string'
    || !input.entityOrganizationId
    || input.entityId.toLowerCase() !== input.routeId.toLowerCase()
  ) {
    loadedEntity = null;
    return () => {};
  }

  const registration = Object.freeze({
    kind: input.kind,
    id: input.entityId,
    organizationId: input.entityOrganizationId,
    routeId: input.routeId,
  });
  loadedEntity = registration;
  return () => {
    if (loadedEntity === registration) loadedEntity = null;
  };
}

export function installOperationsSupportContextProducer(options: ProducerOptions): () => void {
  const hostWindow = options.hostWindow ?? window;
  const parentWindow = options.parentWindow ?? window.parent;

  const receive = (event: MessageEvent) => {
    const session = activeSession;
    if (!session || session.parentWindow !== parentWindow) return;
    if (event.source !== parentWindow || event.origin !== session.origin) return;
    if (!isExactRequest(event.data)) return;

    const auth = options.getAuth();
    if (
      auth.userId !== session.userId
      || auth.organizationId !== session.organizationId
    ) {
      clearOperationsSupportContextSession();
      return;
    }
    if (event.data.organization_id !== session.organizationId) return;

    const observation = routeObservation(options.getPathname(), session);
    if (!observation) return;

    const response = {
      type: 'HUB_SUPPORT_CONTEXT',
      version: 1,
      request_id: event.data.request_id,
      organization_id: event.data.organization_id,
      frame_generation: event.data.frame_generation,
      ...observation,
    } as const;

    try {
      parentWindow.postMessage(response, session.origin);
    } catch {
      // Context is optional. Normal support intake continues without it.
    }
  };

  hostWindow.addEventListener('message', receive);
  return () => hostWindow.removeEventListener('message', receive);
}

export function __resetOperationsSupportContextForTests(): void {
  clearOperationsSupportContextSession();
}
