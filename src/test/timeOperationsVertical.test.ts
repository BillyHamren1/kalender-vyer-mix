// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import { handleRequest } from '../../supabase/functions/time-staff-auth/http';
import { SCHEMA, type Deps } from '../../supabase/functions/time-staff-auth/core';
import { deriveSigningKeyFromSeed, verifyServiceProofJwt, sha256Hex } from '../../supabase/functions/_shared/timeServiceProof';
import { handleWorkerAssignmentSync } from '../../supabase/functions/time-planning-proxy/workerAssignmentSync';
const ORG = '11111111-1111-4111-8111-111111111111';
const SID = 'STAFF-opaque-Fixture/17';
const secret = 'test-fixture-only-'.repeat(3);
const staff = { id: SID, organization_id: ORG, name: 'Fixture', email: null, tags: ['Montage'], is_active: true };
const account = { staff_id: SID, organization_id: ORG, username: 'fixture', password_hash: btoa('FixturePass') };
const deps = (): Deps => ({ findStaffIdsByEmail: async () => [], findAccountsByStaffId: async () => [account],
  findAccountsByUsername: async () => [account], getStaff: async () => staff, consumeRateLimit: async () => true, sha256Hex: async () => 'fixturehash' });
const request = (body: unknown, header: string | null = secret, url = 'https://operations.invalid') => new Request(url, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(header === null ? {} : { 'x-time-operations-secret': header }) }, body: JSON.stringify(body),
});
const credentials = { schema: SCHEMA, action: 'verify_credentials', identifier: 'fixture', password: 'FixturePass' };
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function dbFixture() {
  const reads: { table: string; filters: [string, unknown][] }[] = [];
  const event = { id: 'calendar-fixture', booking_id: 'booking-fixture', resource_id: 'team-fixture', source_date: '2026-11-15',
    event_type: 'rig', start_time: '2026-11-15T08:00:00Z', end_time: '2026-11-15T09:00:00Z', title: 'Fixture rig' };
  const db = { from(table: string) {
    const query = { table, filters: [] as [string, unknown][] }; reads.push(query);
    const rows = () => table === 'staff_members' ? [staff] : table === 'staff_accounts' ? [account]
      : table === 'staff_assignments' ? [{ assignment_date: event.source_date, team_id: event.resource_id, staff_id: SID }]
      : table === 'calendar_events' ? [event] : table === 'bookings' ? [{ id: event.booking_id, status: 'CONFIRMED', title: 'Fixture', organization_id: ORG }]
      : [];
    const q = { select: () => q, eq: (key: string, val: unknown) => { query.filters.push([key,val]); return q; },
      in: () => q, or: () => q, ilike: () => q, not: () => q, gte: () => q, lte: () => q, is: () => q, limit: () => q, order: () => q,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
    }; return q;
  } };
  return { db, reads };
}
describe('HTTP auth boundary', () => {
  it.each([null, 'wrong'])('rejects missing/wrong shared secret before any DB work', async (header) => {
    const factory = vi.fn(deps);
    expect((await handleRequest(request(credentials, header), secret, factory)).status).toBe(401);
    expect(factory).not.toHaveBeenCalled();
  });
  it('missing configuration fails closed', async () => {
    expect((await handleRequest(request(credentials), undefined, deps)).status).toBe(503);
  });
  it.each([{ ...credentials, unknown: true }, { ...credentials, password: 'x'.repeat(5000) }])('strict/oversize payload rejected %#', async (body) => {
    expect((await handleRequest(request(body), secret, deps)).status).toBe(400);
  });
  it('bounds actual streamed bytes without relying on declared length', async () => {
    const req = new Request('https://operations.invalid', { method: 'POST', headers: { 'content-type': 'application/json', 'x-time-operations-secret': secret },
      body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('x'.repeat(4097))); c.close(); } }), duplex: 'half' } as RequestInit);
    expect((await handleRequest(req, secret, deps)).status).toBe(400);
  });
  it('requires HTTPS and POST', async () => {
    expect((await handleRequest(request(credentials, secret, 'http://operations.invalid'), secret, deps)).status).toBe(400);
    expect((await handleRequest(new Request('https://operations.invalid'), secret, deps)).status).toBe(405);
  });
  it('current Montage permission is required in both credential and resolve paths', async () => {
    const d = deps(); d.getStaff = async () => ({ ...staff, tags: ['Lager'] });
    for (const body of [credentials, { schema: SCHEMA, action: 'resolve_active', organizationId: ORG, staffId: SID }])
      expect((await handleRequest(request(body), secret, () => d)).status).toBe(403);
  });
  it('rechecks deactivation and removed accounts after successful credential verification', async () => {
    const d = deps();
    expect((await handleRequest(request(credentials), secret, () => d)).status).toBe(200);
    const active = { schema: SCHEMA, action: 'resolve_active', organizationId: ORG, staffId: SID };
    d.getStaff = async () => ({ ...staff, is_active: false });
    expect((await handleRequest(request(active), secret, () => d)).status).toBe(403);
    d.getStaff = async () => staff;
    d.findAccountsByStaffId = async () => [];
    expect((await handleRequest(request(active), secret, () => d)).status).toBe(403);
  });
  it('DB outage is not a successful login', async () => {
    const d = deps(); d.findAccountsByUsername = async () => { throw Error('down'); };
    expect((await handleRequest(request(credentials), secret, () => d)).status).toBe(503);
  });
});
describe('synthetic vertical path: credential verification → verified identity → actual signed projection', () => {
  it('keeps non-UUID identity through signed assignment with no email lookup or session mutation', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const auth = await handleRequest(request(credentials), secret, deps);
    expect(auth.status).toBe(200);
    const identity = (await auth.json()).staff;
    expect(identity.staffId).toBe(SID);
    const { db, reads } = dbFixture();
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/identity-context')) return new Response(JSON.stringify({ domain: 'personnel', activationMode: 'read_only',
        operationsStaffId: identity.staffId, organizationId: identity.organizationId }), { headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ data: { accepted: true } }), { headers: { 'content-type': 'application/json' } });
    }));
    const context = { admin: db, authorization: 'Bearer synthetic-worker-fixture', adapterUrl: 'https://time.fixture.invalid/functions/v1',
      anonKey: 'fixture-public', signingSeed: 'fixture-signing-seed-only-not-production-123', timeOrganizationId: ORG };
    const response = await handleWorkerAssignmentSync(context);
    expect(response.status).toBe(200);
    const result = await response.json(); expect(result.data.assignmentCount).toBe(1);
    expect(calls).toHaveLength(2);
    const payload = JSON.parse(String(calls[1].init?.body));
    expect(payload.personnelId).toBe(SID);
    expect(payload.assignments[0].workerExternalId).toBe(SID);
    expect(payload.assignments[0].sourceAssignmentId).toBe('calendar-fixture');
    const proof = (calls[1].init?.headers as Record<string, string>)['x-planning-service-proof'];
    const { publicJwk } = await deriveSigningKeyFromSeed(context.signingSeed);
    expect(await verifyServiceProofJwt(publicJwk, proof, { expectedBodySha256: await sha256Hex(String(calls[1].init?.body)) })).toMatchObject({ ok: true, claims: { organizationId: ORG, operation: 'worker.assignments.sync' } });
    expect(reads.find(r => r.table === 'staff_members')?.filters).toEqual([['id', SID], ['organization_id', ORG], ['is_active', true]]);
    expect(reads.find(r => r.table === 'staff_accounts')?.filters).toEqual([['staff_id', SID], ['organization_id', ORG]]);
    expect(reads.find(r => r.table === 'staff_assignments')?.filters).toContainEqual(['staff_id', SID]);
    expect(calls.some(c => c.url.includes('/auth/v1/user'))).toBe(false);
    // A reopening/retry yields the same canonical assignment binding (idempotency owner is unchanged).
    expect((await handleWorkerAssignmentSync(context)).status).toBe(200);
    const again = JSON.parse(String(calls[3].init?.body));
    expect(again.assignments[0].sourceAssignmentId).toBe(payload.assignments[0].sourceAssignmentId);
    expect(again.assignments[0].sourceVersion).toBe(payload.assignments[0].sourceVersion);
  });
  it('Time 403 never reads Operations or pushes assignments', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })));
    const { db, reads } = dbFixture();
    const res = await handleWorkerAssignmentSync({ admin: db, authorization: 'Bearer fixture', adapterUrl: 'https://time.fixture.invalid/functions/v1', signingSeed: 'fixture' });
    expect(res.status).toBe(403); expect(reads).toHaveLength(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
