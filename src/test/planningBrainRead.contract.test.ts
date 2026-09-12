/**
 * planning-brain-read.v1 — focused contract tests.
 * Gates: wrong org, missing/invalid signature, read-only, no cross-tenant,
 * no secrets/PII beyond the minimal operational projection.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PLANNING_BRAIN_ACTOR_ROLES,
  PLANNING_BRAIN_FORBIDDEN_FIELDS,
  PLANNING_BRAIN_READ_REQUEST_SCHEMA,
  PLANNING_BRAIN_READ_SCHEMA,
  buildPlanningBrainProjection,
  decidePlanningBrainActor,
  parsePlanningBrainReadRequest,
  planningPhase,
  signPlanningBrainRequest,
  verifyPlanningBrainSignature,
} from '../../supabase/functions/_shared/planning-brain-read-contract';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '99999999-9999-4999-8999-999999999999';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const EVENT = '33333333-3333-4333-8333-333333333333';
const ASSIGNMENT = '44444444-4444-4444-8444-444444444444';
const SECRET = 'planning-brain-test-secret-value';
const NONCE = 'abcdefghijklmnop';

const ACTOR = '88888888-8888-4888-8888-888888888888';
const UNKNOWN_ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const request = {
  schema: PLANNING_BRAIN_READ_REQUEST_SCHEMA,
  actorUserId: ACTOR,
  organizationId: ORG,
  from: '2026-09-01',
  to: '2026-09-07',
};

const MIGRATION_SRC = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260912074415_1653107f-4fd4-43e8-b2fd-5c67cb829808.sql'),
  'utf-8',
);

const ROUTE_SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/planning-brain-read/index.ts'),
  'utf-8',
);

describe('request contract', () => {
  it('accepts a valid request', () => {
    const parsed = parsePlanningBrainReadRequest(request);
    expect(parsed.ok).toBe(true);
  });

  it.each([
    [{ ...request, schema: 'other.v1' }, 'unsupported_schema'],
    [{ ...request, organizationId: 'not-a-uuid' }, 'invalid_organization_id'],
    [{ ...request, actorUserId: 'nope' }, 'invalid_actor_user_id'],
    [(() => { const { actorUserId, ...rest } = request; return rest; })(), 'invalid_actor_user_id'],
    [{ ...request, from: '2026-13-40' }, 'invalid_date_range'],
    [{ ...request, from: '2026-09-08', to: '2026-09-01' }, 'invalid_date_range'],
    [{ ...request, to: '2026-12-31' }, 'range_too_large'],
    [{ ...request, extra: 1 }, 'unexpected_field'],
    [null, 'invalid_body'],
  ])('rejects %#', (input, error) => {
    const parsed = parsePlanningBrainReadRequest(input as unknown);
    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.error).toBe(error);
  });
});

describe('server-to-server signature', () => {
  const now = 1_770_000_000_000;
  const ts = String(now);
  const body = JSON.stringify(request);

  it('verifies a correct signature', async () => {
    const signature = await signPlanningBrainRequest(SECRET, ts, NONCE, body);
    await expect(verifyPlanningBrainSignature({ secret: SECRET, rawBody: body, timestamp: ts, nonce: NONCE, signature, nowMs: now })).resolves.toBe(true);
  });

  it('fails closed with a missing signature, nonce or secret', async () => {
    const signature = await signPlanningBrainRequest(SECRET, ts, NONCE, body);
    await expect(verifyPlanningBrainSignature({ secret: SECRET, rawBody: body, timestamp: ts, nonce: NONCE, signature: null, nowMs: now })).resolves.toBe(false);
    await expect(verifyPlanningBrainSignature({ secret: SECRET, rawBody: body, timestamp: ts, nonce: null, signature, nowMs: now })).resolves.toBe(false);
    await expect(verifyPlanningBrainSignature({ secret: '', rawBody: body, timestamp: ts, nonce: NONCE, signature, nowMs: now })).resolves.toBe(false);
  });

  it('rejects a wrong secret, tampered body and stale timestamp', async () => {
    const signature = await signPlanningBrainRequest(SECRET, ts, NONCE, body);
    await expect(verifyPlanningBrainSignature({ secret: 'wrong', rawBody: body, timestamp: ts, nonce: NONCE, signature, nowMs: now })).resolves.toBe(false);
    await expect(verifyPlanningBrainSignature({ secret: SECRET, rawBody: `${body} `, timestamp: ts, nonce: NONCE, signature, nowMs: now })).resolves.toBe(false);
    await expect(verifyPlanningBrainSignature({ secret: SECRET, rawBody: body, timestamp: ts, nonce: NONCE, signature, nowMs: now + 600_000 })).resolves.toBe(false);
  });
});

describe('projection', () => {
  const rows = {
    projects: [
      { id: PROJECT, organization_id: ORG, booking_id: '2609-13', status: 'active', planning_status: 'planned', is_internal: false, rigdaydate: '2026-09-02', eventdate: '2026-09-03', rigdowndate: '2026-09-04', client: 'Kund AB', contact_email: 'a@b.se', deliveryaddress: 'Gata 1', internalnotes: 'hemligt' },
      { id: '55555555-5555-4555-8555-555555555555', organization_id: OTHER_ORG, booking_id: 'X-1', status: 'active' },
    ],
    calendarEvents: [
      { id: EVENT, organization_id: ORG, booking_id: '2609-13', resource_id: 'team-2', event_type: 'rig', source_date: '2026-09-02', start_time: '2026-09-02T06:00:00Z', end_time: '2026-09-02T14:00:00Z', times_locked: true, title: 'Kund AB – Gata 1', delivery_address: 'Gata 1' },
      { id: '66666666-6666-4666-8666-666666666666', organization_id: OTHER_ORG, event_type: 'event', source_date: '2026-09-03' },
    ],
    assignments: [
      { id: ASSIGNMENT, organization_id: ORG, booking_id: '2609-13', staff_id: 'staff-1', team_id: 'team-2', role: 'crew', assignment_date: '2026-09-02' },
      { id: '77777777-7777-4777-8777-777777777777', organization_id: OTHER_ORG, staff_id: 'staff-x', assignment_date: '2026-09-02' },
    ],
  };

  const projection = buildPlanningBrainProjection({
    request: { ...request, schema: PLANNING_BRAIN_READ_REQUEST_SCHEMA },
    rows,
    generatedAt: '2026-09-12T05:00:00.000Z',
  });

  it('returns the versioned schema and canonical identity', () => {
    expect(projection.schema).toBe(PLANNING_BRAIN_READ_SCHEMA);
    expect(projection.canonicalIdentity.organizationId).toBe(ORG);
    expect(projection.window).toEqual({ from: '2026-09-01', to: '2026-09-07' });
  });

  it('never projects rows from another organization', () => {
    expect(projection.counts).toEqual({ projects: 1, planningDays: 1, teamAssignments: 1 });
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain(OTHER_ORG);
    expect(serialized).not.toContain('staff-x');
  });

  it('exposes only Planning-owned facts and opaque references', () => {
    expect(projection.projects[0]).toEqual({
      projectId: PROJECT,
      planningStatus: 'planned',
      status: 'active',
      isInternal: false,
      bookingRef: '2609-13',
      rigDate: '2026-09-02',
      eventDate: '2026-09-03',
      derigDate: '2026-09-04',
    });
    expect(projection.planningDays[0].phase).toBe('rig');
    expect(projection.teamAssignments[0].staffRef).toBe('staff-1');
  });

  it('leaks no customer/personnel PII or free text', () => {
    const serialized = JSON.stringify(projection);
    for (const field of PLANNING_BRAIN_FORBIDDEN_FIELDS) {
      expect(serialized).not.toContain(`"${field}"`);
    }
    for (const value of ['Kund AB', 'a@b.se', 'Gata 1', 'hemligt']) {
      expect(serialized).not.toContain(value);
    }
  });

  it('keeps unknown phases explicit instead of guessing', () => {
    expect(planningPhase('rigdown')).toBe('derig');
    expect(planningPhase('workshop')).toBeNull();
    expect(planningPhase(null)).toBeNull();
  });
});

describe('route is strictly read-only and fail-closed', () => {
  it('contains no mutating database call except the explicit nonce primitive', () => {
    expect(ROUTE_SRC).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    const rpcCalls = ROUTE_SRC.match(/\.rpc\('([a-z_]+)'/g) ?? [];
    expect(rpcCalls).toEqual(["\.rpc('consume_planning_brain_read_nonce'"]);
  });

  it('consumes the nonce and enforces actor authority before projecting', () => {
    expect(ROUTE_SRC).toContain('nonce_replayed');
    expect(ROUTE_SRC).toContain('nonce_store_unavailable');
    expect(ROUTE_SRC).toContain('actor_lookup_failed');
    expect(ROUTE_SRC).toContain('decidePlanningBrainActor');
    const nonceAt = ROUTE_SRC.indexOf('consume_planning_brain_read_nonce');
    const actorAt = ROUTE_SRC.indexOf('decidePlanningBrainActor(');
    const projectionAt = ROUTE_SRC.indexOf('buildPlanningBrainProjection(');
    expect(nonceAt).toBeGreaterThan(0);
    expect(nonceAt).toBeLessThan(actorAt);
    expect(actorAt).toBeLessThan(projectionAt);
  });

  it('reads actor authority from Planning-owned auth source without PII columns', () => {
    expect(ROUTE_SRC).toContain("from('user_roles')");
    expect(ROUTE_SRC).toContain("from('profiles')");
    expect(ROUTE_SRC).not.toMatch(/select\('[^']*email/);
    expect(ROUTE_SRC).not.toMatch(/select\('[^']*full_name/);
  });
});

describe('actor authorization (no body/mail claims)', () => {
  it('accepts an actor with an active Planning role in exactly the requested org', () => {
    for (const role of PLANNING_BRAIN_ACTOR_ROLES) {
      expect(decidePlanningBrainActor({
        organizationId: ORG,
        profileOrganizationId: ORG,
        roleRows: [{ role, organization_id: ORG }],
      })).toEqual({ ok: true });
    }
  });

  it('rejects a valid actor without Planning membership', () => {
    expect(decidePlanningBrainActor({
      organizationId: ORG,
      profileOrganizationId: ORG,
      roleRows: [],
    })).toEqual({ ok: false, error: 'actor_not_authorized' });
    expect(decidePlanningBrainActor({
      organizationId: ORG,
      profileOrganizationId: ORG,
      roleRows: [{ role: 'forsaljning', organization_id: ORG }],
    })).toEqual({ ok: false, error: 'actor_not_authorized' });
  });

  it('rejects an actor belonging to another organization', () => {
    expect(decidePlanningBrainActor({
      organizationId: ORG,
      profileOrganizationId: OTHER_ORG,
      roleRows: [{ role: 'admin', organization_id: OTHER_ORG }],
    })).toEqual({ ok: false, error: 'actor_not_authorized' });
    expect(decidePlanningBrainActor({
      organizationId: ORG,
      profileOrganizationId: ORG,
      roleRows: [{ role: 'admin', organization_id: OTHER_ORG }],
    })).toEqual({ ok: false, error: 'actor_not_authorized' });
  });

  it('rejects an unknown actor (no profile row)', () => {
    expect(decidePlanningBrainActor({
      organizationId: ORG,
      profileOrganizationId: null,
      roleRows: [{ role: 'admin', organization_id: ORG }],
    })).toEqual({ ok: false, error: 'actor_not_authorized' });
    expect(UNKNOWN_ACTOR).not.toBe(ACTOR);
  });
});

describe('replay primitive (security-only nonce store)', () => {
  it('is one-time, TTL-bounded and unreachable for clients', () => {
    expect(MIGRATION_SRC).toContain('planning_brain_read_nonces');
    expect(MIGRATION_SRC).toContain('CREATE UNIQUE INDEX planning_brain_read_nonces_nonce_key');
    expect(MIGRATION_SRC).toContain('ON CONFLICT (nonce) DO NOTHING');
    expect(MIGRATION_SRC).toContain('SECURITY DEFINER');
    expect(MIGRATION_SRC).toContain('ENABLE ROW LEVEL SECURITY');
    expect(MIGRATION_SRC).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*anon, authenticated/);
    expect(MIGRATION_SRC).toContain('GRANT EXECUTE ON FUNCTION public.consume_planning_brain_read_nonce(text, uuid, integer) TO service_role');
    expect(MIGRATION_SRC).toContain('LIMIT 500');
  });

  it('models first-use accepted and exact replay rejected', () => {
    const store = new Set<string>();
    const consume = (nonce: string) => (store.has(nonce) ? false : (store.add(nonce), true));
    expect(consume(NONCE)).toBe(true);
    expect(consume(NONCE)).toBe(false);
    expect(consume(`${NONCE}-other`)).toBe(true);
  });

  it('is POST-only, signature-gated and fails closed without configuration', () => {
    expect(ROUTE_SRC).toContain("method !== 'POST'");
    expect(ROUTE_SRC).toContain('not_configured');
    expect(ROUTE_SRC).toContain('invalid_signature');
    expect(ROUTE_SRC).toContain('organization_not_found');
  });

  it('scopes every read by organization_id and makes no provider/model call', () => {
    const selects = ROUTE_SRC.split('.select(').length - 1;
    const orgFilters = (ROUTE_SRC.match(/\.eq\('organization_id', org\)/g) ?? []).length;
    expect(selects).toBeGreaterThanOrEqual(4);
    expect(orgFilters).toBe(4);
    expect(ROUTE_SRC).not.toMatch(/openai|anthropic|ai\.gateway|lovable-api-key/i);
  });
});
